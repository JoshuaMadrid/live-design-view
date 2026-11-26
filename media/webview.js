// @ts-check
// Live Design View — canvas webview.
// The user's page renders in a same-origin <iframe>; this script draws the overlay (hover,
// selection, element HUD, drop indicators, placement popover) and talks to the extension.
// It never edits the source itself: every change is a message the extension turns into a WorkspaceEdit.
(function () {
  'use strict';
  // @ts-ignore
  const vscode = acquireVsCodeApi();
  const post = (/** @type {any} */ m) => vscode.postMessage(m);
  /** @type {any} */ (window).ldPuppetPage = { doc: () => doc(), frame: () => state.front };
  /** @type {any} */ (window).ldPuppetDone = (id) => post({ type: 'puppetDone', id });
  const SHELL_NONCE = (document.currentScript && /** @type {HTMLScriptElement} */ (document.currentScript).nonce) || '';
  window.addEventListener('error', (e) => post({ type: 'log', text: 'error: ' + e.message + ' @' + e.lineno }));

  // The worker-served blank page VS Code itself uses for webview content frames. Only frames the
  // webview's service worker controls can load webview resource URLs (CSS, images, scripts);
  // srcdoc and blob: frames can't, so we load this page and document.write() the site into it.
  const FAKE_PAGE = new URL(
    'fake.html?id=' + encodeURIComponent(new URLSearchParams(location.search).get('id') || ''),
    location.href,
  ).toString();

  const DRAG_TYPE = 'application/x-live-design-tag';
  const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
  const NO_CHILDREN = new Set([...VOID, 'textarea', 'script', 'style', 'title', 'iframe', 'select', 'option', 'noscript', 'template', 'svg', 'math', 'head', 'html']);
  const NO_SIBLINGS = new Set(['html', 'head', 'body']);
  const NOT_TEXT_EDITABLE = new Set(['html', 'head', 'body', 'script', 'style', 'title', 'meta', 'link', 'img', 'input', 'br', 'hr', 'textarea', 'select', 'option', 'iframe', 'video', 'audio', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'ul', 'ol', 'svg']);

  // Placement glyphs: outlined "+" tag = the new element, filled tag = the selection.
  const NEW = (x, y) => `<path d="M${x} ${y}h22l6 6-6 6h-22z" class="o"/><path d="M${x + 11} ${y + 3}v6M${x + 8} ${y + 6}h6" class="o"/>`;
  const SEL = (x, y) => `<path d="M${x} ${y}h22l6 6-6 6h-22z" class="f"/>`;
  const svg = (inner) => `<svg viewBox="0 0 44 34" width="44" height="34" aria-hidden="true">${inner}</svg>`;
  const PLACES = [
    { pos: 'before', label: 'Before', key: 'b', icon: svg(NEW(6, 2) + SEL(6, 19)) },
    { pos: 'after', label: 'After', key: 'a', icon: svg(SEL(6, 2) + NEW(6, 19)) },
    { pos: 'inside-last', label: 'Inside', key: 'i', icon: svg(SEL(2, 2) + '<path d="M8 14v11h5" class="o"/>' + NEW(14, 19)) },
    { pos: 'wrap', label: 'Wrap', key: 'w', icon: svg(NEW(2, 2) + '<path d="M8 14v11h5" class="o"/>' + SEL(14, 19)) },
  ];

  const $ = (/** @type {string} */ s) => /** @type {HTMLElement} */ (document.querySelector(s));
  const els = {
    frames: $('#frames'),
    canvas: $('#canvas'),
    hoverBox: $('#hoverBox'),
    selBox: $('#selBox'),
    hoverLabel: $('#hoverLabel'),
    dropLine: $('#dropLine'),
    dropBox: $('#dropBox'),
    hud: $('#hud'),
    hudTag: $('#hudTag'),
    hudAdd: $('#hudAdd'),
    hudActions: $('#hudActions'),
    hudInput: /** @type {HTMLInputElement} */ (document.querySelector('#hudInput')),
    hudNames: $('#hudNames'),
    hudEdit: $('#hudEdit'),
    hudHints: $('#hudHints'),
    placeMenu: $('#placeMenu'),
    crumbs: $('#crumbs'),
    status: $('#status'),
    warning: $('#warning'),
    warningText: $('#warningText'),
  };

  const saved = vscode.getState() || {};
  const state = {
    /** @type {HTMLIFrameElement | null} */ front: null,
    /** @type {HTMLIFrameElement | null} */ loading: null,
    latestVersion: 0,
    /** @type {number | null} */ selectedId: null,
    /** @type {any} */ info: null,
    /** @type {Element | null} */ hoverEl: null,
    interact: false,
    /** audit findings with canvas ids: { id, impact, category, message } */
    audit: [],
    pageLoc: "",
    scroll: saved.scroll || { x: 0, y: 0 },
    dismissedWarning: '',
    /** @type {null | { el: HTMLElement, originals: string[], html: string, ids: string }} */ editing: null,
    /** @type {null | { key: string, tag: string, name: string }} */ menu: null,
    /** @type {any} */ dropTarget: null,
  };
  const persist = () => vscode.setState({ ...(vscode.getState() || {}), scroll: state.scroll });

  // ---------------------------------------------------------------------------
  // Messages from the extension
  // ---------------------------------------------------------------------------

  window.addEventListener('message', (ev) => {
    const m = ev.data;
    switch (m.type) {
      case 'pageProps':
        openPageSetup(m.values, m.isNew);
        break;
      case 'init':
        setMode(m.mode);
        initInsertBar(m);
        break;
      case 'render':
        render(m);
        break;
      case 'scrollToAnchor':
        scrollToAnchor(m.id);
        break;
      case 'names':
        hudNameData = m;
        if (!els.hudEdit.hidden) showHints();
        break;
      case 'selection': {
        if (m.info && state.selectedId !== null && m.info.id !== state.selectedId) closeRulePrompt(false);
        state.info = m.info;
        state.selectedId = m.info ? m.info.id : null;
        if (state.menu && !m.info) closeMenu();
        const el = elById(state.selectedId);
        if (m.scroll && el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        drawSelection();
        drawAllLayouts();
        buildCrumbs();
        break;
      }
      case 'place':
        openMenu(m);
        break;
      case 'startEdit': {
        const el = elById(m.id);
        if (el) startEdit(/** @type {HTMLElement} */ (el));
        break;
      }
      case 'message':
        flash(m.text);
        break;
      case 'mode':
        setMode(m.mode);
        break;
      case 'test':
        if (m.action && m.action.kind === 'puppet') { const w = /** @type {any} */ (window); if (w.ldPuppet) w.ldPuppet(m.action); break; }
        runTest(m.action);
        break;
      case 'query':
        Promise.resolve(answerQuery(m)).then(
          (result) => post({ type: 'queryResult', reqId: m.reqId, result }),
          (err) => post({ type: 'queryResult', reqId: m.reqId, result: { error: String(err && err.message || err) } }),
        );
        break;
      case 'auditMarkers':
        state.audit = m.items || [];
        showAuditBar(m);
        drawAll();
        break;
    }
  });

  // ---------------------------------------------------------------------------
  // Rendering (double-buffered iframes so re-renders don't flash)
  // ---------------------------------------------------------------------------

  function render(m) {
    state.latestVersion = m.version;
    if (state.front && state.front.contentWindow) {
      state.scroll = { x: state.front.contentWindow.scrollX, y: state.front.contentWindow.scrollY };
    }
    if (state.loading) state.loading.remove();
    state.editing = null;

    const ifr = document.createElement('iframe');
    ifr.className = 'page loading';
    ifr.title = 'page';
    state.loading = ifr;
    els.frames.appendChild(ifr);

    const onLoaded = () => {
      if (m.version !== state.latestVersion) return;
      state.loading = null;
      const win = ifr.contentWindow;
      if (win) {
        try {
          win.scrollTo({ left: state.scroll.x, top: state.scroll.y, behavior: 'instant' });
        } catch {
          win.scrollTo(state.scroll.x, state.scroll.y);
        }
      }
      const fd = ifr.contentDocument;
      if (fd && fd.body && !fd.body.hasAttribute('data-ld-id') && m.bodyId !== null && m.bodyId !== undefined) {
        fd.body.setAttribute('data-ld-id', String(m.bodyId));
      }
      wireFrame(ifr);
      if (state.front) state.front.remove();
      state.front = ifr;
      ifr.classList.remove('loading');
      state.hoverEl = null;
      state.selectedId = m.selectId !== null && m.selectId !== undefined ? m.selectId : null;
      drawAll();
      persist();
      reportStats(m.version);
      state.pageEmpty = !!m.empty;
      $('#emptyState').hidden = !m.empty || !$('#pageSetup').hidden;
    };

    ifr.addEventListener(
      'load',
      () => {
        if (m.version !== state.latestVersion) return;
        const d = ifr.contentDocument;
        if (!d) return post({ type: 'log', text: 'page frame has no document' });
        d.open();
        // The served page has a <base> (the page's folder), so href="#x" would resolve to another URL
        // than the frame's own; scripts that compare the two (jQuery UI tabs, scrollspy…) then treat
        // same-page links as external. Point them at the frame's real address instead (served copy only).
        let loc = '';
        try { loc = d.location.href.split('#')[0]; } catch { loc = ''; }
        state.pageLoc = loc;
        const html = loc ? m.html.replace(/(<(?:a|area)\b[^>]*?\shref\s*=\s*)(["'])#/gi, (_, pre, q) => `${pre}${q}${loc}#`) : m.html;
        d.write(html);
        d.close();
        // Fire once the written document (and its CSS/images/scripts) has finished loading.
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          onLoaded();
        };
        ifr.addEventListener('load', finish, { once: true });
        const poll = () => {
          if (done) return;
          if (ifr.contentDocument && ifr.contentDocument.readyState === 'complete') finish();
          else setTimeout(poll, 30);
        };
        setTimeout(poll, 30);
      },
      { once: true },
    );
    ifr.src = FAKE_PAGE;
    showWarning(m.warning);
  }

  function doc() {
    return state.front && state.front.contentDocument;
  }

  function elById(id) {
    const d = doc();
    return id === null || id === undefined || !d ? null : d.querySelector(`[data-ld-id="${id}"]`);
  }

  /** Nearest element that maps to source; blank space (the <html> element) counts as <body>. */
  function ldTarget(node) {
    let el = node && node.nodeType === 1 ? node : node && node.parentElement;
    while (el && !el.hasAttribute('data-ld-id')) el = el.parentElement;
    const d = doc();
    if ((!el || el.tagName === 'HTML') && node && d && d.body && d.body.hasAttribute('data-ld-id')) return d.body;
    return el;
  }

  function ldId(el) {
    return el ? Number(el.getAttribute('data-ld-id')) : null;
  }

  function reportStats(version) {
    const d = doc();
    const win = /** @type {any} */ (state.front && state.front.contentWindow);
    if (!d || !win) return;
    const links = [...d.querySelectorAll('link[rel~="stylesheet"]')];
    const imgs = [...d.images];
    post({
      type: 'rendered',
      stats: {
        version,
        ldIds: d.querySelectorAll('[data-ld-id]').length,
        stylesheets: links.length,
        stylesheetsWithRules: links.filter((l) => /** @type {HTMLLinkElement} */ (l).sheet).length,
        images: imgs.length,
        imagesLoaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
        jquery: typeof win.jQuery === 'function',
        scriptMarkers: [String(win.testSiteReady || ''), win.getComputedStyle(d.body).backgroundColor],
        selectedId: state.selectedId,
        scrollY: win.scrollY,
        resources: win.performance.getEntriesByType('resource').map((e) => `${/** @type {any} */ (e).responseStatus ?? '?'} ${e.name}`),
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Frame events: hover, select, inline edit, drops
  // ---------------------------------------------------------------------------

  function wireFrame(ifr) {
    const d = ifr.contentDocument;
    const win = ifr.contentWindow;
    if (!d || !win) return;
    const offset = () => {
      const r = ifr.getBoundingClientRect();
      return { x: r.left, y: r.top };
    };

    d.addEventListener(
      'mousemove',
      (e) => {
        if (state.interact) return;
        const t = ldTarget(e.target);
        if (t !== state.hoverEl) {
          state.hoverEl = t;
          drawHover();
        }
      },
      true,
    );
    d.addEventListener('mouseleave', () => {
      state.hoverEl = null;
      drawHover();
    });
    d.addEventListener(
      'mousedown',
      (e) => {
        if (state.interact) return;
        if (state.editing && state.editing.el.contains(/** @type {Node} */ (e.target))) return;
        // Keep focus in the shell so VS Code shortcuts (save, undo) keep working.
        e.preventDefault();
        const t = ldTarget(e.target);
        const off = ifr.getBoundingClientRect();
        if (e.button === 0 && t && ldId(t) === state.selectedId && t.tagName !== 'BODY' && t.tagName !== 'HTML') {
          beginElementDrag(t, e.clientX + off.left, e.clientY + off.top);
        }
        if (document.activeElement && document.activeElement !== document.body) {
          /** @type {HTMLElement} */ (document.activeElement).blur();
        }
      },
      true,
    );
    d.addEventListener('mousemove', (e) => {
      if (!elDrag) return;
      const off = ifr.getBoundingClientRect();
      moveElementDrag(e.clientX + off.left, e.clientY + off.top);
    }, true);
    d.addEventListener('mouseup', (e) => {
      if (!elDrag) return;
      const off = ifr.getBoundingClientRect();
      endElementDrag(e.clientX + off.left, e.clientY + off.top);
    }, true);
    d.addEventListener(
      'click',
      (e) => {
        if (state.interact) return;
        if (suppressClick) {
          suppressClick = false;
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (state.editing && state.editing.el.contains(/** @type {Node} */ (e.target))) return;
        e.preventDefault();
        e.stopPropagation();
        // ⌘/Ctrl-click a link follows it .
        const link = (e.metaKey || e.ctrlKey) && /** @type {Element} */ (e.target).closest && /** @type {Element} */ (e.target).closest('a[href]');
        if (link) return followFromPage(link, e);
        if (state.editing) commitEdit();
        closeMenu();
        selectEl(ldTarget(e.target));
      },
      true,
    );
    // Interact mode: links the page didn't handle itself (tabs, menus…) are followed by the extension
    // instead of navigating the frame away from the document being edited.
    d.addEventListener('click', (e) => {
      if (!state.interact || e.defaultPrevented) return;
      const link = /** @type {Element} */ (e.target).closest && /** @type {Element} */ (e.target).closest('a[href]');
      if (link) followFromPage(link, e);
    });
    d.addEventListener(
      'dblclick',
      (e) => {
        if (state.interact) return;
        e.preventDefault();
        e.stopPropagation();
        const t = ldTarget(e.target);
        if (t) startEdit(/** @type {HTMLElement} */ (t));
      },
      true,
    );
    d.addEventListener('submit', (e) => !state.interact && e.preventDefault(), true);
    // Form testing (Interact mode): the browser validates as usual (required, type=email, pattern…);
    // a valid submit is caught and shown instead of navigating the frame away.
    let invalidShown = 0;
    d.addEventListener('invalid', (e) => {
      if (!state.interact) return;
      const f = /** @type {HTMLInputElement} */ (e.target);
      const now = Date.now();
      if (now - invalidShown < 300) return; // only the first invalid field per attempt
      invalidShown = now;
      const label = (f.labels && f.labels[0] && f.labels[0].textContent.trim()) || f.getAttribute('aria-label') || f.name || f.id || f.tagName.toLowerCase();
      flash(`${label}: ${f.validationMessage}`);
      post({ type: 'formInvalid', field: f.name || f.id || '', label, message: f.validationMessage });
    }, true);
    d.addEventListener('submit', (e) => {
      if (!state.interact || e.defaultPrevented) return;
      e.preventDefault();
      const form = /** @type {HTMLFormElement} */ (e.target);
      let data;
      try { data = new FormData(form, /** @type {any} */ (e).submitter || undefined); } catch { data = new FormData(form); }
      const fields = [...data.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : `(file) ${v.name}`]);
      flash(`Form OK — would ${(form.getAttribute('method') || 'get').toUpperCase()} ${fields.length} field${fields.length === 1 ? '' : 's'} to ${form.getAttribute('action') || '(no action)'}`);
      post({ type: 'formSubmit', action: form.getAttribute('action') || '', method: (form.getAttribute('method') || 'get').toUpperCase(), fields, id: ldId(form) });
    });
    d.addEventListener('dragstart', (e) => !state.interact && e.preventDefault(), true);
    d.addEventListener('keydown', onKey, true);
    // Drops from the Elements panel land on the page frame.
    d.addEventListener('dragenter', (e) => onDragOver(e, offset()), true);
    d.addEventListener('dragover', (e) => onDragOver(e, offset()), true);
    d.addEventListener('dragleave', (e) => onDragLeave(e), true);
    d.addEventListener('drop', (e) => onDrop(e, offset()), true);
    win.addEventListener('scroll', () => {
      state.scroll = { x: win.scrollX, y: win.scrollY };
      drawAll();
    });
    win.addEventListener('resize', drawAll);
  }

  function selectEl(el) {
    const id = ldId(el);
    state.selectedId = id;
    drawSelection();
    post({ type: 'select', id });
  }

  // ---------------------------------------------------------------------------
  // Overlay drawing
  // ---------------------------------------------------------------------------

  /** Element rect in canvas coordinates. */
  function rectOf(el) {
    if (!el || !el.isConnected || !state.front) return null;
    let r = el.getBoundingClientRect();
    if (el.tagName === 'BODY') {
      // A short page's <body> is tiny; show it as the whole page.
      const win = el.ownerDocument.defaultView;
      const h = Math.max(r.height, el.ownerDocument.documentElement.scrollHeight - (win ? win.scrollY : 0) - r.top);
      r = { left: r.left, top: r.top, width: r.width, height: h };
    }
    const fr = state.front.getBoundingClientRect();
    const cr = els.canvas.getBoundingClientRect();
    return { left: fr.left - cr.left + r.left, top: fr.top - cr.top + r.top, width: r.width, height: r.height };
  }

  function placeBox(box, el) {
    const r = rectOf(el);
    if (!r) {
      box.hidden = true;
      return null;
    }
    box.hidden = false;
    box.style.left = r.left + 'px';
    box.style.top = r.top + 'px';
    box.style.width = Math.max(r.width, 2) + 'px';
    box.style.height = Math.max(r.height, 2) + 'px';
    return r;
  }

  /** Follows a link clicked on the page: #anchors scroll here, anything else goes to the extension. */
  function followFromPage(a, e) {
    let raw = (a.getAttribute('href') || '').trim();
    if (state.pageLoc && raw.startsWith(state.pageLoc + '#')) raw = raw.slice(state.pageLoc.length);
    if (/^javascript:/i.test(raw)) return;
    e.preventDefault();
    if (raw.startsWith('#') || raw === '') {
      if (raw.length > 1) scrollToAnchor(raw.slice(1));
      return;
    }
    flash('Following ' + raw + ' …');
    post({ type: 'followLink', href: raw });
  }

  function scrollToAnchor(id) {
    const d = doc();
    if (!d) return;
    let name = id;
    try { name = decodeURIComponent(id); } catch { /* keep raw */ }
    const el = d.getElementById(name) || d.querySelector(`a[name="${CSS.escape(name)}"]`);
    if (el) el.scrollIntoView({ block: 'start' });
    else flash(`No element with id="${name}" on this page.`);
  }

  function elLabel(el) {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean);
    if (cls.length) s += '.' + cls.join('.');
    return s;
  }

  function drawHover() {
    const el = state.hoverEl;
    const isSel = el && ldId(el) === state.selectedId;
    const r = placeBox(els.hoverBox, isSel ? null : el);
    if (r && el) {
      els.hoverLabel.hidden = false;
      els.hoverLabel.textContent = elLabel(el);
      els.hoverLabel.style.left = Math.max(0, r.left) + 'px';
      els.hoverLabel.style.top = Math.max(0, r.top - 17 < 0 ? r.top + r.height : r.top - 17) + 'px';
    } else els.hoverLabel.hidden = true;
  }

  function drawSelection() {
    const el = elById(state.selectedId);
    const r = placeBox(els.selBox, el);
    // Selection chip (tag + class / ID pills).
    if (r && el) {
      els.hud.hidden = false;
      els.hudTag.textContent = el.tagName.toLowerCase();
      buildHudNames(el);
      const cr = els.canvas.getBoundingClientRect();
      const below = r.top + r.height;
      // A selected grid shows column headers above it — put the chip underneath instead.
      const isGrid = boxModelOn && /grid/.test(el.ownerDocument.defaultView.getComputedStyle(el).display);
      let top = isGrid ? below + 4 : r.top - 22;
      if (top < 0) top = below + 22 < cr.height ? below : Math.max(0, r.top);
      els.hud.style.left = Math.max(0, Math.min(r.left, cr.width - els.hud.offsetWidth - 4)) + 'px';
      els.hud.style.top = top + 'px';
      if (!els.hudEdit.hidden) positionHudEdit();
    } else {
      els.hud.hidden = true;
      hideHudInput();
    }
    if (state.menu) positionMenu();
    drawBoxModel(el);
    drawHover();
  }

  // ---------------------------------------------------------------------------
  // Box model overlay: margin, border, padding, flex/grid gaps and grid tracks
  // ---------------------------------------------------------------------------

  let boxModelOn = saved.boxModel !== false;
  const bm = document.createElement('div');
  bm.id = 'boxModel';
  bm.setAttribute('aria-hidden', 'true');
  $('#overlay').prepend(bm);
  /** "Show all" layer: every grid / flex container on the page, one colour each. */
  let showAll = saved.showAllLayouts === true;
  const allLayer = document.createElement('div');
  allLayer.id = 'layoutAll';
  $('#overlay').prepend(allLayer);

  /** Edit info for interactive overlay pieces (gap / margin / padding strips, grid headers). */
  const bmEdit = new WeakMap();
  let scrub = null; // active drag on a handle
  let bmInput = null; // open inline number editor

  function bmRect(cls, x, y, w, hgt, labelText, edit) {
    if (w < 0.5 || hgt < 0.5) return null;
    const d = document.createElement('div');
    d.className = 'bm ' + cls + (edit ? ' editable' : '');
    d.style.left = x + 'px';
    d.style.top = y + 'px';
    d.style.width = w + 'px';
    d.style.height = hgt + 'px';
    if (labelText && w >= 4 && hgt >= 4) {
      const l = document.createElement('span');
      l.className = 'bm-label';
      l.textContent = labelText;
      d.appendChild(l);
    }
    if (edit) {
      bmEdit.set(d, edit);
      d.setAttribute('data-tip', `${edit.title}\nClick to type · drag to change (Shift ×10${edit.pair ? ', Alt both sides' : ''})`);
    }
    bm.appendChild(d);
    return d;
  }

  const fmt = (n) => String(Math.round(n * 10) / 10);

  /**
   * Four strips between an outer and inner box. `props` are the CSS properties per side
   * (top, right, bottom, left); `outward` says whether dragging away from the element grows it.
   */
  function strips(cls, o, i, sizes, props, name, outward) {
    const [t, r, b, l] = sizes;
    const side = (k, x, y, w, hh, v, axis, sign) => bmRect(cls, x, y, w, hh, v >= 1 ? fmt(v) : '', props && {
      props: [props[k]], pair: props[(k + 2) % 4], value: v, axis, sign: outward ? sign : -sign, min: cls === 'bm-margin' ? -9999 : 0,
      title: `${name} ${['top', 'right', 'bottom', 'left'][k]}`,
    });
    side(0, o.left, o.top, o.width, i.top - o.top, t, 'y', -1);
    side(2, o.left, i.top + i.height, o.width, o.top + o.height - (i.top + i.height), b, 'y', 1);
    side(3, o.left, i.top, i.left - o.left, i.height, l, 'x', -1);
    side(1, i.left + i.width, i.top, o.left + o.width - (i.left + i.width), i.height, r, 'x', 1);
  }

  function drawBoxModel(el) {
    if (scrub) return; // keep the handle under the pointer while dragging
    closeBmInput(false);
    bm.innerHTML = '';
    if (!boxModelOn || !el || el.tagName === 'HTML' || state.editing || state.interact) return;
    const win = el.ownerDocument.defaultView;
    const r = rectOf(el);
    if (!win || !r) return;
    const cs = win.getComputedStyle(el);
    const n = (p) => parseFloat(cs.getPropertyValue(p)) || 0;
    const m = [n('margin-top'), n('margin-right'), n('margin-bottom'), n('margin-left')];
    const bw = [n('border-top-width'), n('border-right-width'), n('border-bottom-width'), n('border-left-width')];
    const pd = [n('padding-top'), n('padding-right'), n('padding-bottom'), n('padding-left')];
    const inset = (box, [t, rr, b, l]) => ({ left: box.left + l, top: box.top + t, width: Math.max(0, box.width - l - rr), height: Math.max(0, box.height - t - b) });
    const outset = (box, [t, rr, b, l]) => ({ left: box.left - l, top: box.top - t, width: box.width + l + rr, height: box.height + t + b });
    const fr = state.front.getBoundingClientRect();
    const cr = els.canvas.getBoundingClientRect();
    const toCanvas = (b) => ({ left: fr.left - cr.left + b.left, top: fr.top - cr.top + b.top, width: b.width, height: b.height });
    const borderBox = el.tagName === 'BODY' ? toCanvas(el.getBoundingClientRect()) : r;
    const paddingBox = inset(borderBox, bw);
    const contentBox = inset(paddingBox, pd);
    const SIDES = (p) => [p + '-top', p + '-right', p + '-bottom', p + '-left'];
    strips('bm-margin', outset(borderBox, m), borderBox, m, el.tagName === 'BODY' ? null : SIDES('margin'), 'Margin', true);
    strips('bm-border', borderBox, paddingBox, bw, null, 'Border', true);
    strips('bm-padding', paddingBox, contentBox, pd, SIDES('padding'), 'Padding', false);

    const display = cs.display;
    const kids = [...el.children].filter((c) => {
      const k = win.getComputedStyle(c);
      return k.display !== 'none' && k.position !== 'absolute' && k.position !== 'fixed';
    });
    const between = /space-(between|around|evenly)/.test(cs.justifyContent);

    if (/grid/.test(display)) drawGrid(el, borderBox);
    else if (/flex/.test(display) && kids.length > 1) {
      const column = /column/.test(cs.flexDirection);
      const rects = kids.map((c) => toCanvas(c.getBoundingClientRect()));
      const lines = [];
      const span = (b) => (column ? [b.left, b.left + b.width] : [b.top, b.top + b.height]);
      for (const b of rects) {
        const [s0, s1] = span(b);
        const line = cs.flexWrap === 'nowrap' ? lines[0] : lines.find((L) => s0 < L.s1 - 1 && s1 > L.s0 + 1);
        if (line) {
          line.items.push(b);
          line.s0 = Math.min(line.s0, s0);
          line.s1 = Math.max(line.s1, s1);
        } else lines.push({ s0, s1, items: [b] });
      }
      const mainGap = column ? n('row-gap') : n('column-gap');
      // Dragging the space between items sets the main-axis gap (and leaves "space between" mode).
      const mainEdit = (g) => ({
        props: [cs.flexWrap === 'nowrap' ? 'gap' : column ? 'row-gap' : 'column-gap'], value: between ? Math.round(g) : mainGap, axis: column ? 'y' : 'x', sign: 1, min: 0,
        title: between ? 'Gap (space between)' : 'Gap', extra: between ? { 'justify-content': '' } : null,
      });
      for (const L of lines) {
        const items = L.items.slice().sort((a, b) => (column ? a.top - b.top : a.left - b.left));
        for (let i = 0; i < items.length - 1; i++) {
          const a = items[i];
          const b = items[i + 1];
          if (column) {
            const gy = a.top + a.height;
            const gh = b.top - gy;
            if (gh >= 1) bmRect('bm-gap', contentBox.left, gy, contentBox.width, gh, fmt(gh), mainEdit(gh));
          } else {
            const gx = a.left + a.width;
            const gw = b.left - gx;
            const top = Math.min(a.top, b.top);
            const bottom = Math.max(a.top + a.height, b.top + b.height);
            if (gw >= 1) bmRect('bm-gap', gx, top, gw, bottom - top, fmt(gw), mainEdit(gw));
          }
        }
      }
      const sorted = lines.slice().sort((a, b) => a.s0 - b.s0);
      const crossEdit = { props: [column ? 'column-gap' : 'row-gap'], value: column ? n('column-gap') : n('row-gap'), axis: column ? 'x' : 'y', sign: 1, min: 0, title: 'Gap between lines' };
      for (let i = 0; i < sorted.length - 1; i++) {
        const g0 = sorted[i].s1;
        const g = sorted[i + 1].s0 - g0;
        if (g < 1) continue;
        if (column) bmRect('bm-gap', g0, contentBox.top, g, contentBox.height, fmt(g), crossEdit);
        else bmRect('bm-gap', contentBox.left, g0, contentBox.width, g, fmt(g), crossEdit);
      }
    }
    if (/flex|grid/.test(display)) for (const c of kids) {
      const b = toCanvas(c.getBoundingClientRect());
      bmRect('bm-item', b.left, b.top, b.width, b.height, '');
    }
  }

  // ---- Grid inspector (devtools-style overlay + track headers) ----

  /** Border box of a page element in canvas coordinates. */
  function canvasBox(el) {
    const fr = state.front.getBoundingClientRect();
    const cr = els.canvas.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { left: fr.left - cr.left + r.left, top: fr.top - cr.top + r.top, width: r.width, height: r.height };
  }

  /**
   * Track geometry of a grid in canvas coordinates: [{ start, size, parentIndex? }] per axis.
   * A subgridded axis has no tracks of its own (the browser reports "subgrid"); it uses the
   * parent grid's tracks that it spans, clipped to its content box.
   */
  function gridGeometry(el, depth = 0) {
    const win = el.ownerDocument.defaultView;
    const cs = win.getComputedStyle(el);
    const n = (p) => parseFloat(cs.getPropertyValue(p)) || 0;
    const border = canvasBox(el);
    const bw = [n('border-top-width'), n('border-right-width'), n('border-bottom-width'), n('border-left-width')];
    const pd = [n('padding-top'), n('padding-right'), n('padding-bottom'), n('padding-left')];
    const content = {
      left: border.left + bw[3] + pd[3], top: border.top + bw[0] + pd[0],
      width: Math.max(0, border.width - bw[1] - bw[3] - pd[1] - pd[3]), height: Math.max(0, border.height - bw[0] - bw[2] - pd[0] - pd[2]),
    };
    const cg = n('column-gap');
    const rg = n('row-gap');
    const subC = /^\s*subgrid/.test(cs.gridTemplateColumns);
    const subR = /^\s*subgrid/.test(cs.gridTemplateRows);
    const sizes = (v) => v.split(/\s+/).filter((t) => /^-?[\d.]+px$/.test(t)).map(parseFloat);
    const own = (vals, gap, start, size, mode) => {
      const used = vals.reduce((x, y) => x + y, 0) + gap * Math.max(0, vals.length - 1);
      let p = start + (/center/.test(mode) ? (size - used) / 2 : /end/.test(mode) ? size - used : 0) * (vals.length ? 1 : 0);
      return vals.map((v) => { const t = { start: p, size: v }; p += v + gap; return t; });
    };
    let cols = subC ? [] : own(sizes(cs.gridTemplateColumns), cg, content.left, content.width, cs.justifyContent);
    let rows = subR ? [] : own(sizes(cs.gridTemplateRows), rg, content.top, content.height, cs.alignContent);
    const parent = el.parentElement;
    if ((subC || subR) && parent && depth < 6 && /grid/.test(win.getComputedStyle(parent).display)) {
      const pg = gridGeometry(parent, depth + 1);
      const clip = (tracks, lo, hi) => tracks
        .map((t, i) => ({ t, i }))
        .filter(({ t }) => t.start + t.size > lo + 0.5 && t.start < hi - 0.5)
        .map(({ t, i }) => { const s0 = Math.max(t.start, lo); return { start: s0, size: Math.min(t.start + t.size, hi) - s0, parentIndex: i }; });
      if (subC) cols = clip(pg.cols, content.left, content.left + content.width);
      if (subR) rows = clip(pg.rows, content.top, content.top + content.height);
    }
    return { cs, border, content, cols, rows, cg, rg, subC, subR, parent: subC || subR ? parent : null };
  }

  function drawGrid(el, border) {
    const g = gridGeometry(el);
    const box = g.content;
    const HEAD = 16;
    const headTop = border.top - HEAD - 3 < 0 ? border.top + 2 : border.top - HEAD - 3;
    const headLeft = border.left - HEAD - 3 < 0 ? border.left + 2 : border.left - HEAD - 3;
    const axis = (tracks, kind, sub, gapProp) => {
      const labels = tracks.map((t) => fmt(t.size) + 'px');
      const isCol = kind === 'col';
      tracks.forEach((t, i) => {
        if (isCol) bmRect('bm-track' + (sub ? ' sub' : ''), t.start, box.top, t.size, box.height, '');
        else bmRect('bm-track' + (sub ? ' sub' : ''), box.left, t.start, box.width, t.size, '');
        if (isCol) gridHead('col', i, t.start, headTop, t.size, HEAD, labels, tracks.length, sub ? g : null);
        else gridHead('row', i, headLeft, t.start, HEAD, t.size, labels, tracks.length, sub ? g : null);
        const prevEnd = i ? tracks[i - 1].start + tracks[i - 1].size : t.start;
        const at = i === 0 ? t.start : (prevEnd + t.start) / 2;
        if (isCol) gridLine(i + 1, at, headTop + HEAD / 2, 'col', sub);
        else gridLine(i + 1, headLeft + HEAD / 2, at, 'row', sub);
        const next = tracks[i + 1];
        if (next) {
          const gs = t.start + t.size;
          const gap = next.start - gs;
          // A subgrid's gaps come from its parent's tracks; only a grid's own gaps are editable here.
          const edit = sub ? null : { props: [gapProp], value: gap, axis: isCol ? 'x' : 'y', sign: 1, min: 0, title: isCol ? 'Column gap' : 'Row gap' };
          if (gap >= 1) {
            if (isCol) bmRect('bm-gap', gs, box.top, gap, box.height, fmt(gap), edit);
            else bmRect('bm-gap', box.left, gs, box.width, gap, fmt(gap), edit);
          }
        }
      });
      if (tracks.length) {
        const end = tracks[tracks.length - 1].start + tracks[tracks.length - 1].size;
        if (isCol) gridLine(tracks.length + 1, end, headTop + HEAD / 2, 'col', sub);
        else gridLine(tracks.length + 1, headLeft + HEAD / 2, end, 'row', sub);
        if (!sub) {
          if (isCol) gridAdd('columns', end + 10, headTop - 1, labels);
          else gridAdd('rows', headLeft - 1, end + 10, labels);
        }
      }
    };
    axis(g.cols, 'col', g.subC, 'column-gap');
    axis(g.rows, 'row', g.subR, 'row-gap');
  }

  function gridHead(kind, i, x, y, w, h, computed, count, sub) {
    const d = document.createElement('div');
    d.className = 'bm bm-gh bm-gh-' + kind + (sub ? ' sub' : '');
    Object.assign(d.style, { left: x + 'px', top: y + 'px', width: Math.max(w, 1) + 'px', height: Math.max(h, 1) + 'px' });
    const label = document.createElement('span');
    label.className = 'bm-gh-label';
    label.textContent = computed[i];
    d.appendChild(label);
    const axis = kind === 'col' ? 'columns' : 'rows';
    if (sub) {
      // Subgrid track: it belongs to the parent grid, so editing happens there.
      const pi = (kind === 'col' ? sub.cols : sub.rows)[i].parentIndex;
      d.setAttribute('data-tip', `Subgrid ${kind === 'col' ? 'column' : 'row'} ${i + 1} · ${computed[i]}\nUses the parent grid's ${kind === 'col' ? 'column' : 'row'} ${pi + 1}. Click to select the parent grid and edit its tracks.`);
      d.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (sub.parent) selectEl(sub.parent);
        flash(`Subgrid tracks come from the parent grid — selected it so you can edit ${kind === 'col' ? 'column' : 'row'} ${pi + 1}.`);
      });
      bm.appendChild(d);
      return;
    }
    d.setAttribute('data-tip', `${kind === 'col' ? 'Column' : 'Row'} ${i + 1} · ${computed[i]}\nClick to set its size (1fr, 240px, auto, minmax(…))`);
    d.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.bm-gh-x')) return;
      e.preventDefault();
      e.stopPropagation();
      openBmInput(d, computed[i], (v) => post({ type: 'gridEdit', id: state.selectedId, axis, op: 'set', index: i, value: px(v), computed, what: `${kind === 'col' ? 'Column' : 'Row'} ${i + 1}: ${px(v)}` }));
    });
    if (count > 1) {
      const x2 = document.createElement('button');
      x2.className = 'bm-gh-x';
      x2.textContent = '×';
      x2.setAttribute('data-tip', `Remove ${kind === 'col' ? 'column' : 'row'} ${i + 1}`);
      x2.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        post({ type: 'gridEdit', id: state.selectedId, axis, op: 'remove', index: i, computed, what: `Removed ${kind === 'col' ? 'column' : 'row'} ${i + 1}` });
      });
      d.appendChild(x2);
    }
    bm.appendChild(d);
  }

  function gridLine(num, x, y, kind, sub) {
    const b = document.createElement('div');
    b.className = 'bm bm-line bm-line-' + kind + (sub ? ' sub' : '');
    b.textContent = String(num);
    Object.assign(b.style, { left: x + 'px', top: y + 'px' });
    bm.appendChild(b);
  }

  function gridAdd(axis, x, y, computed) {
    const b = document.createElement('button');
    b.className = 'bm bm-add';
    b.textContent = '+';
    Object.assign(b.style, { left: x + 'px', top: y + 'px' });
    b.setAttribute('data-tip', axis === 'columns' ? 'Add column' : 'Add row');
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      post({ type: 'gridEdit', id: state.selectedId, axis, op: 'add', index: -1, computed, what: axis === 'columns' ? 'Added a column' : 'Added a row' });
    });
    bm.appendChild(b);
  }

  const px = (v) => {
    const t = String(v).trim();
    return /^-?\d+(\.\d+)?$/.test(t) ? t + 'px' : t;
  };

  // ---- Click to type / drag to change on gap, margin and padding strips ----

  bm.addEventListener('pointerdown', (e) => {
    const t = /** @type {HTMLElement} */ (e.target).closest('.bm.editable');
    if (!t || e.button !== 0) return;
    const info = bmEdit.get(t);
    if (!info) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      t.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events (tests) have no active pointer */
    }
    scrub = { el: t, info, x0: e.clientX, y0: e.clientY, moved: false, value: info.value, target: elById(state.selectedId), alt: e.altKey };
  });
  bm.addEventListener('pointermove', (e) => {
    if (!scrub) return;
    const d = scrub.info.axis === 'x' ? e.clientX - scrub.x0 : e.clientY - scrub.y0;
    if (!scrub.moved && Math.abs(d) < 3) return;
    scrub.moved = true;
    let v = scrub.info.value + d * scrub.info.sign;
    v = e.shiftKey ? Math.round(v / 10) * 10 : Math.round(v);
    v = Math.max(scrub.info.min, v);
    scrub.value = v;
    scrub.alt = e.altKey;
    const lab = scrub.el.querySelector('.bm-label');
    if (lab) lab.textContent = String(v);
    else scrub.el.setAttribute('data-live', String(v));
    // Live preview on the page (the real CSS edit lands on release)
    if (scrub.target) for (const p of editProps(scrub)) scrub.target.style.setProperty(p, v + 'px');
  });
  const endScrub = (e) => {
    if (!scrub) return;
    const s2 = scrub;
    scrub = null;
    if (!s2.moved) return openBmInput(s2.el, String(Math.round(s2.info.value)), (v) => commitEdit2(s2, v));
    commitEdit2(s2, String(s2.value));
  };
  bm.addEventListener('pointerup', endScrub);
  bm.addEventListener('pointercancel', () => {
    scrub = null;
    drawAll();
  });

  function editProps(sc) {
    return sc.alt && sc.info.pair ? [...sc.info.props, sc.info.pair] : sc.info.props;
  }

  function commitEdit2(sc, raw) {
    const v = px(raw);
    if (!v) return;
    const props = Object.fromEntries(editProps(sc).map((p) => [p, v]));
    if (sc.info.extra) Object.assign(props, sc.info.extra);
    post({ type: 'boxEdit', id: state.selectedId, props, what: `${sc.info.title}: ${v}` });
  }

  /** Small inline editor over a handle (click a handle to type a value). */
  function openBmInput(anchor, value, onCommit) {
    closeBmInput(false);
    const r = anchor.getBoundingClientRect();
    const cr = els.canvas.getBoundingClientRect();
    const inp = document.createElement('input');
    inp.className = 'bm-input';
    inp.value = value;
    inp.spellcheck = false;
    const w = 72;
    inp.style.left = Math.max(2, Math.min(r.left - cr.left + r.width / 2 - w / 2, cr.width - w - 2)) + 'px';
    inp.style.top = Math.max(2, r.top - cr.top + r.height / 2 - 12) + 'px';
    inp.style.width = w + 'px';
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') closeBmInput(true);
      else if (e.key === 'Escape') closeBmInput(false);
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const m = /^(-?\d+(?:\.\d+)?)(.*)$/.exec(inp.value.trim());
        if (m) {
          e.preventDefault();
          inp.value = String(Math.round((parseFloat(m[1]) + (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1)) * 100) / 100) + m[2];
        }
      }
    });
    inp.addEventListener('blur', () => closeBmInput(true));
    bmInput = { el: inp, onCommit, initial: value };
    els.canvas.appendChild(inp);
    inp.focus();
    inp.select();
  }

  function closeBmInput(commit) {
    const bi = bmInput;
    if (!bi) return;
    bmInput = null;
    bi.el.remove();
    if (commit && bi.el.value.trim() && bi.el.value.trim() !== bi.initial) bi.onCommit(bi.el.value.trim());
  }

  function drawAll() {
    drawSelection();
    if (state.dropTarget) drawDrop(state.dropTarget);
    drawAudit();
    drawAllLayouts();
  }

  /**
   * "Show all": outlines every grid (tracks + gaps) and flex container (items) on the page, each in
   * its own colour, with a badge that selects it. The selected element keeps the editable overlay.
   */
  function drawAllLayouts() {
    allLayer.innerHTML = '';
    const d = doc();
    if (!showAll || state.interact || !d || !d.body || !state.front) return;
    const win = d.defaultView;
    const cr = els.canvas.getBoundingClientRect();
    const piece = (cls, b, color) => {
      if (b.width < 0.5 || b.height < 0.5) return null;
      const e = document.createElement('div');
      e.className = cls;
      e.style.cssText = `left:${b.left}px;top:${b.top}px;width:${b.width}px;height:${b.height}px;--la:${color}`;
      allLayer.appendChild(e);
      return e;
    };
    let count = 0;
    for (const el of d.body.querySelectorAll('[data-ld-id]')) {
      if (count >= 300) break;
      const cs = win.getComputedStyle(el);
      const isGrid = /grid/.test(cs.display);
      const isFlex = /flex/.test(cs.display);
      if (!isGrid && !isFlex) continue;
      const b = canvasBox(el);
      if (b.width < 2 || b.height < 2 || b.top > cr.height || b.top + b.height < 0) continue;
      const color = `hsl(${(count * 67 + 265) % 360} 78% 58%)`;
      count++;
      const g = isGrid ? gridGeometry(el) : null;
      const kind = g && (g.subC || g.subR) ? 'subgrid' : isGrid ? 'grid' : 'flex';
      const selected = boxModelOn && ldId(el) === state.selectedId;
      if (!selected) {
        piece('la-box', b, color);
        if (g) {
          for (const t of g.cols) piece('la-track' + (g.subC ? ' sub' : ''), { left: t.start, top: g.content.top, width: t.size, height: g.content.height }, color);
          for (const t of g.rows) piece('la-track' + (g.subR ? ' sub' : ''), { left: g.content.left, top: t.start, width: g.content.width, height: t.size }, color);
          const gaps = (tr, col) => tr.slice(1).forEach((t, i) => {
            const s0 = tr[i].start + tr[i].size;
            const w = t.start - s0;
            if (w >= 1) piece('la-gap', col ? { left: s0, top: g.content.top, width: w, height: g.content.height } : { left: g.content.left, top: s0, width: g.content.width, height: w }, color);
          });
          gaps(g.cols, true);
          gaps(g.rows, false);
        } else {
          for (const c of el.children) {
            const k = win.getComputedStyle(c);
            if (k.display === 'none' || k.position === 'absolute' || k.position === 'fixed') continue;
            piece('la-item', canvasBox(c), color);
          }
        }
      }
      if (selected) continue; // the selection has its own full overlay
      const badge = document.createElement('button');
      badge.className = 'la-badge';
      badge.textContent = kind;
      // Top-right corner, so it doesn't sit on line numbers / headers at the top-left.
      // Just outside the top-right corner (inside it when the container reaches the canvas edge).
      const outside = b.left + b.width + 60 < cr.width;
      badge.style.cssText = `left:${outside ? b.left + b.width + 3 : Math.min(cr.width - 2, b.left + b.width)}px;top:${Math.max(0, b.top)}px;--la:${color}`;
      if (outside) badge.classList.add('out');
      badge.setAttribute('data-tip', `${elLabel(el)} · ${kind}${kind === 'subgrid' ? ' (tracks from the parent grid)' : ''}\nClick to select`);
      badge.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); selectEl(el); });
      allLayer.appendChild(badge);
    }
  }

  // ---------------------------------------------------------------------------
  // Audit (Lighthouse-style): axe-core runs inside the page; markers + score bar
  // ---------------------------------------------------------------------------

  async function runAxe(m) {
    const d = doc();
    const w = state.front && state.front.contentWindow;
    if (!d || !w) return { error: 'The page is not rendered yet.' };
    if (!w.axe) {
      await new Promise((resolve, reject) => {
        const sc = d.createElement('script');
        sc.src = m.axeUrl;
        if (SHELL_NONCE) sc.nonce = SHELL_NONCE;
        sc.setAttribute('data-ld-tool', 'axe');
        sc.onload = resolve;
        sc.onerror = () => reject(new Error('Could not load axe-core into the page.'));
        (d.head || d.documentElement).appendChild(sc);
      });
    }
    const r = await w.axe.run(d, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
      elementRef: true,
      resultTypes: ['violations'],
    });
    const idOf = (el) => {
      const t = el && el.closest ? el.closest('[data-ld-id]') : null;
      return t ? Number(t.getAttribute('data-ld-id')) : null;
    };
    return {
      violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl, nodes: v.nodes.map((n) => ({ id: idOf(n.element), summary: n.failureSummary || '' })) })),
      passes: r.passes.map((p) => ({ id: p.id, impact: p.impact })),
      incomplete: r.incomplete.length,
    };
  }

  const IMPACT_ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3 };
  function drawAudit() {
    const layer = $('#auditMarks');
    if (!layer) return;
    layer.innerHTML = '';
    if (!state.audit || !state.audit.length) return;
    const cr = els.canvas.getBoundingClientRect();
    const groups = new Map();
    for (const it of state.audit) {
      if (it.id === null || it.id === undefined) continue;
      if (!groups.has(it.id)) groups.set(it.id, []);
      groups.get(it.id).push(it);
    }
    let n = 0;
    for (const [id, items] of groups) {
      const el = elById(id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const off = state.front.getBoundingClientRect();
      const top = r.top + off.top - cr.top;
      const left = r.left + off.left - cr.left;
      if (top < -20 || top > cr.height || (!r.width && !r.height)) continue;
      items.sort((a, b) => IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact]);
      const worst = items[0].impact;
      const box = document.createElement('div');
      box.className = 'audit-box impact-' + worst;
      box.style.cssText = `left:${left}px;top:${top}px;width:${r.width}px;height:${r.height}px`;
      const b = document.createElement('button');
      b.className = 'audit-mark impact-' + worst;
      b.textContent = String(++n);
      b.style.cssText = `left:${Math.max(0, left - 9)}px;top:${Math.max(0, top - 9)}px`;
      b.title = items.map((it) => `• [${it.category}] ${it.message}`).join('\n') + '\n\nClick to select the element';
      b.setAttribute('aria-label', `${items.length} audit issue${items.length > 1 ? 's' : ''}: ${items[0].message}`);
      b.addEventListener('mousedown', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        selectEl(el);
        flash(items[0].message);
      });
      layer.append(box, b);
    }
  }

  function showAuditBar(m) {
    const bar = $('#auditBar');
    if (!m.scores) { bar.hidden = true; return; }
    const chip = (label, v, cat) => {
      const c = document.createElement('button');
      c.className = 'audit-score ' + (v === null ? 'na' : v >= 90 ? 'good' : v >= 50 ? 'ok' : 'bad');
      c.innerHTML = `<span class="ring">${v === null ? '–' : v}</span>${label}`;
      c.title = `${label}: ${v === null ? 'not run' : v + ' / 100'}\nClick to show these issues in the Problems panel`;
      c.addEventListener('click', () => post({ type: 'auditShow', category: cat }));
      return c;
    };
    const list = $('#auditScores');
    list.innerHTML = '';
    list.append(chip('Accessibility', m.scores.accessibility, 'accessibility'), chip('Best Practices', m.scores['best-practices'], 'best-practices'), chip('SEO', m.scores.seo, 'seo'), chip('Forms', m.scores.forms, 'forms'));
    $('#auditCount').textContent = m.items.length ? `${m.items.length} issue${m.items.length > 1 ? 's' : ''}` : 'No issues';
    $('#auditNote').textContent = m.note || '';
    bar.hidden = false;
  }

  window.addEventListener('resize', drawAll);

  // ---------------------------------------------------------------------------
  // HUD: add class / id
  // ---------------------------------------------------------------------------

  // HUD: cut / copy / paste / duplicate / delete the selected element
  els.hudActions.addEventListener('mousedown', (e) => e.stopPropagation());
  els.hudActions.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('button[data-op]');
    if (!b || state.selectedId === null) return;
    e.stopPropagation();
    const op = b.getAttribute('data-op');
    if (op === 'delete') post({ type: 'delete', id: state.selectedId });
    else post({ type: 'clip', op: op === 'paste' && e.shiftKey ? 'pasteChild' : op, id: state.selectedId });
  });
  // Selection chip: the tag, then one pill per #id / .class.
  //  - click a pill to change it (hints list the classes / IDs in your CSS and on the page)
  //  - × on a pill removes it; + adds one; Enter applies, Esc cancels, Space starts another name
  /** @type {{ css: { classes: string[], ids: string[] }, used: { classes: string[], ids: string[] } }} */
  let hudNameData = { css: { classes: [], ids: [] }, used: { classes: [], ids: [] } };
  /** Name being edited (".col" / "#promo"), or null when adding. */
  let hudEditing = null;
  let hudHintIndex = -1;
  let hudNamesKey = '';

  function namesOf(el) {
    const out = [];
    if (el.id) out.push('#' + el.id);
    for (const c of (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean)) out.push('.' + c);
    return out;
  }

  function buildHudNames(el) {
    const names = namesOf(el);
    const key = ldId(el) + '|' + names.join(' ');
    if (key === hudNamesKey) return;
    hudNamesKey = key;
    els.hudNames.innerHTML = '';
    for (const n of names) {
      const pill = document.createElement('span');
      pill.className = 'hud-name' + (n.startsWith('#') ? ' is-id' : '');
      pill.dataset.name = n;
      const t = document.createElement('button');
      t.className = 'hud-name-t';
      t.textContent = n;
      t.title = `Change ${n}`;
      t.addEventListener('click', (e) => { e.stopPropagation(); openHudEdit(n); });
      const x = document.createElement('button');
      x.className = 'hud-name-x';
      x.textContent = '×';
      x.title = `Remove ${n}`;
      x.setAttribute('aria-label', `Remove ${n}`);
      x.addEventListener('click', (e) => { e.stopPropagation(); commitNames(names.filter((v) => v !== n)); });
      pill.append(t, x);
      els.hudNames.appendChild(pill);
    }
  }
  for (const n of [els.hudNames, els.hudAdd, els.hudEdit]) n.addEventListener('mousedown', (e) => e.stopPropagation());

  /** Writes the full list of names for the selected element (one #id at most; last one wins). */
  function commitNames(list) {
    const el = elById(state.selectedId);
    if (!el) return;
    const ids = list.filter((n) => n.startsWith('#'));
    const classes = [...new Set(list.filter((n) => !n.startsWith('#')))];
    const next = [...ids.slice(-1), ...classes];
    const before = namesOf(el);
    if (next.join(' ') === before.join(' ')) return;
    post({ type: 'setSelectors', id: state.selectedId, value: next.join(' ') });
    // A new class / ID that no stylesheet defines yet gets an empty rule.
    const css = hudNameData.css;
    const missing = next.filter((n) => !before.includes(n) && !(n.startsWith('#') ? css.ids : css.classes).includes(n.slice(1)));
    if (missing.length) offerRules(missing);
  }

  // "Create a rule for .name?" (source picker), remembered choice, or Always create.
  const ruleSaved = () => vscode.getState() || {};
  function ruleSourceOptions() {
    const opts = (hudNameData.sources || []).map((x) => ({ key: x.key, label: x.label }));
    if (!opts.some((o) => o.key.startsWith('style'))) opts.push({ key: 'page:new', label: 'New <style> in this page' });
    return opts;
  }
  function offerRules(selectors) {
    const opts = ruleSourceOptions();
    const st0 = ruleSaved();
    const pick = opts.find((o) => o.key === st0.ruleSource) || opts[0];
    if (st0.ruleAlways && pick) return post({ type: 'createRules', selectors, source: pick.key });
    const box = $('#hudRule');
    $('#hudRuleText').textContent = `${selectors.join(' ')} ${selectors.length > 1 ? "aren't" : "isn't"} styled yet — create ${selectors.length > 1 ? 'rules' : 'a rule'}?`;
    const sel = /** @type {HTMLSelectElement} */ ($('#hudRuleSource'));
    sel.innerHTML = '';
    for (const o of opts) {
      const op = document.createElement('option');
      op.value = o.key;
      op.textContent = o.label;
      sel.appendChild(op);
    }
    if (pick) sel.value = pick.key;
    /** @type {HTMLInputElement} */ ($('#hudRuleAlways')).checked = false;
    box.dataset.selectors = JSON.stringify(selectors);
    box.hidden = false;
    const hr = els.hud.getBoundingClientRect();
    const cr = els.canvas.getBoundingClientRect();
    box.style.left = Math.max(4, Math.min(hr.left - cr.left, cr.width - 300)) + 'px';
    const below = hr.bottom - cr.top + 4;
    box.style.top = (below + 110 < cr.height ? below : Math.max(4, hr.top - cr.top - 114)) + 'px';
    $('#hudRuleCreate').focus();
  }
  function closeRulePrompt(create) {
    const box = $('#hudRule');
    if (box.hidden) return;
    box.hidden = true;
    if (!create) return;
    const source = /** @type {HTMLSelectElement} */ ($('#hudRuleSource')).value;
    const always = /** @type {HTMLInputElement} */ ($('#hudRuleAlways')).checked;
    vscode.setState({ ...ruleSaved(), ruleSource: source, ruleAlways: always });
    post({ type: 'createRules', selectors: JSON.parse(box.dataset.selectors || '[]'), source });
  }
  $('#hudRuleCreate').addEventListener('click', () => closeRulePrompt(true));
  $('#hudRuleSkip').addEventListener('click', () => closeRulePrompt(false));
  $('#hudRule').addEventListener('mousedown', (e) => e.stopPropagation());
  $('#hudRule').addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') closeRulePrompt(false);
    if (e.key === 'Enter' && /** @type {HTMLElement} */ (e.target).tagName !== 'SELECT') { e.preventDefault(); closeRulePrompt(true); }
  });

  /** ".a #b c" → [".a", "#b", ".c"] */
  function parseNames(v) {
    return v.trim().split(/[\s,]+/).filter(Boolean).flatMap((t) => {
      if (t.startsWith('#')) return t.length > 1 ? [t] : [];
      return t.replace(/^\./, '').split('.').filter(Boolean).map((c) => '.' + c);
    }).filter((t) => /^[.#]-?[_a-zA-Z][-_a-zA-Z0-9]*$/.test(t));
  }

  function openHudEdit(name) {
    if (state.selectedId === null) return;
    hudEditing = name;
    els.hudEdit.hidden = false;
    els.hudInput.value = name || '';
    els.hudInput.placeholder = name ? name : '.class or #id';
    els.hud.classList.add('editing');
    for (const p of els.hudNames.children) p.classList.toggle('is-editing', p.dataset.name === name);
    positionHudEdit();
    els.hudInput.focus();
    els.hudInput.select();
    showHints();
  }

  function positionHudEdit() {
    const anchor = (hudEditing && [...els.hudNames.children].find((p) => p.dataset.name === hudEditing)) || els.hudAdd;
    const cr = els.canvas.getBoundingClientRect();
    const r = anchor.getBoundingClientRect();
    els.hudEdit.style.left = Math.max(0, Math.min(r.left - cr.left, cr.width - 230)) + 'px';
    const top = r.top - cr.top;
    els.hudEdit.style.top = top + 'px';
    // Open the hints upward when there isn't room below (like a code-hint popup).
    const want = Math.min(els.hudHints.scrollHeight + 6, 246);
    const below = cr.height - (top + 24);
    els.hudEdit.classList.toggle('above', !els.hudHints.hidden && below < want && top > below);
    els.hudHints.style.maxHeight = Math.max(80, Math.min(240, (els.hudEdit.classList.contains('above') ? top : below) - 8)) + 'px';
  }

  function hideHudInput() {
    els.hudEdit.hidden = true;
    els.hud.classList.remove('editing');
    for (const p of els.hudNames.children) p.classList.remove('is-editing');
    hudEditing = null;
    hudHintIndex = -1;
  }

  function hintList() {
    const el = elById(state.selectedId);
    const have = new Set(el ? namesOf(el) : []);
    if (hudEditing) have.delete(hudEditing);
    const raw = els.hudInput.value.trim().split(/\s+/).pop() || '';
    const q = raw.replace(/^[.#]/, '').toLowerCase();
    const wantId = raw.startsWith('#');
    const wantClass = raw.startsWith('.');
    const d = hudNameData;
    const out = [];
    const add = (name, where) => {
      if (have.has(name) || out.some((o) => o.name === name)) return;
      if (q && !name.slice(1).toLowerCase().includes(q)) return;
      out.push({ name, where });
    };
    if (!wantId) {
      d.css.classes.forEach((c) => add('.' + c, 'CSS'));
      d.used.classes.forEach((c) => add('.' + c, 'on page'));
    }
    if (!wantClass) {
      d.css.ids.forEach((c) => add('#' + c, 'CSS'));
    }
    // starts-with first
    out.sort((a, b) => (a.name.slice(1).toLowerCase().startsWith(q) ? 0 : 1) - (b.name.slice(1).toLowerCase().startsWith(q) ? 0 : 1));
    return out.slice(0, 12);
  }

  function showHints() {
    const list = hintList();
    els.hudHints.innerHTML = '';
    hudHintIndex = Math.min(hudHintIndex, list.length - 1);
    list.forEach((h, i) => {
      const o = document.createElement('div');
      o.className = 'hud-hint' + (i === hudHintIndex ? ' active' : '') + (h.name.startsWith('#') ? ' is-id' : '');
      o.setAttribute('role', 'option');
      o.setAttribute('aria-selected', String(i === hudHintIndex));
      o.dataset.name = h.name;
      const n = document.createElement('span');
      n.textContent = h.name;
      const w = document.createElement('span');
      w.className = 'hud-hint-where';
      w.textContent = h.where;
      o.append(n, w);
      o.addEventListener('mousedown', (e) => { e.preventDefault(); acceptHint(h.name); applyHudEdit(); });
      els.hudHints.appendChild(o);
    });
    els.hudHints.hidden = !list.length;
    positionHudEdit();
  }

  function acceptHint(name) {
    const parts = els.hudInput.value.trim().split(/\s+/).filter(Boolean);
    parts.pop();
    els.hudInput.value = [...parts, name].join(' ');
  }

  function applyHudEdit() {
    const el = elById(state.selectedId);
    if (!el) return hideHudInput();
    const typed = parseNames(els.hudInput.value);
    const cur = namesOf(el);
    let next;
    if (hudEditing) {
      const i = cur.indexOf(hudEditing);
      next = i >= 0 ? [...cur.slice(0, i), ...typed, ...cur.slice(i + 1)] : [...cur, ...typed];
    } else {
      next = [...cur.filter((n) => !(typed.some((t) => t.startsWith('#')) && n.startsWith('#'))), ...typed];
    }
    hideHudInput();
    commitNames(next);
  }

  els.hudAdd.addEventListener('click', (e) => { e.stopPropagation(); openHudEdit(null); });
  els.hudInput.addEventListener('input', () => { hudHintIndex = -1; showHints(); });
  els.hudInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    const n = els.hudHints.children.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!n) return;
      if (e.key === 'ArrowDown') hudHintIndex = hudHintIndex + 1 >= n ? 0 : hudHintIndex + 1;
      else hudHintIndex = hudHintIndex <= 0 ? n - 1 : hudHintIndex - 1;
      showHints();
    } else if (e.key === 'Tab' && n) {
      e.preventDefault();
      acceptHint(/** @type {HTMLElement} */ (els.hudHints.children[Math.max(0, hudHintIndex)]).dataset.name);
      hudHintIndex = -1;
      showHints();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (hudHintIndex >= 0 && n) acceptHint(/** @type {HTMLElement} */ (els.hudHints.children[hudHintIndex]).dataset.name);
      applyHudEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hideHudInput();
    }
  });
  els.hudInput.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== els.hudInput) hideHudInput(); }, 0));

  // ---------------------------------------------------------------------------
  // Placement popover: Before / After / Wrap / Inside
  // ---------------------------------------------------------------------------

  function openMenu(m) {
    if (state.selectedId === null || !elById(state.selectedId) || !state.info) {
      flash('Select an element on the page first.');
      return;
    }
    if (state.editing) commitEdit();
    state.menu = { key: m.key, tag: m.tag, name: m.name };
    const menu = els.placeMenu;
    menu.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'menu-title';
    title.textContent = `Insert ${m.name} <${m.tag}> — ${state.info.label}`;
    menu.appendChild(title);
    const row = document.createElement('div');
    row.className = 'menu-row';
    for (const p of PLACES) {
      const b = document.createElement('button');
      b.setAttribute('role', 'menuitem');
      b.dataset.pos = p.pos;
      const why = placeBlocked(p.pos);
      b.disabled = !!why;
      b.title = why || `${p.label} (${p.key.toUpperCase()})${p.pos === 'inside-last' ? ' — Shift+N or F for first child' : ''}`;
      b.innerHTML = `${p.icon}<span>${p.label}</span>`;
      b.addEventListener('click', (e) => choosePosition(p.pos === 'inside-last' && e.shiftKey ? 'inside-first' : p.pos));
      row.appendChild(b);
    }
    menu.appendChild(row);
    menu.hidden = false;
    positionMenu();
    const first = /** @type {HTMLButtonElement|null} */ (menu.querySelector('button:not([disabled])'));
    if (first) first.focus();
  }

  function positionMenu() {
    const r = rectOf(elById(state.selectedId));
    if (!r) return;
    const m = els.placeMenu;
    const cr = els.canvas.getBoundingClientRect();
    const w = m.offsetWidth || 300;
    const h = m.offsetHeight || 110;
    let top = r.top + 8;
    if (top + h > cr.height) top = Math.max(4, cr.height - h - 4);
    m.style.left = Math.max(4, Math.min(r.left + 8, cr.width - w - 4)) + 'px';
    m.style.top = Math.max(4, top) + 'px';
  }

  /** Why a placement isn't allowed for the current selection + tag (or '' if it is). */
  function placeBlocked(pos) {
    const info = state.info;
    const tag = state.menu ? state.menu.tag : '';
    if (!info) return 'Nothing selected.';
    if (pos.startsWith('inside')) return info.canInside ? '' : `<${info.tag}> can't contain other elements.`;
    if (!info.canSiblings) return `Can't insert ${pos} <${info.tag}>.`;
    if (pos === 'wrap' && NO_CHILDREN.has(tag)) return `<${tag}> can't wrap other elements.`;
    return '';
  }

  function choosePosition(pos) {
    if (!state.menu) return;
    const why = placeBlocked(pos);
    const key = state.menu.key;
    closeMenu();
    if (why) return flash(why);
    post({ type: 'insert', tag: key, position: pos, targetId: state.selectedId });
  }

  function closeMenu() {
    state.menu = null;
    els.placeMenu.hidden = true;
  }

  // ---------------------------------------------------------------------------
  // Drag from the Elements panel onto the page
  // ---------------------------------------------------------------------------

  function isOurDrag(e) {
    return !!(e.dataTransfer && [...e.dataTransfer.types].includes(DRAG_TYPE));
  }

  function onDragOver(e, off) {
    if (!isOurDrag(e)) return;
    // preventDefault both allows the drop and tells VS Code we handle it (no editor drop overlay).
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    state.hoverEl = null;
    state.dropTarget = dropTargetAt(e.clientX + off.x, e.clientY + off.y);
    drawHover();
    drawDrop(state.dropTarget);
  }

  function onDragLeave(e) {
    if (!isOurDrag(e)) return;
    if (!e.relatedTarget) {
      state.dropTarget = null;
      endDropVisuals();
    }
  }

  function onDrop(e, off) {
    if (!isOurDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const key = e.dataTransfer ? e.dataTransfer.getData(DRAG_TYPE) : '';
    const t = dropTargetAt(e.clientX + off.x, e.clientY + off.y);
    state.dropTarget = null;
    endDropVisuals();
    finishDrop(key, t);
  }

  // Drops on the shell outside the page frame (e.g. on the toolbar) are cancelled cleanly.
  document.addEventListener('dragover', (e) => {
    if (!isOurDrag(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
  });
  document.addEventListener('drop', (e) => {
    if (!isOurDrag(e)) return;
    e.preventDefault();
    state.dropTarget = null;
    endDropVisuals();
  });

  /** Works out where a drop at shell coordinates (clientX, clientY) would insert. */
  function dropTargetAt(clientX, clientY) {
    const d = doc();
    if (!d || !state.front) return null;
    const fr = state.front.getBoundingClientRect();
    const x = clientX - fr.left;
    const y = clientY - fr.top;
    if (x < 0 || y < 0 || x > fr.width || y > fr.height) return null;
    let el = ldTarget(d.elementFromPoint(x, y));
    if (!el) {
      const body = ldTarget(d.body);
      return body ? { el: body, position: 'inside-last' } : null;
    }
    let tag = el.tagName.toLowerCase();
    if (tag === 'html' || tag === 'head') {
      const body = ldTarget(d.body);
      if (!body) return { el: null, invalid: 'Drop onto the page body.' };
      el = body;
      tag = 'body';
    }
    if (el.closest('svg, math')) return { el, invalid: "Can't insert inside SVG/MathML content." };
    const r = el.getBoundingClientRect();
    const rel = r.height > 0 ? (y - r.top) / r.height : 0.5;
    const canInside = !NO_CHILDREN.has(tag);
    const canSib = !NO_SIBLINGS.has(tag);
    let position;
    if (!canSib) position = canInside ? 'inside-last' : null;
    else if (canInside) position = rel < 0.25 ? 'before' : rel > 0.75 ? 'after' : 'inside-last';
    else position = rel < 0.5 ? 'before' : 'after';
    if (!position) return { el, invalid: `Can't insert here.` };
    return { el, position };
  }

  function drawDrop(t) {
    els.dropLine.hidden = true;
    els.dropBox.hidden = true;
    els.canvas.classList.toggle('drop-invalid', !!(t && t.invalid));
    if (!t || !t.el) {
      setStatus(t && t.invalid ? t.invalid : '');
      return;
    }
    const r = rectOf(t.el);
    if (!r) return;
    if (t.invalid) {
      setStatus(t.invalid);
      return;
    }
    const label = elLabel(t.el);
    if (t.position === 'inside-last') {
      Object.assign(els.dropBox.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
      els.dropBox.hidden = false;
      setStatus(`Insert inside ${label}`);
    } else {
      const y = t.position === 'before' ? r.top : r.top + r.height;
      Object.assign(els.dropLine.style, { left: r.left + 'px', top: y - 1.5 + 'px', width: Math.max(r.width, 20) + 'px' });
      els.dropLine.hidden = false;
      setStatus(`Insert ${t.position} ${label}`);
    }
  }

  function endDropVisuals() {
    els.dropLine.hidden = true;
    els.dropBox.hidden = true;
    els.canvas.classList.remove('drop-invalid');
    setStatus('');
  }

  function finishDrop(key, t) {
    if (!t || !key) return;
    if (t.invalid || !t.el) {
      flash(t.invalid || "Can't insert here.");
      return;
    }
    post({ type: 'insert', tag: key, position: t.position, targetId: ldId(t.el) });
  }

  // ---------------------------------------------------------------------------
  // Dragging an element on the page (move it to another spot)
  // ---------------------------------------------------------------------------

  /** @type {null | { el: Element, x0: number, y0: number, active: boolean, target: any }} */
  let elDrag = null;
  let suppressClick = false;

  function beginElementDrag(el, x, y) {
    if (state.editing) return;
    elDrag = { el, x0: x, y0: y, active: false, target: null };
  }

  function moveElementDrag(x, y) {
    if (!elDrag) return;
    if (!elDrag.active) {
      if (Math.hypot(x - elDrag.x0, y - elDrag.y0) < 5) return;
      elDrag.active = true;
      closeMenu();
      document.body.classList.add('dragging-el');
      const d = doc();
      if (d) d.documentElement.classList.add('ld-dragging');
      setStatus(`Moving ${elLabel(elDrag.el)} — drop to place it`);
    }
    let t = dropTargetAt(x, y);
    // Can't drop an element into (or next to the inside of) itself.
    if (t && t.el && (t.el === elDrag.el || elDrag.el.contains(t.el))) t = { el: t.el, invalid: "Can't move an element into itself." };
    elDrag.target = t;
    state.dropTarget = t;
    state.hoverEl = null;
    drawHover();
    drawDrop(t);
  }

  function endElementDrag(x, y) {
    const dr = elDrag;
    elDrag = null;
    if (!dr) return;
    document.body.classList.remove('dragging-el');
    const d = doc();
    if (d) d.documentElement.classList.remove('ld-dragging');
    if (!dr.active) return;
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    moveElementDrag(x, y);
    const t = dr.target;
    state.dropTarget = null;
    endDropVisuals();
    if (!t || !t.el) return;
    if (t.invalid) return flash(t.invalid);
    post({ type: 'moveEl', id: ldId(dr.el), targetId: ldId(t.el), position: t.position });
  }

  // The chip above the selection is a drag handle too.
  els.hudTag.addEventListener('mousedown', (e) => {
    const el = elById(state.selectedId);
    if (!el || e.button !== 0 || el.tagName === 'BODY') return;
    e.preventDefault();
    beginElementDrag(el, e.clientX, e.clientY);
  });
  els.hudTag.addEventListener('dblclick', (e) => {
    if (state.selectedId === null) return;
    e.preventDefault();
    post({ type: 'changeTag', id: state.selectedId });
  });
  els.hudTag.title = 'Drag to move · Double-click to change the tag';
  document.addEventListener('mousemove', (e) => elDrag && moveElementDrag(e.clientX, e.clientY));
  document.addEventListener('mouseup', (e) => elDrag && endElementDrag(e.clientX, e.clientY));

  // ---------------------------------------------------------------------------
  // Inline text editing
  // ---------------------------------------------------------------------------

  function textNodes(el) {
    const out = [];
    const w = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) out.push(n);
    return out;
  }

  function childIds(el) {
    return [...el.querySelectorAll('[data-ld-id]')].map((e) => e.getAttribute('data-ld-id')).join(',');
  }

  function startEdit(el) {
    const tag = el.tagName.toLowerCase();
    if (NOT_TEXT_EDITABLE.has(tag) || el.closest('svg')) {
      flash(`<${tag}> text can't be edited inline — use the Attributes panel or Code view.`);
      return;
    }
    if (state.editing) commitEdit();
    closeMenu();
    if (ldId(el) !== state.selectedId) selectEl(el);
    state.editing = { el, originals: textNodes(el).map((n) => n.data), html: el.innerHTML, ids: childIds(el) };
    el.setAttribute('contenteditable', 'plaintext-only');
    if (el.contentEditable !== 'plaintext-only') el.setAttribute('contenteditable', 'true');
    el.addEventListener('blur', onEditBlur);
    el.addEventListener('paste', onEditPaste);
    el.focus();
    setStatus('Editing text — Enter to commit, Esc to cancel');
    drawAll();
  }

  function onEditBlur() {
    commitEdit();
  }

  function onEditPaste(e) {
    e.preventDefault();
    const text = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
    /** @type {Document} */ (e.target.ownerDocument).execCommand('insertText', false, text.replace(/\r?\n/g, ' '));
  }

  function stopEditing() {
    const ed = state.editing;
    if (!ed) return null;
    state.editing = null;
    ed.el.removeEventListener('blur', onEditBlur);
    ed.el.removeEventListener('paste', onEditPaste);
    ed.el.removeAttribute('contenteditable');
    setStatus('');
    return ed;
  }

  function commitEdit() {
    const ed = stopEditing();
    if (!ed) return;
    const id = ldId(ed.el);
    const nodes = textNodes(ed.el);
    if (childIds(ed.el) !== ed.ids) {
      ed.el.innerHTML = ed.html;
      flash('That edit changed the element structure — edit it in Code view instead.');
      return;
    }
    let changes;
    if (nodes.length === ed.originals.length) {
      changes = nodes.map((n, index) => ({ index, value: n.data })).filter((c) => c.value !== ed.originals[c.index]);
    } else if (ed.el.children.length === 0 && ed.originals.length <= 1) {
      // Plain-text element whose text node the browser emptied or split.
      changes = [{ index: 0, value: ed.el.textContent || '' }];
      if ((ed.originals[0] || '') === changes[0].value) return;
    } else {
      ed.el.innerHTML = ed.html;
      flash('Could not map the edit back to the source — edit it in Code view.');
      return;
    }
    if (changes.length) post({ type: 'editText', id, changes, count: ed.originals.length });
  }

  function cancelEdit() {
    const ed = stopEditing();
    if (ed) ed.el.innerHTML = ed.html;
    drawAll();
  }

  // ---------------------------------------------------------------------------
  // Breadcrumbs (tag selector)
  // ---------------------------------------------------------------------------

  function buildCrumbs() {
    const c = els.crumbs;
    c.innerHTML = '';
    const info = state.info;
    if (!info) {
      const s = document.createElement('span');
      s.className = 'muted';
      s.textContent = 'No selection';
      c.appendChild(s);
      return;
    }
    info.crumbs.forEach((cr, i) => {
      if (i) {
        const sep = document.createElement('i');
        sep.className = 'codicon codicon-chevron-right sep';
        c.appendChild(sep);
      }
      const b = document.createElement('button');
      b.textContent = cr.label;
      b.disabled = !cr.located;
      if (cr.id === info.id) b.classList.add('current');
      b.addEventListener('click', () => {
        state.selectedId = cr.id;
        drawSelection();
        post({ type: 'select', id: cr.id });
      });
      c.appendChild(b);
    });
  }

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------

  function onKey(e) {
    const inFrame = e.view && e.view !== window;
    if (state.editing) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commitEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
      return;
    }
    if (elDrag && e.key === 'Escape') {
      elDrag = null;
      document.body.classList.remove('dragging-el');
      state.dropTarget = null;
      endDropVisuals();
      return;
    }
    if (state.menu && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const k = e.key.toLowerCase();
      const p = PLACES.find((x) => x.key === k);
      if (p) {
        e.preventDefault();
        choosePosition(p.pos === 'inside-last' && e.shiftKey ? 'inside-first' : p.pos);
        return;
      }
      if (k === 'f') {
        e.preventDefault();
        choosePosition('inside-first');
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMenu();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const btns = /** @type {HTMLButtonElement[]} */ ([...els.placeMenu.querySelectorAll('button:not([disabled])')]);
        const i = btns.indexOf(/** @type {any} */ (document.activeElement)) + (e.key === 'ArrowRight' ? 1 : -1);
        if (btns[i]) btns[i].focus();
        e.preventDefault();
        return;
      }
    }
    const t = /** @type {HTMLElement} */ (e.target);
    if (!inFrame && t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if (!inFrame && t && t.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;
    if (state.interact && inFrame) return forward(e);

    // Copy / Cut / Paste (⇧ = as child) / Duplicate the selected element.
    if (state.selectedId !== null && (e.metaKey || e.ctrlKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      const op = k === 'c' ? 'copy' : k === 'x' ? 'cut' : k === 'v' ? (e.shiftKey ? 'pasteChild' : 'paste') : k === 'd' ? 'duplicate' : null;
      if (op) {
        e.preventDefault();
        e.stopPropagation();
        post({ type: 'clip', op, id: state.selectedId });
        return;
      }
    }
    if (state.selectedId !== null && !e.metaKey && !e.ctrlKey) {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        post({ type: 'delete', id: state.selectedId });
        return;
      }
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        post({ type: 'move', id: state.selectedId, dir: e.key === 'ArrowUp' ? 'up' : 'down' });
        return;
      }
      if (e.key === 'Enter') {
        const el = elById(state.selectedId);
        if (el) {
          e.preventDefault();
          startEdit(el);
        }
        return;
      }
      if (e.key === 'Escape') {
        selectEl(null);
        return;
      }
      if (e.key === 'ArrowUp' && state.info && state.info.crumbs.length > 1) {
        const parent = state.info.crumbs[state.info.crumbs.length - 2];
        if (parent.located) {
          e.preventDefault();
          state.selectedId = parent.id;
          drawSelection();
          post({ type: 'select', id: parent.id });
        }
        return;
      }
    }
    if (inFrame) forward(e);
  }

  /** Re-dispatch modifier shortcuts from the page frame so VS Code keybindings (save, undo…) still work. */
  function forward(e) {
    if (!(e.metaKey || e.ctrlKey)) return;
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: e.key, code: e.code, keyCode: e.keyCode, metaKey: e.metaKey, ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey, altKey: e.altKey, repeat: e.repeat, bubbles: true, cancelable: true,
      }),
    );
  }

  document.addEventListener('keydown', onKey);
  document.addEventListener('mousedown', (e) => {
    if (state.menu && !els.placeMenu.contains(/** @type {Node} */ (e.target))) closeMenu();
    const lm = $('#levelMenu');
    if (lm && !lm.hidden && !lm.contains(/** @type {Node} */ (e.target)) && !/** @type {HTMLElement} */ (e.target).closest('.ib-level')) lm.hidden = true;
  });

  // ---------------------------------------------------------------------------
  // Toolbar, status
  // ---------------------------------------------------------------------------

  document.querySelectorAll('#modeSeg button').forEach((b) =>
    b.addEventListener('click', () => post({ type: 'mode', mode: /** @type {HTMLElement} */ (b).dataset.mode })),
  );

  function setMode(mode) {
    document.querySelectorAll('#modeSeg button').forEach((b) => {
      const on = /** @type {HTMLElement} */ (b).dataset.mode === mode;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  $('#showPanels').addEventListener('click', () => post({ type: 'showPanels' }));
  $('#runAudit').addEventListener('click', () => { flash('Running accessibility, SEO, best-practice and form checks…'); post({ type: 'runAudit' }); });
  $('#auditRerun').addEventListener('click', () => post({ type: 'runAudit' }));
  $('#auditLighthouse').addEventListener('click', () => post({ type: 'lighthouse' }));
  $('#auditClose').addEventListener('click', () => { state.audit = []; $('#auditBar').hidden = true; drawAll(); });
  $('#showProps').addEventListener('click', () => post({ type: 'showProperties' }));
  $('#chooseTheme').addEventListener('click', () => post({ type: 'chooseTheme' }));
  const applyBoxBtn = () => {
    $('#toggleBox').classList.toggle('on', boxModelOn);
    $('#toggleBox').setAttribute('aria-pressed', String(boxModelOn));
  };
  applyBoxBtn();
  const applyAllBtn = () => {
    $('#toggleAllLayouts').classList.toggle('on', showAll);
    $('#toggleAllLayouts').setAttribute('aria-pressed', String(showAll));
  };
  applyAllBtn();
  $('#toggleAllLayouts').addEventListener('click', () => {
    showAll = !showAll;
    applyAllBtn();
    vscode.setState({ ...(vscode.getState() || {}), showAllLayouts: showAll });
    drawAll();
  });
  $('#toggleBox').addEventListener('click', () => {
    boxModelOn = !boxModelOn;
    applyBoxBtn();
    vscode.setState({ ...(vscode.getState() || {}), boxModel: boxModelOn });
    drawAll();
  });
  let aids = saved.aids !== false;
  const applyAids = () => {
    $('#toggleAids').classList.toggle('on', aids);
    $('#toggleAids').setAttribute('aria-pressed', String(aids));
  };
  applyAids();
  if (!aids) post({ type: 'visualAids', on: false });
  $('#toggleAids').addEventListener('click', () => {
    aids = !aids;
    applyAids();
    vscode.setState({ ...(vscode.getState() || {}), aids });
    post({ type: 'visualAids', on: aids });
  });
  // Page properties: title, language, style sheet and the page's look (a body rule).
  const ps = /** @type {HTMLFormElement} */ ($('#pageSetup'));
  const psField = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ ($('#' + id));
  const PS_FIELDS = { title: 'psTitle', lang: 'psLang', sheet: 'psSheet', sheetPath: 'psPath', font: 'psFont', size: 'psSize', color: 'psColor', background: 'psBg', margin: 'psMargin', padding: 'psPadding' };
  const hex = (/** @type {string} */ v) => (/^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim() : /^#[0-9a-f]{3}$/i.test(v.trim()) ? '#' + v.trim().slice(1).split('').map((c) => c + c).join('') : null);
  const syncSwatch = (/** @type {string} */ text, /** @type {string} */ pick) => { const h = hex(psField(text).value); if (h) psField(pick).value = h; };
  function openPageSetup(values, isNew) {
    for (const [k, id] of Object.entries(PS_FIELDS)) psField(id).value = values[k] ?? '';
    $('#psHeading').textContent = isNew ? 'New page' : 'Page properties';
    $('#psApply').textContent = isNew ? 'Create page' : 'Apply';
    $('#psPathRow').hidden = psField('psSheet').value !== 'file';
    syncSwatch('psColor', 'psColorPick');
    syncSwatch('psBg', 'psBgPick');
    $('#emptyState').hidden = true;
    ps.hidden = false;
    psField('psTitle').focus();
    psField('psTitle').select();
  }
  function closePageSetup() {
    ps.hidden = true;
    if (state.pageEmpty) $('#emptyState').hidden = false;
  }
  psField('psSheet').addEventListener('change', () => { $('#psPathRow').hidden = psField('psSheet').value !== 'file'; });
  for (const [text, pick] of [['psColor', 'psColorPick'], ['psBg', 'psBgPick']]) {
    psField(text).addEventListener('input', () => syncSwatch(text, pick));
    psField(pick).addEventListener('input', () => { psField(text).value = psField(pick).value.toUpperCase(); });
  }
  ps.addEventListener('submit', (e) => {
    e.preventDefault();
    const values = {};
    for (const [k, id] of Object.entries(PS_FIELDS)) values[k] = psField(id).value;
    ps.hidden = true;
    post({ type: 'pageSetup', values });
  });
  ps.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closePageSetup(); } });
  $('#psCancel').addEventListener('click', closePageSetup);
  $('#scaffoldBtn').addEventListener('click', () => post({ type: 'pageProps' }));
  $('#pagePropsBtn').addEventListener('click', () => post({ type: 'pageProps' }));
  $('#toggleInteract').addEventListener('click', () => {
    state.interact = !state.interact;
    const b = $('#toggleInteract');
    b.setAttribute('aria-pressed', String(state.interact));
    b.classList.toggle('on', state.interact);
    state.hoverEl = null;
    document.body.classList.toggle('interact', state.interact);
    drawAll();
    flash(state.interact ? 'Interact mode: clicks go to the page.' : 'Design mode: click to select.');
  });

  function showWarning(text) {
    if (!text || text === state.dismissedWarning) {
      els.warning.hidden = true;
      return;
    }
    els.warningText.textContent = text;
    els.warning.hidden = false;
    requestAnimationFrame(drawAll);
  }
  $('#warningClose').addEventListener('click', () => {
    state.dismissedWarning = els.warningText.textContent || '';
    els.warning.hidden = true;
    requestAnimationFrame(drawAll);
  });

  let flashTimer = 0;
  function flash(text) {
    setStatus(text, true);
    clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => setStatus(''), 4000);
  }
  function setStatus(text, isFlash = false) {
    els.status.textContent = text;
    els.status.classList.toggle('flash', isFlash && !!text);
  }

  // ---------------------------------------------------------------------------
  // Elements bar (across the top of the Design view)
  // ---------------------------------------------------------------------------

  const bar = {
    /** @type {any} */ data: null,
    category: saved.ibCategory || 'HTML',
    heading: saved.ibHeading || 'h2',
    groups: saved.ibGroups || {},
    visible: saved.ibVisible,
  };

  function initInsertBar(m) {
    bar.data = m;
    if (bar.visible === undefined) bar.visible = m.insertBar !== false;
    buildInsertBar();
  }

  function saveBar() {
    vscode.setState({ ...(vscode.getState() || {}), ibCategory: bar.category, ibHeading: bar.heading, ibVisible: bar.visible, ibGroups: bar.groups });
  }

  function tagSvg(text) {
    const w = Math.max(22, 8 + text.length * 6.2);
    return `<svg class="tag-icon" viewBox="0 0 ${w + 6} 16" width="${w + 6}" height="16" aria-hidden="true"><path d="M1 1.5h${w - 3}l5 6.5-5 6.5H1z"/><text x="${(w - 2) / 2 + 1}" y="11.5" text-anchor="middle">${text}</text></svg>`;
  }

  function buildInsertBar() {
    const root = $('#insertBar');
    const btn = $('#toggleInsertBar');
    btn.classList.toggle('on', !!bar.visible);
    btn.setAttribute('aria-pressed', String(!!bar.visible));
    root.hidden = !bar.visible || !bar.data;
    if (root.hidden) return requestAnimationFrame(drawAll);
    const tabs = $('#ibTabs');
    const items = $('#ibItems');
    tabs.innerHTML = '';
    items.innerHTML = '';
    for (const c of bar.data.categories) {
      const t = document.createElement('button');
      t.setAttribute('role', 'tab');
      t.setAttribute('aria-selected', String(c.name === bar.category));
      t.textContent = c.name;
      t.addEventListener('click', () => {
        bar.category = c.name;
        saveBar();
        buildInsertBar();
      });
      tabs.appendChild(t);
    }
    const cat = bar.data.categories.find((c) => c.name === bar.category) || bar.data.categories[0];
    // Sub-tabs (shadcn/ui: Actions · Forms · Layout …)
    const sub = $('#ibSub');
    sub.innerHTML = '';
    sub.hidden = !cat.groups;
    let itemKeys = cat.items;
    if (cat.groups) {
      bar.groups = bar.groups || {};
      const g = cat.groups.find((x) => x.name === bar.groups[cat.name]) || cat.groups[0];
      itemKeys = g.items;
      for (const x of cat.groups) {
        const t = document.createElement('button');
        t.setAttribute('role', 'tab');
        t.setAttribute('aria-selected', String(x === g));
        t.textContent = x.name;
        t.addEventListener('click', () => {
          bar.groups[cat.name] = x.name;
          saveBar();
          buildInsertBar();
        });
        sub.appendChild(t);
      }
    }
    items.classList.toggle('labels', !!cat.labels);
    for (const key of itemKeys) {
      if (key === '-') {
        const d = document.createElement('span');
        d.className = 'ib-sep';
        items.appendChild(d);
        continue;
      }
      const isHeading = key === 'heading';
      const sn = bar.data.snippets[isHeading ? bar.heading : key];
      if (!sn) continue;
      const b = document.createElement('button');
      b.className = 'ib-item';
      b.draggable = true;
      b.title = `${sn.name} <${sn.tag}>${sn.requires && sn.requires.length ? ' — adds ' + sn.requires.join(' + ') + ' to <head>' : ''}\nClick to place at the selection, or drag onto the page`;
      b.setAttribute('aria-label', sn.name);
      b.innerHTML = sn.icon.startsWith('tag:') ? tagSvg(sn.icon.slice(4)) : `<i class="codicon codicon-${sn.icon}"></i>`;
      if (cat.labels) {
        const lab = document.createElement('span');
        lab.className = 'ib-label';
        lab.textContent = sn.name;
        b.appendChild(lab);
      }
      b.addEventListener('click', () => {
        // Head items, characters and the date don't need a position; with nothing selected the
        // extension appends to <main>/<body>. Everything else gets Before / After / Wrap / Inside.
        if (sn.place || state.selectedId === null || !elById(state.selectedId)) post({ type: 'placeInsert', key: sn.key });
        else openMenu({ key: sn.key, tag: sn.tag, name: sn.name });
      });
      b.addEventListener('dragstart', (e) => {
        if (!e.dataTransfer) return;
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData(DRAG_TYPE, sn.key);
        e.dataTransfer.setData('text/plain', sn.lines.map((l) => l.replace(/^\t+/, (t) => '  '.repeat(t.length))).join('\n'));
      });
      b.addEventListener('dragend', () => {
        state.dropTarget = null;
        endDropVisuals();
      });
      items.appendChild(b);
      if (isHeading) {
        // Small ▾ next to the heading icon (the icon already shows the level).
        const lv = document.createElement('button');
        lv.className = 'ib-level';
        lv.title = 'Heading level';
        lv.setAttribute('aria-label', 'Choose heading level');
        lv.innerHTML = '<i class="codicon codicon-chevron-down"></i>';
        lv.addEventListener('click', (e) => {
          e.stopPropagation();
          const menu = $('#levelMenu');
          menu.innerHTML = '';
          for (let i = 1; i <= 6; i++) {
            const o = document.createElement('button');
            o.textContent = 'Heading ' + i;
            o.className = bar.heading === 'h' + i ? 'on' : '';
            o.addEventListener('click', () => {
              bar.heading = 'h' + i;
              menu.hidden = true;
              saveBar();
              buildInsertBar();
            });
            menu.appendChild(o);
          }
          const r = lv.getBoundingClientRect();
          menu.style.left = r.left + 'px';
          menu.style.top = r.bottom + 2 + 'px';
          menu.hidden = !menu.hidden;
        });
        items.appendChild(lv);
      }
    }
    requestAnimationFrame(drawAll);
  }

  $('#toggleInsertBar').addEventListener('click', () => {
    bar.visible = !bar.visible;
    saveBar();
    buildInsertBar();
  });

  // ---------------------------------------------------------------------------
  // Queries from the extension (Styles panel)
  // ---------------------------------------------------------------------------

  function answerQuery(m) {
    if (m.kind === 'axe') return runAxe(m);
    try {
      if (m.kind === 'selectorMatch') {
        const d = doc();
        if (!d) return { ids: [] };
        const seen = new Set();
        for (const el of d.querySelectorAll('[data-ld-id]'))
          if (m.selectors.some((sel) => safe(() => el.matches(sel), false))) seen.add(Number(el.getAttribute('data-ld-id')));
        return { ids: [...seen] };
      }
      if (m.kind === 'cssMatch') {
        const el = elById(m.id);
        const win = state.front && state.front.contentWindow;
        if (!el || !win) return { found: false };
        const matches = m.rules.map((r) => {
          const mediaOk = !r.media || safe(() => win.matchMedia(r.media).matches, false);
          let part = -1;
          let stateOnly = false;
          r.parts.forEach((p, i) => {
            if (safe(() => el.matches(p.sel), false)) {
              if (!p.state && (part === -1 || stateOnly)) {
                part = i;
                stateOnly = false;
              } else if (part === -1) {
                part = i;
                stateOnly = true;
              }
            }
          });
          return { part, state: stateOnly, media: mediaOk };
        });
        const cs = win.getComputedStyle(el);
        const computed = {};
        for (const p of m.props) computed[p] = cs.getPropertyValue(p);
        const pcs = el.parentElement ? win.getComputedStyle(el.parentElement) : null;
        const parentDisplay = pcs ? pcs.display : '';
        return { found: true, matches, computed, parentDisplay, parentDirection: pcs ? pcs.flexDirection : '', parentAlignItems: pcs ? pcs.alignItems : '' };
      }
    } catch (err) {
      return { error: String(err) };
    }
    return null;
  }

  function safe(fn, fallback) {
    try {
      return fn();
    } catch {
      return fallback;
    }
  }

  // ---------------------------------------------------------------------------
  // Test hooks: drive the real code paths from integration tests
  // ---------------------------------------------------------------------------

  function runTest(a) {
    try {
      if (a.kind === 'bmScrub') {
        // Real pointer events on a handle: press, drag by dx/dy, release.
        drawAll();
        const t = bm.querySelectorAll('.' + a.cls + '.editable')[a.index || 0];
        if (!t) throw new Error('no editable ' + a.cls);
        const r = t.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        const ev = (type, dx, dy) => t.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 7, clientX: x + dx, clientY: y + dy, shiftKey: !!a.shift }));
        ev('pointerdown', 0, 0);
        ev('pointermove', a.dx / 2, a.dy / 2);
        ev('pointermove', a.dx, a.dy);
        ev('pointerup', a.dx, a.dy);
      } else if (a.kind === 'bmEdit') {
        // Simulate typing into the first editable overlay piece of a kind (e.g. 'bm-gap' / 'bm-padding').
        drawAll();
        const t = bm.querySelectorAll('.' + a.cls + '.editable')[a.index || 0];
        if (!t) throw new Error('no editable ' + a.cls);
        commitEdit2({ el: t, info: bmEdit.get(t), alt: !!a.alt }, a.value);
      } else if (a.kind === 'gridOp') {
        drawAll();
        const heads = [...bm.querySelectorAll('.bm-gh-' + (a.axis === 'columns' ? 'col' : 'row'))];
        const computed = heads.map((h) => h.querySelector('.bm-gh-label').textContent);
        post({ type: 'gridEdit', id: state.selectedId, axis: a.axis, op: a.op, index: a.index, value: a.value, computed, what: 'test' });
      } else if (a.kind === 'boxModel') {
        drawAll();
        const count = (c) => bm.querySelectorAll('.' + c).length;
        post({ type: 'probeResult', result: { heads: count('bm-gh'), lines: count('bm-line'), adds: count('bm-add'), editable: count('editable'), margin: count('bm-margin'), border: count('bm-border'), padding: count('bm-padding'), gap: count('bm-gap'), track: count('bm-track'), item: count('bm-item'), sub: bm.querySelectorAll('.bm-gh.sub').length, subTracks: bm.querySelectorAll('.bm-track.sub').length, subLabels: [...bm.querySelectorAll('.bm-gh.sub .bm-gh-label')].map((l) => l.textContent),
          gapLabels: [...bm.querySelectorAll('.bm-gap .bm-label')].map((l) => l.textContent) } });
      } else if (a.kind === 'pageClick') {
        // test hook: click an element inside the page (as the user would in Interact mode)
        const d = doc();
        const t = d && d.querySelector(a.selector);
        if (!t) throw new Error('no element ' + a.selector);
        t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: d.defaultView, metaKey: !!a.metaKey, ctrlKey: !!a.ctrlKey }));
      } else if (a.kind === 'pageInput') {
        // test hook: type a value into a field inside the page
        const d = doc();
        const t = /** @type {HTMLInputElement} */ (d && d.querySelector(a.selector));
        if (!t) throw new Error('no field ' + a.selector);
        t.value = a.value;
        t.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (a.kind === 'pageEval') {
        // test hook: read a value from the page's window (e.g. whether jQuery UI loaded)
        const w = state.front && state.front.contentWindow;
        let v = null;
        try { v = a.what === 'jqueryui' ? !!(w && w.jQuery && w.jQuery.ui) : a.what === 'jquery' ? !!(w && w.jQuery) : a.what === 'scrollY' ? w.scrollY : null; } catch { v = null; }
        post({ type: 'probeResult', result: v });
      } else if (a.kind === 'overlayPointer') {
        // test hook: press an overlay piece (grid header, badge…) in the shell
        const t = document.querySelector(a.selector);
        if (!t) throw new Error('no overlay ' + a.selector);
        t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
      } else if (a.kind === 'clickButton') {
        // test hook: press a toolbar button
        const b = /** @type {HTMLElement|null} */ (document.querySelector(a.selector));
        if (!b) throw new Error('no button ' + a.selector);
        b.click();
      } else if (a.kind === 'uiState') {
        const d = doc();
        const pressed = (id) => { const b = document.getElementById(id); return b ? b.getAttribute('aria-pressed') : null; };
        post({
          type: 'probeResult',
          result: {
            box: pressed('toggleBox'), aids: pressed('toggleAids'), insert: pressed('toggleInsertBar'), interact: pressed('toggleInteract'),
            insertBarHidden: $('#insertBar').hidden,
            bodyInteract: document.body.classList.contains('interact'),
            boxPieces: (drawAll(), bm.children.length),
            designCss: !!(d && d.querySelector('style[data-ld-design]')),
            auditMarks: document.querySelectorAll('#auditMarks .audit-mark').length,
            allLayouts: pressed('toggleAllLayouts'),
            layoutBadges: [...allLayer.querySelectorAll('.la-badge')].map((x) => x.textContent),
            layoutPieces: allLayer.children.length,
            auditBar: !$('#auditBar').hidden,
            auditScores: [...document.querySelectorAll('#auditScores .ring')].map((r) => r.textContent),
          },
        });
      } else if (a.kind === 'rulePrompt') {
        // test hook: report / answer the "create rule" prompt
        const box = $('#hudRule');
        const open = !box.hidden;
        const options = [...$('#hudRuleSource').querySelectorAll('option')].map((o) => o.value);
        if (open && a.answer) {
          if (a.source) /** @type {HTMLSelectElement} */ ($('#hudRuleSource')).value = a.source;
          if (a.always) /** @type {HTMLInputElement} */ ($('#hudRuleAlways')).checked = true;
          closeRulePrompt(a.answer === 'create');
        }
        if (a.reset) vscode.setState({ ...ruleSaved(), ruleAlways: false, ruleSource: undefined });
        post({ type: 'probeResult', result: { open, options, text: $('#hudRuleText').textContent } });
      } else if (a.kind === 'hudOpen') {
        // demo hook: open the chip editor with text typed, without applying
        openHudEdit(a.edit || null);
        els.hudInput.value = a.value || '';
        els.hudInput.dispatchEvent(new Event('input'));
      } else if (a.kind === 'hudName') {
        // test hook: edit / add / remove names in the selection chip
        if (a.remove) {
          const p = [...els.hudNames.children].find((x) => x.dataset.name === a.remove);
          if (p) /** @type {HTMLElement} */ (p.querySelector('.hud-name-x')).click();
        } else {
          openHudEdit(a.edit || null);
          els.hudInput.value = a.value;
          els.hudInput.dispatchEvent(new Event('input'));
          if (a.hint) {
            const h = [...els.hudHints.children].findIndex((x) => x.dataset.name === a.hint);
            hudHintIndex = h;
          }
          els.hudInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        }
      } else if (a.kind === 'hudOp') {
        const b = /** @type {HTMLElement|null} */ (els.hudActions.querySelector(`[data-op="${a.op}"]`));
        if (b) b.click();
      } else if (a.kind === 'clipKey') {
        onKey(new KeyboardEvent('keydown', { key: a.key, metaKey: true, shiftKey: !!a.shiftKey }));
      } else if (a.kind === 'dragEl') {
        const src = elById(a.id);
        const dst = elById(a.to);
        if (!src || !dst || !state.front) throw new Error('no element');
        dst.scrollIntoView({ block: 'center' });
        const fr = state.front.getBoundingClientRect();
        const sr = src.getBoundingClientRect();
        const r = dst.getBoundingClientRect();
        beginElementDrag(src, fr.left + sr.left + 5, fr.top + sr.top + 5);
        const x = fr.left + r.left + Math.min(r.width / 2, 20);
        const y = fr.top + r.top + r.height * a.at;
        moveElementDrag(x, y);
        const tt = elDrag && elDrag.target;
        post({ type: 'log', text: 'dragEl ' + JSON.stringify({ active: elDrag && elDrag.active, pos: tt && tt.position, invalid: tt && tt.invalid, on: tt && tt.el && elLabel(tt.el), y, frameH: fr.height }) });
        endElementDrag(x, y);
      } else if (a.kind === 'clickPoint') {
        const d = doc();
        if (d) selectEl(ldTarget(d.elementFromPoint(a.x, a.y)));
      } else if (a.kind === 'click') {
        selectEl(elById(a.id));
      } else if (a.kind === 'drop') {
        // Same path as a real drop: shell coordinates → dropTargetAt → insert.
        const el = elById(a.id);
        if (!el || !state.front) throw new Error('no element ' + a.id);
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        const fr = state.front.getBoundingClientRect();
        const t = dropTargetAt(fr.left + r.left + Math.min(r.width / 2, 20), fr.top + r.top + r.height * a.at);
        post({ type: 'log', text: 'drop ' + JSON.stringify({ pos: t && t.position, invalid: t && t.invalid, on: t && t.el && elLabel(t.el) }) });
        finishDrop(a.tag, t);
      } else if (a.kind === 'editText') {
        const el = elById(a.id);
        if (!el) throw new Error('no element ' + a.id);
        startEdit(el);
        textNodes(el)[a.index || 0].data = a.value;
        commitEdit();
      } else if (a.kind === 'key') {
        onKey(new KeyboardEvent('keydown', { key: a.key, altKey: !!a.altKey, shiftKey: !!a.shiftKey }));
      } else if (a.kind === 'probe') {
        const d = doc();
        const win = state.front && state.front.contentWindow;
        const found = d && win ? [...d.querySelectorAll(a.selector)] : [];
        post({
          type: 'probeResult',
          result: found.map((el) => ({
            text: (el.textContent || '').trim().slice(0, 80),
            children: el.children.length,
            cls: typeof el.className === 'string' ? el.className : '',
            visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && win.getComputedStyle(el).display !== 'none',
            aria: { selected: el.getAttribute('aria-selected'), expanded: el.getAttribute('aria-expanded'), hidden: el.getAttribute('aria-hidden') },
            style: Object.fromEntries(a.props.map((p) => [p, win.getComputedStyle(el).getPropertyValue(p)])),
          })),
        });
      } else if (a.kind === 'scroll') {
        state.front && state.front.contentWindow && state.front.contentWindow.scrollTo(0, a.y);
      }
    } catch (err) {
      post({ type: 'log', text: 'test error: ' + err });
    }
  }

  buildCrumbs();
  post({ type: 'ready' });
})();
