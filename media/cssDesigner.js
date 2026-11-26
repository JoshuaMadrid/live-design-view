// @ts-check
// Styles panel (sidebar webview view):
// All | Current, then Sources, @Media, Selectors and Properties (Layout, Text, Border,
// Background, More) with Set only. Every change is a message; the extension edits the CSS text.
(function () {
  'use strict';
  // @ts-ignore
  const vscode = acquireVsCodeApi();
  const post = (/** @type {any} */ m) => vscode.postMessage(m);
  const root = /** @type {HTMLElement} */ (document.getElementById('root'));
  const ui = Object.assign({ open: { sources: true, media: true, selectors: true, props: true }, filter: '' }, vscode.getState() || {});
  const persist = () => vscode.setState({ open: ui.open, filter: ui.filter });
  /** @type {any} */ let st = null;
  let suggestionIndex = -1;

  // Property catalogue ---------------------------------------------------------
  const sel = (...o) => ({ type: 'select', options: o });
  const icons = (...o) => ({ type: 'icons', options: o });
  const color = { type: 'color' };
  const GROUPS = [
    {
      id: 'layout', label: 'Layout', icon: 'layout',
      props: {
        width: {}, height: {}, 'min-width': {}, 'min-height': {}, 'max-width': {}, 'max-height': {},
        display: sel('block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'contents', 'none'),
        'box-sizing': sel('content-box', 'border-box'),
        margin: { type: 'box', sides: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'] },
        padding: { type: 'box', sides: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'] },
        position: sel('static', 'relative', 'absolute', 'fixed', 'sticky'),
        top: {}, right: {}, bottom: {}, left: {},
        float: icons(['left', 'arrow-left'], ['right', 'arrow-right'], ['none', 'circle-slash']),
        clear: sel('none', 'left', 'right', 'both'),
        'overflow-x': sel('visible', 'hidden', 'scroll', 'auto', 'clip'),
        'overflow-y': sel('visible', 'hidden', 'scroll', 'auto', 'clip'),
        visibility: sel('visible', 'hidden', 'collapse'),
        'z-index': {}, opacity: {},
      },
    },
    {
      id: 'text', label: 'Type', icon: 'text-size',
      props: {
        color,
        'font-family': { type: 'text', list: ['system-ui, sans-serif', 'Georgia, serif', '"Helvetica Neue", Arial, sans-serif', 'ui-monospace, monospace', 'inherit'] },
        'font-style': sel('normal', 'italic', 'oblique'),
        'font-variant': sel('normal', 'small-caps'),
        'font-weight': sel('normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'),
        'font-size': {}, 'line-height': {},
        'text-align': icons(['left', 'svg:align-left'], ['center', 'svg:align-center'], ['right', 'svg:align-right'], ['justify', 'svg:align-justify']),
        'text-decoration': icons(['none', 'circle-slash'], ['underline', 'svg:underline'], ['line-through', 'strikethrough']),
        'text-indent': {}, 'text-shadow': {},
        'text-transform': sel('none', 'capitalize', 'uppercase', 'lowercase'),
        'letter-spacing': {}, 'word-spacing': {},
        'white-space': sel('normal', 'nowrap', 'pre', 'pre-wrap', 'pre-line'),
        'vertical-align': sel('baseline', 'top', 'middle', 'bottom', 'text-top', 'text-bottom', 'sub', 'super'),
        'list-style-type': sel('disc', 'circle', 'square', 'decimal', 'lower-alpha', 'upper-alpha', 'lower-roman', 'none'),
        'list-style-position': sel('outside', 'inside'),
      },
    },
    {
      id: 'background', label: 'Background', icon: 'symbol-color',
      props: {
        'background-color': color, 'background-image': {}, 'background-position': {},
        'background-size': { type: 'text', list: ['auto', 'cover', 'contain'] },
        'background-repeat': sel('repeat', 'no-repeat', 'repeat-x', 'repeat-y', 'space', 'round'),
        'background-attachment': sel('scroll', 'fixed', 'local'),
        'background-clip': sel('border-box', 'padding-box', 'content-box', 'text'),
        'background-origin': sel('padding-box', 'border-box', 'content-box'),
        background: {}, 'box-shadow': {},
      },
    },
    {
      id: 'border', label: 'Borders', icon: 'primitive-square',
      props: {
        border: {}, 'border-width': {},
        'border-style': sel('none', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset'),
        'border-color': color, 'border-radius': {},
        'border-top': {}, 'border-right': {}, 'border-bottom': {}, 'border-left': {},
        'border-collapse': sel('separate', 'collapse'), 'border-spacing': {}, outline: {},
      },
    },
    { id: 'more', label: 'Other', icon: 'ellipsis', props: {} },
  ];
  // Props shown in the contextual Flex / Grid container and item blocks.
  const CONTEXT_PROPS = ['flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-content', 'gap', 'row-gap', 'column-gap',
    'grid-template-columns', 'grid-template-rows', 'grid-template-areas', 'grid-auto-flow', 'grid-auto-rows', 'grid-auto-columns', 'justify-items',
    'flex', 'flex-grow', 'flex-shrink', 'flex-basis', 'align-self', 'order', 'grid-column', 'grid-row', 'grid-area', 'justify-self'];
  const KNOWN = new Set(CONTEXT_PROPS.concat(GROUPS.flatMap((g) => Object.keys(g.props).concat(...Object.values(g.props).map((p) => p.sides || [])))));
  /** Computed-style key used as a placeholder hint for a property. */
  const HINT = { 'text-decoration': 'text-decoration-line', 'border-width': 'border-top-width', 'border-style': 'border-top-style', 'border-color': 'border-top-color' };

  window.addEventListener('message', (ev) => {
    const m = ev.data;
    if (m.type === 'puppet') {
      const w = /** @type {any} */ (window);
      w.ldPuppetDone = (id) => post({ type: 'puppetDone', id });
      if (w.ldPuppet) w.ldPuppet(m);
      return;
    }
    if (m.type === 'testGroups') {
      // test hook: click a group header (optionally with Alt), report which groups are open
      if (m.click) {
        const b = /** @type {HTMLElement|null} */ (root.querySelector(`[data-group="${m.click}"]`));
        if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: !!m.alt }));
      }
      setTimeout(() => post({ type: 'testGroupsResult', open: [...root.querySelectorAll('.grp-title')].filter((b) => b.getAttribute('aria-expanded') === 'true').map((b) => b.getAttribute('data-group')),
        rows: [...root.querySelectorAll('.grp')].map((g) => ({ id: g.id, rows: g.querySelectorAll('.prop').length })) }), 50);
      return;
    }
    if (m.type === 'testBoxLink') {
      const b = /** @type {HTMLButtonElement|null} */ (root.querySelector(`[data-link="${m.link}"]`));
      if (b) b.click();
      return;
    }
    if (m.type === 'testUnit') {
      // test hook: type into a unit field, or pick a unit in its dropdown
      const input = /** @type {HTMLInputElement|null} */ (root.querySelector(`[data-focus-key="u:${m.prop}"]`));
      if (!input) return;
      if (m.unit) {
        const sel = /** @type {HTMLSelectElement} */ (input.parentElement.querySelector('.u-unit'));
        sel.value = m.unit;
        sel.dispatchEvent(new Event('change'));
      } else {
        input.value = m.value;
        input.dispatchEvent(new Event('change'));
      }
      return;
    }
    if (m.type === 'testDragRule') {
      // test hook: real HTML5 drag events between two selector rows (by label)
      const rows = [...root.querySelectorAll('.pane-selectors .cd-list .row')];
      const from = rows.find((r) => r.querySelector('.label').textContent === m.from);
      const to = rows.find((r) => r.querySelector('.label').textContent === m.to);
      if (!from || !to) return;
      const dt = new DataTransfer();
      const r = to.getBoundingClientRect();
      const y = m.after ? r.bottom - 2 : r.top + 2;
      from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
      to.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: y }));
      to.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: y }));
      from.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
      return;
    }
    if (m.type === 'testSize') {
      // test hook: same path as picking a mode in the W/H menu
      apply(SZ.sizeProps(sizeCtx(), m.prop, m.mode, m.value));
      return;
    }
    if (m.type === 'state') {
      st = m;
      suggestionIndex = -1;
      render();
    } else if (m.type === 'message') flash(m.text);
  });

  // Rendering --------------------------------------------------------------------
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'text') e.textContent = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c) e.append(c);
    return e;
  }
  // Icons codicons don't have, drawn to match codicon weight (16px, 1px strokes).
  const SVG_ICONS = {
    'align-left': '<path d="M2 3.5h12M2 6.5h8M2 9.5h12M2 12.5h8"/>',
    'align-center': '<path d="M2 3.5h12M4 6.5h8M2 9.5h12M4 12.5h8"/>',
    'align-right': '<path d="M2 3.5h12M6 6.5h8M2 9.5h12M6 12.5h8"/>',
    'align-justify': '<path d="M2 3.5h12M2 6.5h12M2 9.5h12M2 12.5h12"/>',
    underline: '<path d="M4.5 2.5v5a3.5 3.5 0 0 0 7 0v-5M3.5 13.5h9"/>',
  };
  const icon = (name, title) => {
    if (name.startsWith('svg:')) {
      const i = h('i', { class: 'codicon ld-svg-icon', title, 'aria-hidden': 'true' });
      i.innerHTML = `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">${SVG_ICONS[name.slice(4)] || ''}</svg>`;
      return i;
    }
    return h('i', { class: `codicon codicon-${name}`, title, 'aria-hidden': 'true' });
  };
  const iconBtn = (name, title, onclick, disabled) =>
    h('button', { class: 'icon-btn', title, 'aria-label': String(title).split('\n')[0], onclick, disabled: !!disabled }, icon(name));

  function render() {
    const focused = document.activeElement && /** @type {HTMLElement} */ (document.activeElement).dataset.focusKey;
    const caret = focused && /** @type {HTMLInputElement} */ (document.activeElement).selectionStart;
    root.innerHTML = '';
    if (!st || !st.hasSession) {
      // Front and center: start designing (the Structure view below shows the same prompt).
      root.append(h('div', { class: 'cd-start' },
        h('div', { class: 'cd-start-title', text: 'Start designing' }),
        h('p', { class: 'cd-start-text', text: 'Open an HTML file in Design or Split view to style it here.' }),
        h('button', { class: 'cd-start-btn primary', title: 'Open Design View\nShows the page you can click, insert into and style', onclick: () => post({ type: 'open', mode: 'live' }) }, icon('eye'), h('span', { text: 'Open Design View' })),
        h('button', { class: 'cd-start-btn', title: 'Open Split View\nCode on the left, the page on the right', onclick: () => post({ type: 'open', mode: 'split' }) }, icon('split-horizontal'), h('span', { text: 'Open Split View' }))));
      return;
    }
    const top = h('div', { class: 'cd-top' },
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Mode' },
        h('button', { class: st.mode === 'all' ? 'on' : '', 'aria-pressed': String(st.mode === 'all'), onclick: () => post({ type: 'mode', mode: 'all' }), text: 'Page', title: 'Every rule on the page' }),
        h('button', { class: st.mode === 'current' ? 'on' : '', 'aria-pressed': String(st.mode === 'current'), onclick: () => post({ type: 'mode', mode: 'current' }), text: 'Selection', title: 'Only the rules that apply to the selected element, most specific first' }),
      ),
      iconBtn('discard', 'Undo last style change', () => post({ type: 'undo' }), !st.canUndo),
    );
    const left = h('div', { class: 'cd-col' }, sourcesPane(), selectorsPane());
    const right = h('div', { class: 'cd-col' }, propsPane());
    root.append(top, h('div', { class: 'cd-grid' }, left, right),
      h('div', { class: 'cd-foot', id: 'foot', text: st.mode === 'all' ? 'Showing every rule on the page' : `Showing rules that apply to ${st.element || 'the selection'}` }));
    if (focused) {
      const el = /** @type {HTMLInputElement|null} */ (root.querySelector(`[data-focus-key="${CSS.escape(focused)}"]`));
      if (el) {
        el.focus();
        try { el.setSelectionRange(caret, caret); } catch {}
      }
    }
  }

  function pane(id, title, actions, body) {
    const open = ui.open[id] !== false;
    const head = h('div', { class: 'pane-head' },
      h('button', { class: 'twisty', 'aria-expanded': String(open), onclick: () => { ui.open[id] = !open; persist(); render(); } }, icon(open ? 'chevron-down' : 'chevron-right'), h('span', { text: title })),
      h('span', { class: 'pane-actions' }, ...actions),
    );
    return h('section', { class: `pane pane-${id}` }, head, open ? body : null);
  }

  function list(items, current, onPick, opts = {}) {
    const ul = h('ul', { class: 'cd-list' + (opts.reorder ? ' reorderable' : ''), role: 'listbox' });
    const clearMarks = () => ul.querySelectorAll('.drop-before, .drop-after').forEach((n) => n.classList.remove('drop-before', 'drop-after'));
    if (!items.length) ul.append(h('li', { class: 'empty', text: opts.empty || 'None' }));
    for (const it of items) {
      const li = h('li', {
        class: ['row', it.key === current ? 'sel' : '', it.dim ? 'dim' : '', it.strong ? 'strong' : '', it.cls || ''].join(' '),
        role: 'option', tabindex: '0', 'aria-selected': String(it.key === current), title: it.title || it.label,
        onclick: () => onPick(it.key),
        onkeydown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(it.key); }
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const sib = /** @type {HTMLElement|null} */ (e.key === 'ArrowDown' ? li.nextElementSibling : li.previousElementSibling);
            if (sib) { sib.focus(); sib.click(); }
          }
        },
      }, opts.reorder && it.draggable ? h('span', { class: 'grip', 'aria-hidden': 'true' }, icon('gripper')) : null,
        it.icon ? icon(it.icon) : null, h('span', { class: 'label', text: it.label }), it.meta ? h('span', { class: 'meta', text: it.meta }) : null);
      if (opts.reorder && it.draggable) {
        li.draggable = true;
        li.addEventListener('dragstart', (e) => {
          if (!e.dataTransfer) return;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/x-ld-rule', it.key);
          li.classList.add('dragging');
        });
        li.addEventListener('dragend', () => {
          li.classList.remove('dragging');
          clearMarks();
        });
        li.addEventListener('dragover', (e) => {
          if (!e.dataTransfer || ![...e.dataTransfer.types].includes('text/x-ld-rule')) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          const r = li.getBoundingClientRect();
          const after = e.clientY > r.top + r.height / 2;
          clearMarks();
          li.classList.add(after ? 'drop-after' : 'drop-before');
        });
        li.addEventListener('dragleave', () => li.classList.remove('drop-before', 'drop-after'));
        li.addEventListener('drop', (e) => {
          const k = e.dataTransfer && e.dataTransfer.getData('text/x-ld-rule');
          const after = li.classList.contains('drop-after');
          clearMarks();
          if (!k || k === it.key) return;
          e.preventDefault();
          opts.reorder(k, it.key, after ? 'after' : 'before');
        });
        li.addEventListener('keydown', (e) => {
          // Alt+↑ / Alt+↓ move the rule up / down
          if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
          e.preventDefault();
          e.stopPropagation();
          const idx = items.indexOf(it);
          const other = items[idx + (e.key === 'ArrowUp' ? -1 : 1)];
          if (other && other.draggable) opts.reorder(it.key, other.key, e.key === 'ArrowUp' ? 'before' : 'after');
        });
      }
      ul.append(li);
    }
    return ul;
  }

  function sourcesPane() {
    const add = h('div', { class: 'menu-wrap' },
      iconBtn('add', 'Add a stylesheet', (e) => toggleMenu(/** @type {HTMLElement} */ (e.currentTarget).parentElement)),
      h('div', { class: 'menu', hidden: true },
        h('button', { onclick: () => post({ type: 'addSource', kind: 'new' }), text: 'New CSS file…' }),
        h('button', { onclick: () => post({ type: 'addSource', kind: 'attach' }), text: 'Link an existing CSS file…' }),
        h('button', { onclick: () => post({ type: 'addSource', kind: 'page' }), text: '<style> in this page' }),
      ));
    const items = st.sources.map((s) => ({
      key: s.key, label: s.label,
      icon: s.kind === 'all' ? 'files' : s.kind === 'style' ? 'code' : 'file-code',
      meta: s.missing ? 'missing' : s.error ? 'error' : String(s.count),
      title: s.error ? `${s.label}: ${s.error}` : s.missing ? `${s.label} (file not found)` : s.label,
      strong: s.kind === 'all',
    }));
    const body = st.sources.length > 1
      ? list(items, st.source, (k) => post({ type: 'selectSource', key: k }))
      : h('div', { class: 'cd-empty-cta' }, h('button', { class: 'cta', onclick: () => post({ type: 'addSource', kind: 'new' }) }, icon('add'), h('span', { text: 'Add a stylesheet' })));
    return pane('sources', 'Stylesheets', [add, iconBtn('remove', 'Unlink the selected stylesheet', () => post({ type: 'removeSource' }), st.source === '*')], body);
  }

  /** Media filter at the top of the Rules list: a dropdown plus add / remove. */
  function mediaFilter() {
    if (st.mode === 'current') return null;
    const select = h('select', { class: 'media-select', 'aria-label': 'Filter rules by media query', title: 'Which rules to list: all, base styles (no media query), or one media query',
      onchange: (e) => { const v = /** @type {HTMLSelectElement} */ (e.target).value; post({ type: 'selectMedia', key: v === '*' ? null : v }); } },
      h('option', { value: '*', text: 'All media', selected: st.mediaKey === null || st.mediaKey === undefined }),
      ...st.media.map((m) => h('option', { value: m.key, selected: st.mediaKey === m.key, text: (m.key === '' ? 'Base styles' : '@media ' + m.label) + (m.count ? `  (${m.count})` : '') })));
    const addWrap = h('div', { class: 'menu-wrap' },
      iconBtn('add', 'Add a media query', (e) => toggleMenu(/** @type {HTMLElement} */ (e.currentTarget).parentElement)),
      h('div', { class: 'menu media-menu', hidden: true },
        h('div', { class: 'menu-title', text: 'Add a breakpoint' }),
        ...['(max-width: 767px)', '(min-width: 768px)', '(min-width: 1024px)', '(orientation: portrait)', 'print', '(prefers-color-scheme: dark)'].map((c) =>
          h('button', { onclick: () => post({ type: 'addMedia', condition: c }), text: c })),
        h('input', { placeholder: 'Custom, e.g. (min-width: 600px) and (max-width: 900px)', 'aria-label': 'Custom media query',
          onkeydown: (e) => { if (e.key === 'Enter') post({ type: 'addMedia', condition: /** @type {HTMLInputElement} */ (e.target).value }); } }),
      ));
    return h('div', { class: 'media-row' }, icon('device-mobile'), select, addWrap,
      iconBtn('remove', 'Remove the selected media query (its rules are kept)', () => post({ type: 'removeMedia' }), !st.mediaKey));
  }

  function selectorsPane() {
    const sugg = st.suggestions || [];
    const def = sugg.length ? sugg[Math.min(sugg.length - 1, 2)] : '';
    const input = /** @type {HTMLInputElement} */ (h('input', {
      class: 'add-selector', placeholder: sugg.length ? 'Selector (↑/↓ for suggestions)' : 'New selector', 'aria-label': 'New selector', 'data-focus-key': 'add-selector', hidden: true,
      onkeydown: (e) => {
        if (e.key === 'Enter') { post({ type: 'addRule', selector: input.value }); input.hidden = true; }
        else if (e.key === 'Escape') input.hidden = true;
        else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && sugg.length) {
          e.preventDefault();
          // ↑ = more specific, ↓ = less specific 
          suggestionIndex = Math.max(0, Math.min(sugg.length - 1, (suggestionIndex < 0 ? sugg.indexOf(def) : suggestionIndex) + (e.key === 'ArrowUp' ? 1 : -1)));
          input.value = sugg[suggestionIndex];
        }
      },
    }));
    const add = () => { input.hidden = false; input.value = def; input.focus(); input.select(); };
    const filter = /** @type {HTMLInputElement} */ (h('input', {
      class: 'filter', placeholder: 'Filter rules', 'aria-label': 'Filter rules', value: ui.filter, 'data-focus-key': 'filter',
      oninput: (e) => { ui.filter = /** @type {HTMLInputElement} */ (e.target).value; persist(); render(); },
    }));
    const f = ui.filter.trim().toLowerCase();
    const items = st.rules
      .filter((r) => !f || r.selector.toLowerCase().includes(f))
      .map((r) => ({
        key: r.key,
        label: r.selector,
        meta: r.key === 'computed' ? '' : r.where,
        icon: r.key === 'computed' ? 'symbol-property' : r.state ? 'debug-pause' : undefined,
        // Page mode with an element selected: rules that apply get an accent bar, the rest fade back.
        cls: st.mode === 'all' && st.element && r.key !== 'computed' ? (r.matched ? 'applies' : 'muted') : '',
        title: r.key === 'computed' ? COMPUTED_TIP : `${r.selector}${r.where ? ' — ' + r.where : ''}\nSpecificity ${r.spec}${r.state ? '\nApplies only in a state (e.g. :hover)' : ''}${r.matched && st.mode === 'all' ? '\nApplies to the selected element' : ''}`,
        dim: r.state,
        strong: r.key === 'computed',
        draggable: st.mode === 'all' && r.key !== 'computed',
      }));
    const empty = st.mode === 'current' ? (st.element ? 'No rules apply to this element.' : 'Select an element in the Design view.') : 'No rules here yet — click + to add one.';
    const body = h('div', {}, mediaFilter(), h('div', { class: 'filter-row' }, icon('search'), filter), input, list(items, st.rule, (k) => post({ type: 'selectRule', key: k }), {
      empty,
      reorder: st.mode === 'all' ? (key, targetKey, position) => post({ type: 'moveRule', key, targetKey, position }) : null,
    }));
    return pane('selectors', 'Rules', [
      iconBtn('add', sugg.length ? `Add a rule (suggests a selector for ${st.element})` : 'Add a rule', add),
      iconBtn('remove', 'Delete the selected rule', () => post({ type: 'removeRule' }), !st.rule || st.rule === 'computed'),
      iconBtn('go-to-file', 'Go to code', () => post({ type: 'gotoRule' }), !st.rule || st.rule === 'computed'),
    ], body);
  }

  function propsPane() {
    const computedMode = st.rule === 'computed';
    const editable = !!st.rule && !computedMode;
    const showSet = h('label', { class: 'show-set', title: 'Set only\nShow only the properties this rule sets' },
      h('input', { type: 'checkbox', checked: st.showSet, onchange: (e) => post({ type: 'showSet', value: /** @type {HTMLInputElement} */ (e.target).checked }) }),
      h('span', { text: 'Set only' }));
    const GROUP_TIPS = {
      layout: 'Layout\nSize, display, margin & padding, position, flex / grid',
      text: 'Type\nColor, font, size, line height, alignment, decoration',
      border: 'Borders\nBorder width, style, color and radius',
      background: 'Background\nBackground color, image, size, position, shadow',
      more: 'Other\nOther properties this rule sets, and add any property by name',
    };
    const jump = h('span', { class: 'jump' }, ...GROUPS.map((g) => iconBtn(g.icon, GROUP_TIPS[g.id] || g.label, () => {
      // Jumping to a group opens its accordion.
      if (ui.open['grp-' + g.id] === false) { ui.open['grp-' + g.id] = true; persist(); render(); }
      const t = root.querySelector('#grp-' + g.id);
      if (t) t.scrollIntoView({ block: 'start', behavior: 'smooth' });
    })));
    const head = h('div', { class: 'props-head' },
      h('div', { class: 'rule-title' },
        h('span', { class: 'chip', text: st.ruleSelector || 'No selector', title: st.rule === 'computed' ? COMPUTED_TIP : st.ruleSelector ? `Editing the rule ${st.ruleSelector}` : undefined }),
        st.ruleWhere ? h('span', { class: 'meta', text: st.ruleWhere }) : null),
      h('div', { class: 'props-tools' }, jump, showSet));
    let body;
    if (!st.rule) body = h('p', { class: 'empty pad', text: st.mode === 'current' ? 'Select a rule above.' : 'Pick a rule to see and edit its style.' });
    else body = h('div', { class: 'props-body' }, editable ? layoutSection() : null, ...GROUPS.map((g) => group(g, editable, computedMode)));
    return pane('props', 'Style', [], h('div', {}, head, body));
  }

  // ---------------------------------------------------------------------------
  // Auto layout (design-tool style) → CSS flexbox / grid on the selected rule
  // ---------------------------------------------------------------------------

  const svgIcon = (inner, size = 16) => {
    const span = h('span', { class: 'ly-ico', 'aria-hidden': 'true' });
    span.innerHTML = `<svg viewBox="0 0 16 16" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
    return span;
  };
  // 16px glyphs, design-tool style
  const ICONS = {
    free: '<rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1.2"/><rect x="9.5" y="5.5" width="4.5" height="4.5" rx="1.2"/><rect x="4.5" y="10" width="4.5" height="4" rx="1.2"/>',
    vertical: '<rect x="2.5" y="2" width="6" height="4.5" rx="1.2"/><rect x="2.5" y="9.5" width="6" height="4.5" rx="1.2"/><path d="M12.5 3v10m-2-2 2 2 2-2"/>',
    horizontal: '<rect x="2" y="2.5" width="4.5" height="5.5" rx="1.2"/><rect x="9.5" y="2.5" width="4.5" height="5.5" rx="1.2"/><path d="M3 12.5h10m-2-2 2 2-2 2"/>',
    grid: '<rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1.2"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1.2"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1.2"/><rect x="9" y="9" width="4.5" height="4.5" rx="1.2"/>',
    wrap: '<path d="M2.5 4.5h8.5a2.5 2.5 0 0 1 0 5H5.5"/><path d="m7.5 7.5-2 2 2 2"/>',
    autolayout: '<rect x="2" y="2" width="5" height="12" rx="1.3"/><rect x="9" y="2" width="5" height="5" rx="1.3"/><path d="m9.5 11 1.5 1.5 3-3"/>',
    hug: '<rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M5.5 8h5M5.5 8l1.5-1.5M5.5 8 7 9.5M10.5 8 9 6.5M10.5 8 9 9.5"/>',
    gapH: '<path d="M4 3v10M12 3v10M6.5 8h3"/><circle cx="8" cy="8" r=".6" fill="currentColor"/>',
    gapV: '<path d="M3 4h10M3 12h10M8 6.5v3"/>',
    sliders: '<path d="M5 2.5v11M11 2.5v11"/><circle cx="5" cy="10" r="1.6" fill="var(--vscode-sideBar-background)"/><circle cx="11" cy="6" r="1.6" fill="var(--vscode-sideBar-background)"/>',
    padL: '<rect x="2.5" y="2.5" width="11" height="11" rx="1.5" opacity=".45"/><path d="M5 4v8"/>',
    padT: '<rect x="2.5" y="2.5" width="11" height="11" rx="1.5" opacity=".45"/><path d="M4 5h8"/>',
    padR: '<rect x="2.5" y="2.5" width="11" height="11" rx="1.5" opacity=".45"/><path d="M11 4v8"/>',
    padB: '<rect x="2.5" y="2.5" width="11" height="11" rx="1.5" opacity=".45"/><path d="M4 11h8"/>',
    padX: '<path d="M3 3v10M13 3v10"/><rect x="5.5" y="5.5" width="5" height="5" rx="1" opacity=".55"/>',
    padY: '<path d="M3 3h10M3 13h10"/><rect x="5.5" y="5.5" width="5" height="5" rx="1" opacity=".55"/>',
    padEach: '<rect x="2.5" y="2.5" width="11" height="11" rx="2"/><rect x="5" y="5" width="6" height="6" rx="1"/>',
    chevron: '<path d="m5 6.5 3 3 3-3"/>',
  };

  let padExpanded = false;
  let advanced = false;
  /** Last alignment-cell click (for double-click detection across re-renders). */
  let lastDot = { key: '', t: 0 };
  /** Fixed gap remembered per rule while it's in Auto (space-between), restored when packing again. */
  const savedGap = {};
  function lyValue(prop) {
    const d = st.decls.filter((x) => x.prop === prop && !x.disabled).pop();
    return d ? d.value : '';
  }
  function lyComputed(prop) {
    return (st.mode === 'current' && st.computed && st.computed[prop]) || '';
  }
  function px(v) {
    v = String(v).trim();
    return /^-?\d+(\.\d+)?$/.test(v) ? v + 'px' : v;
  }
  function apply(props) {
    post({ type: 'setProps', props });
  }
  function num(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : '';
  }

  // @ts-ignore — provided by media/sizing.js
  const SZ = window.ldSizing;
  /** Sizing context: the selected element's parent layout + its own display. */
  function sizeCtx() {
    return {
      parentDisplay: st.parentDisplay || '',
      parentDirection: st.parentDirection || 'row',
      display: (st.computed && st.computed.display) || lyValue('display') || 'block',
    };
  }

  function flowOf() {
    const d = lyValue('display') || lyComputed('display');
    if (/grid/.test(d)) return 'grid';
    if (/flex/.test(d)) return /column/.test(lyValue('flex-direction') || lyComputed('flex-direction')) ? 'vertical' : 'horizontal';
    return 'free';
  }

  const iconToggle = (inner, title, on, onclick, extraClass = '') =>
    (() => {
      const b = h('button', { class: `ly-iconbtn ${extraClass}${on ? ' on' : ''}`, title, 'aria-label': title.split('\n')[0], 'aria-pressed': String(!!on), onclick });
      b.append(svgIcon(inner));
      return b;
    })();

  /** A compact field: [icon or letter] value [▾ menu]. */
  function lyField({ prefix, prefixIcon, key, value, placeholder, title, onCommit, menu }) {
    const input = /** @type {HTMLInputElement} */ (h('input', { value, placeholder, 'data-focus-key': 'ly-' + key, 'aria-label': title.split('\n')[0], spellcheck: 'false',
      onchange: (e) => onCommit(/** @type {HTMLInputElement} */ (e.target).value),
      onkeydown: (e) => {
        // Nudging: ↑/↓ change by 1 (Shift: 10)
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        const el = /** @type {HTMLInputElement} */ (e.target);
        const m = /^(-?\d+(?:\.\d+)?)([a-z%]*)$/.exec(el.value || el.placeholder || '0');
        if (!m) return;
        e.preventDefault();
        const step = (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
        el.value = String(Math.round((parseFloat(m[1]) + step) * 100) / 100) + (m[2] || '');
        onCommit(el.value);
      } }));
    const f = h('div', { class: 'ly-field', title },
      prefixIcon ? svgIcon(prefixIcon) : h('span', { class: 'ly-prefix', text: prefix || '' }),
      input);
    if (menu) {
      const sel = h('select', { class: 'ly-menu', 'aria-label': menu.label, title: menu.title,
        onchange: (e) => menu.onPick(/** @type {HTMLSelectElement} */ (e.target).value) },
        ...menu.options.map(([v, t]) => h('option', { value: v, selected: v === menu.value, text: t })));
      const wrap = h('span', { class: 'ly-menuwrap' }, sel);
      wrap.append(svgIcon(ICONS.chevron, 14));
      f.append(wrap);
    }
    return f;
  }

  function layoutSection() {
    const flow = flowOf();
    const auto = flow !== 'free';

    // Header: "Auto layout" + add/remove toggle
    const head = h('div', { class: 'ly-head' },
      h('span', { class: 'ly-title', text: 'Auto layout' }),
      iconToggle(ICONS.autolayout, auto ? 'Remove auto layout\nBack to normal block flow' : 'Add auto layout\ndisplay: flex', auto,
        () => (auto ? setFlow('free') : setFlow('horizontal')), 'ly-accent'));

    // Flow
    const seg = h('div', { class: 'ly-seg', role: 'radiogroup', 'aria-label': 'Flow' },
      ...[
        ['free', 'Freeform\nNormal block flow'],
        ['vertical', 'Vertical\nflex-direction: column'],
        ['horizontal', 'Horizontal\nflex-direction: row'],
        ['grid', 'Grid\ndisplay: grid'],
      ].map(([k, title]) => {
        const b = h('button', { class: 'ly-segbtn' + (flow === k ? ' on' : ''), role: 'radio', 'aria-checked': String(flow === k), title, 'aria-label': title.split('\n')[0], onclick: () => setFlow(k) });
        b.append(svgIcon(ICONS[k]));
        return b;
      }));
    const wrapOn = (lyValue('flex-wrap') || lyComputed('flex-wrap')) === 'wrap';
    const flowRow = h('div', { class: 'ly-row ly-with-side' }, seg,
      iconToggle(ICONS.wrap, flow === 'horizontal' ? 'Wrap\nflex-wrap: wrap' : 'Wrap\nAvailable in Horizontal flow', wrapOn,
        () => flow === 'horizontal' && apply({ 'flex-wrap': wrapOn ? '' : 'wrap' }), flow === 'horizontal' ? '' : 'disabled'));

    // Dimensions
    const sctx = sizeCtx();
    const hugBoth = SZ.sizeMode(sctx, 'width', lyValue) === 'hug' && SZ.sizeMode(sctx, 'height', lyValue) === 'hug';
    const dimRow = h('div', { class: 'ly-row ly-with-side' },
      h('div', { class: 'ly-pair' }, dimField('width', 'W'), dimField('height', 'H')),
      iconToggle(ICONS.hug, hugBoth ? 'Hugging contents\nClick to return to Auto' : 'Resize to fit (Hug contents)\n' + SZ.describe(sctx, 'width', 'hug'), hugBoth,
        () => apply(hugBoth
          ? { ...SZ.sizeProps(sctx, 'width', 'auto'), ...SZ.sizeProps(sctx, 'height', 'auto') }
          : { ...SZ.sizeProps(sctx, 'width', 'hug'), ...SZ.sizeProps(sctx, 'height', 'hug') })));

    const parts = [head, h('div', { class: 'ly-label', text: 'Flow' }), flowRow, h('div', { class: 'ly-label', text: 'Dimensions' }), dimRow];

    if (auto) {
      // Alignment | Gap
      const between = (lyValue('justify-content') || lyComputed('justify-content')) === 'space-between';
      const gapVal = lyValue(flow === 'vertical' ? 'row-gap' : 'column-gap') || lyValue('gap');
      const gapField = lyField({
        prefixIcon: flow === 'vertical' ? ICONS.gapV : ICONS.gapH,
        key: 'gap',
        value: between ? 'Auto' : num(gapVal) && /px$/.test(gapVal) ? num(gapVal) : gapVal,
        placeholder: num(lyComputed('gap') || lyComputed('column-gap')) || '0',
        title: flow === 'vertical' ? 'Vertical gap between objects\ngap' : flow === 'grid' ? 'Gap between cells\ngap' : 'Horizontal gap between objects\ngap',
        onCommit: (v) => apply({ gap: /^auto$/i.test(v.trim()) ? '' : px(v), 'justify-content': /^auto$/i.test(v.trim()) && flow !== 'grid' ? 'space-between' : between ? '' : lyValue('justify-content') }),
        menu: flow === 'grid' ? null : {
          label: 'Gap mode', title: 'Gap mode\nAuto spreads items (space-between)',
          value: between ? 'auto' : 'fixed',
          options: [['fixed', 'Fixed gap'], ['auto', 'Auto (space between)']],
          onPick: (v) => {
            if (v === 'auto' && lyValue('gap')) savedGap[st.rule] = lyValue('gap');
            apply(v === 'auto' ? { 'justify-content': 'space-between', gap: '' } : { 'justify-content': '', gap: savedGap[st.rule] || '' });
          },
        },
      });
      parts.push(
        h('div', { class: 'ly-row ly-cols-head' }, h('span', { class: 'ly-label', text: 'Alignment' }), h('span', { class: 'ly-label', text: 'Gap' })),
        h('div', { class: 'ly-row ly-align' },
          alignMatrix(flow),
          h('div', { class: 'ly-gapcol' },
            h('div', { class: 'ly-with-side' }, gapField,
              iconToggle(ICONS.sliders, 'Advanced layout settings', advanced, () => { advanced = !advanced; render(); })))),
      );
      if (advanced || flow === 'grid') parts.push(advancedRows(flow));
    }

    // Padding
    const padToggle = iconToggle(ICONS.padEach, padExpanded ? 'Individual padding\nClick to edit horizontal / vertical' : 'Individual padding\npadding-top / right / bottom / left', padExpanded,
      () => { padExpanded = !padExpanded; render(); }, 'ly-accent');
    parts.push(h('div', { class: 'ly-label', text: 'Padding' }));
    if (padExpanded) {
      parts.push(
        h('div', { class: 'ly-row ly-with-side' }, h('div', { class: 'ly-pair' }, padField(['padding-left'], ICONS.padL, 'Left padding'), padField(['padding-top'], ICONS.padT, 'Top padding')), padToggle),
        h('div', { class: 'ly-row ly-with-side' }, h('div', { class: 'ly-pair' }, padField(['padding-right'], ICONS.padR, 'Right padding'), padField(['padding-bottom'], ICONS.padB, 'Bottom padding')), h('span', { class: 'ly-spacer' })),
      );
    } else {
      parts.push(h('div', { class: 'ly-row ly-with-side' },
        h('div', { class: 'ly-pair' },
          padField(['padding-left', 'padding-right'], ICONS.padX, 'Horizontal padding'),
          padField(['padding-top', 'padding-bottom'], ICONS.padY, 'Vertical padding')),
        padToggle));
    }

    // Clip content
    const clipped = (lyValue('overflow') || lyValue('overflow-x') || lyComputed('overflow-x')) === 'hidden';
    parts.push(h('label', { class: 'ly-check', title: 'Clip content\noverflow: hidden' },
      h('input', { type: 'checkbox', checked: clipped, onchange: (e) => apply(/** @type {HTMLInputElement} */ (e.target).checked ? { overflow: 'hidden' } : { overflow: '', 'overflow-x': '', 'overflow-y': '' }) }),
      h('span', { text: 'Clip content' })));

    return h('div', { class: 'ly-block' }, ...parts);
  }

  /** Extra rows behind the sliders button (and always for grid). */
  function advancedRows(flow) {
    const rows = [];
    if (flow === 'grid') {
      rows.push(h('div', { class: 'ly-pair' }, countField('grid-template-columns', 'Columns', 'Col'), countField('grid-template-rows', 'Rows', 'Row')));
      rows.push(h('div', { class: 'ly-pair' },
        lyField({ prefix: '↔', key: 'column-gap', value: lyValue('column-gap'), placeholder: num(lyComputed('column-gap')) || '0', title: 'Column gap\ncolumn-gap', onCommit: (v) => apply({ 'column-gap': px(v) }) }),
        lyField({ prefix: '↕', key: 'row-gap', value: lyValue('row-gap'), placeholder: num(lyComputed('row-gap')) || '0', title: 'Row gap\nrow-gap', onCommit: (v) => apply({ 'row-gap': px(v) }) })));
    } else {
      const wrap = (lyValue('flex-wrap') || lyComputed('flex-wrap')) === 'wrap';
      rows.push(h('div', { class: 'ly-pair' },
        lyField({ prefix: flow === 'vertical' ? '↔' : '↕', key: 'cross-gap', value: lyValue(flow === 'vertical' ? 'column-gap' : 'row-gap'), placeholder: '0',
          title: wrap ? 'Gap between rows\n' + (flow === 'vertical' ? 'column-gap' : 'row-gap') : 'Gap between wrapped lines\nTurn on Wrap to use this',
          onCommit: (v) => apply({ [flow === 'vertical' ? 'column-gap' : 'row-gap']: px(v) }) }),
        lyField({ prefix: 'Al', key: 'align-content', value: lyValue('align-content'), placeholder: 'normal', title: 'Align content\nalign-content (wrapped lines)',
          onCommit: (v) => apply({ 'align-content': v }) })));
      rows.push(h('label', { class: 'ly-check', title: 'Stretch children\nalign-items: stretch' },
        h('input', { type: 'checkbox', checked: lyValue('align-items') === 'stretch', onchange: (e) => apply({ 'align-items': /** @type {HTMLInputElement} */ (e.target).checked ? 'stretch' : '' }) }),
        h('span', { text: 'Stretch children to fill' })));
    }
    return h('div', { class: 'ly-advanced' }, ...rows);
  }

  function setFlow(k) {
    const clearFlex = { 'flex-direction': '', 'flex-wrap': '', 'justify-content': '', 'align-items': '' };
    const clearGrid = { 'grid-template-columns': '', 'grid-template-rows': '', 'justify-items': '' };
    if (k === 'free') apply({ display: '', gap: '', ...clearFlex, ...clearGrid });
    else if (k === 'vertical') apply({ display: 'flex', 'flex-direction': 'column', 'flex-wrap': '', ...clearGrid });
    else if (k === 'horizontal') apply({ display: 'flex', 'flex-direction': 'row', ...clearGrid });
    else apply({ display: 'grid', 'grid-template-columns': lyValue('grid-template-columns') || 'repeat(2, 1fr)', ...clearFlex });
  }

  /**
   * W / H with a sizing menu. Fill / Hug / Fixed write different CSS depending on the parent:
   * flex main axis → flex; flex cross axis / grid → align-self / justify-self; block → width (see sizing.js).
   */
  function dimField(prop, label) {
    const ctx = sizeCtx();
    const mode = SZ.sizeMode(ctx, prop, lyValue);
    const authored = lyValue(prop);
    const shown = mode === 'hug' ? 'Hug' : mode === 'fill' ? 'Fill' : /px$/.test(authored) ? num(authored) : authored;
    const name = prop === 'width' ? 'Width' : 'Height';
    const fixedFrom = () => px(/^-?\d/.test(authored) ? authored : num(lyComputed(prop) || (st.computed && st.computed[prop]) || '') || '100');
    const setMode = (m, v) => apply(SZ.sizeProps(ctx, prop, m, v));
    const c = SZ.contextOf(ctx, prop);
    return lyField({
      prefix: label, key: prop, value: shown, placeholder: num((st.computed && st.computed[prop]) || '') || 'Auto',
      title: `${name} — ${mode === 'auto' ? 'Auto' : mode[0].toUpperCase() + mode.slice(1)}\n${SZ.describe(ctx, prop, mode)}`,
      onCommit: (v) => {
        const t = v.trim().toLowerCase();
        if (t === 'hug' || t === 'fill' || t === 'auto') return setMode(t);
        if (!t) return setMode('auto');
        setMode('fixed', px(v));
      },
      menu: {
        label: `${name} sizing`,
        title: `${name} sizing (${c.where})\nFixed: ${SZ.describe(ctx, prop, 'fixed')}\nHug: ${SZ.describe(ctx, prop, 'hug')}\nFill: ${SZ.describe(ctx, prop, 'fill')}`,
        value: mode,
        options: [['fixed', `Fixed ${prop}`], ['hug', 'Hug contents'], ['fill', 'Fill container'], ['auto', 'Auto']],
        onPick: (m) => setMode(m, m === 'fixed' ? fixedFrom() : undefined),
      },
    });
  }

  function countField(prop, title, label) {
    const authored = lyValue(prop);
    const m = /^repeat\(\s*(\d+)\s*,\s*1fr\s*\)$/.exec(authored);
    const computedCount = (lyComputed(prop) || '').split(/\s+(?![^(]*\))/).filter((x) => x && x !== 'none').length;
    return lyField({ prefix: label, key: prop, value: m ? m[1] : authored, placeholder: computedCount ? String(computedCount) : '—',
      title: `${title}\n${prop}: repeat(n, 1fr)`,
      onCommit: (v) => apply({ [prop]: /^\d+$/.test(v.trim()) ? `repeat(${v.trim()}, 1fr)` : v }) });
  }

  function padField(props, iconSvg, title) {
    const authored = props.map(lyValue);
    const same = authored.every((v) => v === authored[0]);
    const v = same ? authored[0] : '';
    return lyField({
      prefixIcon: iconSvg, key: props.join('+'), value: /px$/.test(v) ? num(v) : v,
      placeholder: same ? num(lyComputed(props[0])) || '0' : 'Mixed',
      title: `${title}\n${props.join(' + ')}`,
      onCommit: (val) => apply(Object.fromEntries(props.map((p) => [p, px(val)]))),
    });
  }

  /** 3×3 alignment picker → justify-content / align-items (or justify-items for grid). */
  function alignMatrix(flow) {
    const norm = (v) => (/center/.test(v) ? 1 : /end|right|bottom/.test(v) ? 2 : 0);
    const isCol = flow === 'vertical';
    const mainProp = flow === 'grid' ? 'justify-items' : 'justify-content';
    const main = norm(lyValue(mainProp) || lyComputed(mainProp) || 'start');
    const cross = norm(lyValue('align-items') || lyComputed('align-items') || 'start');
    const between = (lyValue('justify-content') || lyComputed('justify-content')) === 'space-between';
    const cur = isCol ? { x: cross, y: main } : { x: main, y: cross };
    const VAL = ['flex-start', 'center', 'flex-end'];
    const GVAL = ['start', 'center', 'end'];
    const grid = h('div', { class: 'ly-matrix' + (isCol ? ' col' : '') + (between ? ' between' : ''), role: 'grid', 'aria-label': 'Alignment' });
    /**
     * Markers: packed → three bars of different lengths lined up on the cell's edge;
     * space between → one bar per cell along the chosen row (or column).
     */
    const marker = (x, y, single) => {
      const LEN = [6, 10, 7];
      const W = 1.8;
      const bars = single ? [{ len: LEN[isCol ? y : x], pos: 7.1 }] : LEN.map((len, i) => ({ len, pos: 3.6 + i * 3.5 }));
      const align = isCol ? x : y; // which edge the bars sit on (0 start, 1 center, 2 end)
      const rects = bars.map(({ len, pos }) => {
        const start = align === 0 ? 3 : align === 1 ? 8 - len / 2 : 13 - len;
        return isCol
          ? `<rect x="${start}" y="${pos}" width="${len}" height="${W}" rx="0.9"/>`
          : `<rect x="${pos}" y="${start}" width="${W}" height="${len}" rx="0.9"/>`;
      });
      return `<svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor" aria-hidden="true">${rects.join('')}</svg>`;
    };
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        const on = between ? (isCol ? x === cur.x : y === cur.y) : cur.x === x && cur.y === y;
        const label = `Align ${['top', 'middle', 'bottom'][y]} ${['left', 'center', 'right'][x]}`;
        const key = `${flow}:${x},${y}`;
        const btn = h('button', { class: 'ly-dot' + (on ? ' on' : '') + (between && on ? ' spread' : ''),
          title: `${label}\nDouble-click: ${between ? 'pack items (fixed gap)' : 'space between (Auto gap)'}`, 'aria-label': label, 'aria-pressed': String(on),
          // pointerdown (not click): the panel re-renders after each change, and a click whose
          // press and release land on different (re-rendered) buttons is dropped by the browser.
          onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); /** @type {HTMLElement} */ (e.currentTarget).dispatchEvent(new PointerEvent('pointerdown', { button: 0 })); } },
          onpointerdown: (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            // A native dblclick never fires across re-renders — detect the double-click by timing .
            const now = Date.now();
            const dbl = lastDot.key === key && now - lastDot.t < 450;
            lastDot = dbl ? { key: '', t: 0 } : { key, t: now };
            if (dbl && flow !== 'grid') {
              const crossVal = isCol ? VAL[x] : VAL[y];
              const mainVal = isCol ? VAL[y] : VAL[x];
              if (!between && lyValue('gap')) savedGap[st.rule] = lyValue('gap');
              apply(between
                ? { 'justify-content': mainVal, 'align-items': crossVal, gap: savedGap[st.rule] || '' }
                : { 'justify-content': 'space-between', 'align-items': crossVal, gap: '' });
              return;
            }
            if (dbl && flow === 'grid') {
              apply({ 'justify-content': between ? '' : 'space-between' });
              return;
            }
            if (flow === 'grid') apply({ 'justify-items': GVAL[x], 'align-items': GVAL[y] });
            else if (isCol) apply(between ? { 'align-items': VAL[x] } : { 'justify-content': VAL[y], 'align-items': VAL[x] });
            else apply(between ? { 'align-items': VAL[y] } : { 'justify-content': VAL[x], 'align-items': VAL[y] });
          } });
        if (on) btn.innerHTML = marker(x, y, between);
        grid.append(btn);
      }
    }
    return grid;
  }


  // Properties ----------------------------------------------------------------------
  function declFor(prop) {
    const ds = st.decls.filter((d) => d.prop === prop);
    return ds.find((d) => !d.disabled) || ds[0];
  }

  function group(g, editable, computedMode) {
    const set = new Set(st.decls.map((d) => d.prop));
    let names = Object.keys(g.props);
    if (g.id === 'more') names = [...set].filter((p) => !KNOWN.has(p));
    const rows = [];
    for (const name of names) {
      const def = g.props[name] || {};
      if (def.type === 'box') {
        const isSet = set.has(name) || def.sides.some((s) => set.has(s));
        if (st.showSet && !computedMode && !isSet) continue;
        rows.push(boxWidget(name, def.sides, editable, computedMode));
        continue;
      }
      if (name === 'display') {
        // Always show display in Layout (it drives the Flex / Grid blocks below it).
        if (!(st.showSet && !computedMode && !set.has(name))) rows.push(propRow(name, def, editable, computedMode));
        rows.push(...contextBlocks(editable, computedMode));
        continue;
      }
      if (st.showSet && !computedMode && !set.has(name)) continue;
      if (computedMode && !(st.computed && (st.computed[HINT[name] || name] !== undefined))) continue;
      rows.push(propRow(name, def, editable, computedMode));
    }
    if (g.id === 'more' && editable) rows.push(addPropRow());
    if (!rows.length && st.showSet && g.id !== 'more') return null;
    // Accordion: click the header to collapse / expand (remembered per group). Alt-click: only this one open.
    const key = 'grp-' + g.id;
    const open = ui.open[key] !== false;
    const nSet = g.id === 'more' ? [...set].filter((p) => !KNOWN.has(p)).length : Object.keys(g.props).filter((p) => set.has(p) || (g.props[p].sides || []).some((x) => set.has(x))).length;
    const toggle = (e) => {
      if (e.altKey) for (const x of GROUPS) ui.open['grp-' + x.id] = x.id === g.id;
      else ui.open[key] = !open;
      persist();
      render();
    };
    return h('div', { class: 'grp' + (open ? ' open' : ' closed'), id: key },
      h('button', { class: 'grp-title', 'aria-expanded': String(open), 'aria-controls': key + '-rows', 'data-group': g.id,
        title: `${open ? 'Collapse' : 'Expand'} ${g.label}\nAlt-click: show only ${g.label}`, onclick: toggle },
        icon(open ? 'chevron-down' : 'chevron-right'), icon(g.icon), h('span', { text: g.label }),
        nSet ? h('span', { class: 'grp-count', text: String(nSet), title: `${nSet} set in this rule` }) : null),
      !open ? null : rows.length ? h('div', { class: 'grp-rows', id: key + '-rows' }, ...rows) : h('p', { class: 'empty', text: 'Nothing set.' }));
  }

  // ---------------------------------------------------------------------------------------
  // Contextual Flex / Grid blocks (appear when display is flex or grid)
  // ---------------------------------------------------------------------------------------

  /** Tiny diagrams: three bars placed per justify / align value. */
  function barSvg(axis, value, dir) {
    const r = (x, y, w, hh) => `<rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="0.8" fill="currentColor"/>`;
    let inner = '<path d="M1.5 3v18M22.5 3v18" stroke="currentColor" stroke-width="1" opacity=".45"/>';
    if (axis === 'justify') {
      const X = { 'flex-start': [3, 7.5, 12], start: [3, 7.5, 12], center: [6.5, 11, 15.5], 'flex-end': [10, 14.5, 19], end: [10, 14.5, 19],
        'space-between': [3, 10.5, 18], 'space-around': [4.5, 10.5, 16.5], 'space-evenly': [5, 10.5, 16], stretch: [3, 10.5, 18], normal: [3, 7.5, 12] }[value] || [3, 7.5, 12];
      inner += X.map((x) => r(x, 7, 3, 10)).join('');
    } else {
      inner = '<path d="M3 1.5h18M3 22.5h18" stroke="currentColor" stroke-width="1" opacity=".45"/>';
      const H = [7, 11, 9];
      const xs = [5, 10.5, 16];
      inner += xs.map((x, i) => {
        if (value === 'stretch' || value === 'normal') return r(x, 3, 3, 18);
        if (value === 'center') return r(x, 12 - H[i] / 2, 3, H[i]);
        if (value === 'flex-end' || value === 'end') return r(x, 21 - H[i], 3, H[i]);
        if (value === 'baseline') return r(x, 9 - (i === 1 ? 2 : 0), 3, H[i]);
        return r(x, 3, 3, H[i]);
      }).join('');
      if (value === 'baseline') inner += '<path d="M3 13h18" stroke="currentColor" stroke-width="1" stroke-dasharray="2 1.5"/>';
    }
    const rot = dir && /column/.test(dir) ? ' transform="rotate(90 12 12)"' : '';
    return `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><g${rot}>${inner}</g></svg>`;
  }

  function svgBtnGroup(name, options, current, editable, render) {
    return h('span', { class: 'icon-group cd-iconrow', role: 'group', 'aria-label': name },
      ...options.map((o) => {
        const on = current === o;
        const pretty = o.replace(/^flex-/, '').replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
        const b = h('button', { class: 'icon-btn wide' + (on ? ' on' : ''), title: `${pretty}\n${name}: ${o}${on ? ' (click again to remove)' : ''}`, 'aria-label': `${name} ${o}`, 'aria-pressed': String(on), disabled: !editable,
          onclick: () => post({ type: 'setProp', prop: name, value: on ? '' : o }) });
        b.innerHTML = render(o);
        return b;
      }));
  }

  function valueOf(prop) {
    const d = declFor(prop);
    if (d && !d.disabled) return d.value;
    return st.mode === 'current' && st.computed ? st.computed[prop] || '' : '';
  }

  function ctxRow(name, control, title) {
    const d = declFor(name);
    return h('div', { class: ['prop', 'ctx', d ? 'is-set' : '', d && d.overridden ? 'overridden' : ''].join(' ') },
      h('span', { class: 'pname', title: title || name, text: name }), control,
      d && d.prop ? h('span', { class: 'prop-tools' }, iconBtn('trash', `Delete ${name}`, () => post({ type: 'removeProp', prop: name }))) : h('span', { class: 'prop-tools' }));
  }

  function textCtl(name, editable, list) {
    const d = declFor(name);
    const value = d && !d.disabled ? d.value : '';
    const hint = st.computed ? st.computed[name] : '';
    if (UN.LENGTH_PROPS.has(name)) return h('span', { class: 'ctl' }, unitField(name, value, hint, !editable, (v) => post({ type: 'setProp', prop: name, value: v })));
    return h('span', { class: 'ctl' }, h('input', { value, placeholder: hint || '', readonly: !editable, 'aria-label': name, 'data-focus-key': 'p:' + name, spellcheck: 'false', list: list ? 'dl-' + name : undefined,
      onchange: (e) => post({ type: 'setProp', prop: name, value: /** @type {HTMLInputElement} */ (e.target).value }) }),
      list ? h('datalist', { id: 'dl-' + name }, ...list.map((o) => h('option', { value: o }))) : null);
  }

  function contextBlocks(editable, computedMode) {
    const out = [];
    const disp = valueOf('display');
    const dir = valueOf('flex-direction') || 'row';
    const ARROWS = { row: 'arrow-right', 'row-reverse': 'arrow-left', column: 'arrow-down', 'column-reverse': 'arrow-up' };
    if (/flex/.test(disp)) {
      out.push(h('div', { class: 'ctx-title' }, icon('layout-panel-justify'), h('span', { text: 'Flex Container' })),
        ctxRow('flex-direction', h('span', { class: 'icon-group cd-iconrow' }, ...Object.entries(ARROWS).map(([v, ic]) => {
          const on = valueOf('flex-direction') === v;
          return h('button', { class: 'icon-btn wide' + (on ? ' on' : ''), title: `${{ row: 'Row', 'row-reverse': 'Row reverse', column: 'Column', 'column-reverse': 'Column reverse' }[v]}\nflex-direction: ${v}`, 'aria-label': 'flex-direction ' + v, 'aria-pressed': String(on), disabled: !editable, onclick: () => post({ type: 'setProp', prop: 'flex-direction', value: on ? '' : v }) }, icon(ic));
        }))),
        ctxRow('flex-wrap', h('span', { class: 'icon-group cd-iconrow' }, ...[['nowrap', 'arrow-right'], ['wrap', 'word-wrap'], ['wrap-reverse', 'arrow-swap']].map(([v, ic]) => {
          const on = valueOf('flex-wrap') === v;
          return h('button', { class: 'icon-btn wide' + (on ? ' on' : ''), title: `${{ nowrap: 'No wrap', wrap: 'Wrap', 'wrap-reverse': 'Wrap reverse' }[v]}\nflex-wrap: ${v}`, 'aria-label': 'flex-wrap ' + v, 'aria-pressed': String(on), disabled: !editable, onclick: () => post({ type: 'setProp', prop: 'flex-wrap', value: on ? '' : v }) }, icon(ic));
        }))),
        ctxRow('justify-content', svgBtnGroup('justify-content', ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'], valueOf('justify-content'), editable, (o) => barSvg('justify', o, dir))),
        ctxRow('align-items', svgBtnGroup('align-items', ['flex-start', 'center', 'flex-end', 'stretch', 'baseline'], valueOf('align-items'), editable, (o) => barSvg('align', o, dir))),
        valueOf('flex-wrap') && valueOf('flex-wrap') !== 'nowrap'
          ? ctxRow('align-content', svgBtnGroup('align-content', ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'stretch'], valueOf('align-content'), editable, (o) => barSvg('justify', o, 'column')))
          : null,
        ctxRow('gap', textCtl('gap', editable, ['4px', '8px', '12px', '16px', '1rem', '2rem'])),
        ctxRow('row-gap', textCtl('row-gap', editable)),
        ctxRow('column-gap', textCtl('column-gap', editable)));
    }
    if (/grid/.test(disp)) {
      out.push(h('div', { class: 'ctx-title' }, icon('layout'), h('span', { text: 'Grid Container' })),
        ctxRow('grid-template-columns', textCtl('grid-template-columns', editable, ['repeat(2, 1fr)', 'repeat(3, 1fr)', 'repeat(4, 1fr)', '1fr 2fr', '200px 1fr', 'repeat(auto-fit, minmax(200px, 1fr))'])),
        ctxRow('grid-template-rows', textCtl('grid-template-rows', editable, ['auto', 'repeat(2, 1fr)', 'auto 1fr auto'])),
        ctxRow('grid-template-areas', textCtl('grid-template-areas', editable)),
        ctxRow('grid-auto-flow', h('select', { disabled: !editable, 'aria-label': 'grid-auto-flow', onchange: (e) => post({ type: 'setProp', prop: 'grid-auto-flow', value: /** @type {HTMLSelectElement} */ (e.target).value }) },
          ...['', 'row', 'column', 'dense', 'row dense', 'column dense'].map((o) => h('option', { value: o, selected: o === (declFor('grid-auto-flow') || {}).value, text: o || '(default)' })))),
        ctxRow('gap', textCtl('gap', editable, ['8px', '16px', '24px', '1rem', '2rem'])),
        ctxRow('row-gap', textCtl('row-gap', editable)),
        ctxRow('column-gap', textCtl('column-gap', editable)),
        ctxRow('justify-items', svgBtnGroup('justify-items', ['start', 'center', 'end', 'stretch'], valueOf('justify-items'), editable, (o) => barSvg('justify', o))),
        ctxRow('align-items', svgBtnGroup('align-items', ['start', 'center', 'end', 'stretch'], valueOf('align-items'), editable, (o) => barSvg('align', o))),
        ctxRow('justify-content', svgBtnGroup('justify-content', ['start', 'center', 'end', 'space-between', 'space-around', 'space-evenly'], valueOf('justify-content'), editable, (o) => barSvg('justify', o))),
        ctxRow('align-content', svgBtnGroup('align-content', ['start', 'center', 'end', 'space-between', 'stretch'], valueOf('align-content'), editable, (o) => barSvg('justify', o, 'column'))));
    }
    const parent = st.parentDisplay || '';
    if (/flex/.test(parent)) {
      out.push(h('div', { class: 'ctx-title' }, icon('symbol-field'), h('span', { text: 'Flex Item (parent is flex)' })),
        ctxRow('flex-grow', textCtl('flex-grow', editable, ['0', '1'])),
        ctxRow('flex-shrink', textCtl('flex-shrink', editable, ['0', '1'])),
        ctxRow('flex-basis', textCtl('flex-basis', editable, ['auto', '0', '50%', '200px'])),
        ctxRow('align-self', svgBtnGroup('align-self', ['flex-start', 'center', 'flex-end', 'stretch', 'baseline'], valueOf('align-self'), editable, (o) => barSvg('align', o))),
        ctxRow('order', textCtl('order', editable)));
    } else if (/grid/.test(parent)) {
      out.push(h('div', { class: 'ctx-title' }, icon('symbol-field'), h('span', { text: 'Grid Item (parent is grid)' })),
        ctxRow('grid-column', textCtl('grid-column', editable, ['span 2', '1 / -1', '1 / 3'])),
        ctxRow('grid-row', textCtl('grid-row', editable, ['span 2', '1 / 3'])),
        ctxRow('grid-area', textCtl('grid-area', editable)),
        ctxRow('justify-self', svgBtnGroup('justify-self', ['start', 'center', 'end', 'stretch'], valueOf('justify-self'), editable, (o) => barSvg('justify', o))),
        ctxRow('align-self', svgBtnGroup('align-self', ['start', 'center', 'end', 'stretch'], valueOf('align-self'), editable, (o) => barSvg('align', o))),
        ctxRow('order', textCtl('order', editable)));
    }
    if (!out.length && !computedMode) {
      // Not flex/grid: keep any flex/grid props the rule sets visible so they can be edited/removed.
      for (const p of CONTEXT_PROPS) if (declFor(p)) out.push(propRow(p, {}, editable, computedMode));
      if (editable && !/flex|grid/.test(disp)) {
        out.push(h('div', { class: 'ctx-hint' },
          h('span', { text: 'Make this a ' }),
          h('button', { class: 'link', onclick: () => post({ type: 'setProp', prop: 'display', value: 'flex' }), text: 'flex' }),
          h('span', { text: ' or ' }),
          h('button', { class: 'link', onclick: () => post({ type: 'setProp', prop: 'display', value: 'grid' }), text: 'grid' }),
          h('span', { text: ' container' })));
      }
    }
    return out;
  }

  // @ts-ignore — provided by media/units.js
  const UN = window.ldUnits;
  const COMPUTED_TIP = 'Computed: the final values the browser actually uses for the selected element, after every matching rule, the cascade, inheritance and browser defaults are applied.\nRead-only. To change a value, edit one of the rules listed below it (or the element\'s inline style).';
  /**
   * Number field with automatic unit: typing "20" writes "20px" (or the unit picked in the
   * dropdown); the dropdown switches the unit or picks a keyword (auto / normal / none).
   */
  function unitField(prop, value, hint, readOnly, commit, opts = {}) {
    const parsed = UN.parse(value);
    let unit = UN.unitOf(prop, value || (opts.inheritUnit ? hint : ''));
    const shown = parsed.num !== undefined ? parsed.num : value || '';
    const hp = UN.parse(hint);
    const { units, keywords } = UN.optionsFor(prop);
    const input = /** @type {HTMLInputElement} */ (h('input', {
      value: shown, readonly: readOnly, spellcheck: 'false', 'aria-label': opts.label || prop, 'data-focus-key': 'u:' + (opts.key || prop),
      placeholder: hp.num !== undefined ? String(Math.round(parseFloat(hp.num) * 10) / 10) : hint || '',
      onchange: (e) => {
        const v = UN.normalize(prop, /** @type {HTMLInputElement} */ (e.target).value, unit);
        if (v !== value) commit(v);
      },
      onkeydown: (e) => {
        const el = /** @type {HTMLInputElement} */ (e.target);
        if (e.key === 'Escape') el.value = shown;
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        const p = UN.parse(el.value || (hp.num !== undefined ? hp.num : '0'));
        if (p.num === undefined) return;
        e.preventDefault();
        const step = (e.shiftKey ? 10 : e.altKey ? 0.1 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
        el.value = String(Math.round((parseFloat(p.num) + step) * 100) / 100);
        commit(UN.normalize(prop, el.value + (p.unit || ''), unit));
      },
    }));
    const opt = (v, text) => h('option', { value: v, selected: v === unit, text });
    const sel = units.length || keywords.length
      ? h('select', { class: 'u-unit', disabled: readOnly, 'aria-label': `${prop} unit`, title: `Unit\n${units.filter((u) => u !== '—').join(' · ')}${keywords.length ? ' · ' + keywords.join(' · ') : ''}`,
          onchange: (e) => {
            const choice = /** @type {HTMLSelectElement} */ (e.target).value;
            unit = choice;
            const nv = UN.withUnit(prop, value || (parsed.num === undefined ? '' : value), choice);
            if (nv !== null && nv !== value) commit(nv);
            else if (nv === null) input.focus(); // no number yet: the unit applies to what's typed next
          } },
          ...units.map((u) => opt(u, u === '—' ? '–' : u)),
          ...(keywords.length && units.length ? [h('option', { disabled: true, text: '──' })] : []),
          ...keywords.map((k) => opt(k, k)),
          // keep an unknown unit visible
          ...(![...units, ...keywords].includes(unit) ? [opt(unit, unit)] : []))
      : null;
    return h('span', { class: 'u-field' + (opts.compact ? ' compact' : '') + (parsed.keyword ? ' is-keyword' : '') }, input, sel);
  }

  function propRow(name, def, editable, computedMode) {
    const d = declFor(name);
    const hint = st.computed ? st.computed[HINT[name] || name] : '';
    const value = computedMode ? hint || '' : d ? d.value + (d.important ? ' !important' : '') : '';
    const commit = (v) => { if (v !== value) post({ type: 'setProp', prop: name, value: v }); };
    let control;
    const ro = !editable;
    if (def.type === 'select' && !ro) {
      control = h('select', { 'aria-label': name, onchange: (e) => commit(/** @type {HTMLSelectElement} */ (e.target).value) },
        h('option', { value: '', text: hint ? `(${hint})` : '' }),
        ...def.options.map((o) => h('option', { value: o, selected: o === value, text: o })),
        value && !def.options.includes(value) ? h('option', { value, selected: true, text: value }) : null);
    } else if (def.type === 'icons' && !ro) {
      control = h('span', { class: 'icon-group', role: 'group', 'aria-label': name },
        ...def.options.map(([v, ic]) => h('button', { class: 'icon-btn' + (value === v ? ' on' : ''), title: `${v.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())}\n${name}: ${v}${value === v ? ' (click again to remove)' : ''}`, 'aria-label': `${name} ${v}`, 'aria-pressed': String(value === v), onclick: () => commit(value === v ? '' : v) }, icon(ic))));
    } else if (UN.LENGTH_PROPS.has(name) && !def.type && !(d && d.important)) {
      control = h('span', { class: 'ctl' }, unitField(name, value, hint, ro, commit));
    } else {
      const input = /** @type {HTMLInputElement} */ (h('input', {
        value, readonly: ro, placeholder: hint || '', 'aria-label': name, spellcheck: 'false', 'data-focus-key': 'p:' + name,
        list: def.list ? 'dl-' + name : undefined,
        onchange: (e) => commit(/** @type {HTMLInputElement} */ (e.target).value),
        onkeydown: (e) => { if (e.key === 'Escape') /** @type {HTMLInputElement} */ (e.target).value = value; },
      }));
      control = h('span', { class: 'ctl' },
        def.type === 'color' ? colorSwatch(value || hint, ro, commit) : null,
        input,
        def.list ? h('datalist', { id: 'dl-' + name }, ...def.list.map((o) => h('option', { value: o }))) : null);
    }
    return h('div', { class: ['prop', d ? 'is-set' : '', d && d.disabled ? 'disabled' : '', d && d.overridden ? 'overridden' : ''].join(' ') },
      h('span', { class: 'pname', title: d && d.overridden ? `${name} — overridden by a more specific rule` : name, text: name }),
      control,
      editable && d ? h('span', { class: 'prop-tools' },
        h('input', { type: 'checkbox', checked: !d.disabled, title: d.disabled ? 'Enable property' : 'Disable property (comments it out)', 'aria-label': `Enable ${name}`,
          onchange: (e) => post({ type: 'toggleProp', prop: name, enable: /** @type {HTMLInputElement} */ (e.target).checked }) }),
        iconBtn('trash', `Delete ${name}`, () => post({ type: 'removeProp', prop: name }))) : h('span', { class: 'prop-tools' }));
  }

  function colorSwatch(value, ro, commit) {
    const hex = toHex(value);
    const sw = /** @type {HTMLInputElement} */ (h('input', { type: 'color', class: 'swatch', value: hex || '#000000', disabled: ro, title: value || 'Pick a color', 'aria-label': 'Color picker',
      onchange: (e) => commit(/** @type {HTMLInputElement} */ (e.target).value) }));
    if (!hex) sw.classList.add('unset');
    return sw;
  }

  function toHex(v) {
    if (!v) return '';
    const s = v.trim();
    if (/^#[0-9a-f]{6}$/i.test(s)) return s;
    if (/^#[0-9a-f]{3}$/i.test(s)) return '#' + [...s.slice(1)].map((c) => c + c).join('');
    const m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(s);
    if (m) return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
    return '';
  }

  function expand(v) {
    const p = (v || '').trim().split(/\s+(?![^(]*\))/).filter(Boolean);
    const [t = '', r = t, b = t, l = r] = p;
    return [t, r, b, l];
  }

  /** Per rule + box: which sides are linked ({ all, x, y }); falls back to what the shorthand implies. */
  const boxLinks = {};
  const LINK_ICONS = {
    all: '<path d="M6.5 9.5 9.5 6.5"/><path d="M7 4.5 8.2 3.3a2.6 2.6 0 0 1 3.7 3.7L10.7 8.2"/><path d="M9 11.5 7.8 12.7a2.6 2.6 0 0 1-3.7-3.7L5.3 7.8"/>',
    x: '<rect x="2.5" y="4.5" width="3" height="7" rx="1"/><rect x="10.5" y="4.5" width="3" height="7" rx="1"/><path d="M6.5 8h3"/>',
    y: '<rect x="4.5" y="2.5" width="7" height="3" rx="1"/><rect x="4.5" y="10.5" width="7" height="3" rx="1"/><path d="M8 6.5v3"/>',
  };

  function boxWidget(name, sides, editable, computedMode) {
    const short = declFor(name);
    const base = short && !short.disabled ? expand(short.value) : ['', '', '', ''];
    const vals = sides.map((s, i) => {
      const d = declFor(s);
      return d && !d.disabled ? d.value : base[i];
    });
    const linkKey = `${st.rule || ''}|${name}`;
    const links = boxLinks[linkKey] || UN.inferLinks(short && !short.disabled ? short.value : '');
    /** Writes the four sides: shorthand when it was already a shorthand or any sides are linked. */
    const write = (next, lk) => {
      if (next.every((v, k) => v === vals[k])) return;
      if ((short && !short.disabled) || lk.all || lk.x || lk.y) {
        const props = { [name]: UN.compressBox(next) };
        for (const s of sides) if (declFor(s)) props[s] = '';
        post({ type: 'setProps', props });
      } else {
        const i = next.findIndex((v, k) => v !== vals[k]);
        post({ type: 'setProp', prop: sides[i], value: next[i] });
      }
    };
    const commitSide = (i, v) => { if (v !== vals[i]) write(UN.linkBox(vals, i, v || '0', links), links); };
    const toggle = (kind) => {
      const on = !links[kind];
      const lk = kind === 'all' ? { all: on, x: on, y: on } : { all: false, x: links.x, y: links.y, [kind]: on };
      boxLinks[linkKey] = lk;
      if (on && vals.some((v) => v)) write(UN.applyLink(vals, kind), lk);
      render();
    };
    const cell = (i, pos) => {
      const hint = st.computed ? st.computed[sides[i]] : '';
      const v = computedMode ? hint || '' : vals[i];
      const f = unitField(sides[i], v, hint || '0px', !editable || computedMode, (nv) => commitSide(i, nv), { compact: true, key: sides[i] });
      f.classList.add('box-' + pos);
      if (links.all || (links.y && (i === 0 || i === 2)) || (links.x && (i === 1 || i === 3))) f.classList.add('linked');
      return f;
    };
    const label = name === 'margin' ? 'Margin' : 'Padding';
    const linkBtn = (kind, title) => {
      const on = kind === 'all' ? !!links.all : !!links[kind] && !links.all;
      const b = h('button', { class: 'icon-btn box-link' + (on ? ' on' : ''), title, 'aria-label': title.split('\n')[0], 'aria-pressed': String(on), 'data-link': `${name}:${kind}`,
        disabled: !editable || computedMode, onclick: () => toggle(kind) });
      b.append(svgIcon(LINK_ICONS[kind], 14));
      return b;
    };
    const isSet = !!short || sides.some((s) => declFor(s));
    return h('div', { class: 'prop box-prop' + (isSet ? ' is-set' : '') + (short && short.overridden ? ' overridden' : '') },
      h('span', { class: 'box-name' },
        h('span', { class: 'pname', text: name }),
        h('span', { class: 'box-links', role: 'group', 'aria-label': `${label} links` },
          linkBtn('all', `Link all sides\nOne value for all four: ${name}: 8px`),
          linkBtn('x', `Link left and right\n${name}: <top> 8px <bottom>`),
          linkBtn('y', `Link top and bottom\n${name}: 8px <right> 8px <left>`))),
      h('div', { class: 'box ' + name + (links.all ? ' all-linked' : '') }, cell(0, 't'), cell(1, 'r'), cell(2, 'b'), cell(3, 'l'),
        h('span', { class: 'box-c', text: name === 'margin' ? 'margin' : 'padding' })),
      editable && short ? h('span', { class: 'prop-tools' },
        h('input', { type: 'checkbox', checked: !short.disabled, title: 'Enable/disable', 'aria-label': `Enable ${name}`, onchange: (e) => post({ type: 'toggleProp', prop: name, enable: /** @type {HTMLInputElement} */ (e.target).checked }) }),
        iconBtn('trash', `Delete ${name}`, () => post({ type: 'removeProp', prop: name }))) : h('span', { class: 'prop-tools' }));
  }

  /** What's typed in the add-property row; kept across redraws (a style change can redraw mid-typing). */
  let draft = { rule: '', prop: '', val: '' };
  function addPropRow() {
    if (draft.rule !== st.rule) draft = { rule: st.rule, prop: '', val: '' };
    const commit = () => {
      const prop = draft.prop.trim();
      if (!prop) return;
      post({ type: 'setProp', prop, value: draft.val });
      draft = { rule: st.rule, prop: '', val: '' };
    };
    const n = /** @type {HTMLInputElement} */ (h('input', { placeholder: 'property', 'aria-label': 'New property name', 'data-focus-key': 'new-prop', spellcheck: 'false', value: draft.prop,
      oninput: () => { draft.prop = n.value; } }));
    const v = /** @type {HTMLInputElement} */ (h('input', { placeholder: 'value', 'aria-label': 'New property value', 'data-focus-key': 'new-val', spellcheck: 'false', value: draft.val,
      oninput: () => { draft.val = v.value; },
      onkeydown: (e) => { if (e.key === 'Enter') commit(); } }));
    return h('div', { class: 'prop add-prop' }, n, v, iconBtn('add', 'Add property', commit));
  }

  // Menus / messages -------------------------------------------------------------------
  function toggleMenu(wrap) {
    const menu = /** @type {HTMLElement} */ (wrap.querySelector('.menu'));
    const open = menu.hidden;
    document.querySelectorAll('.menu').forEach((m) => (/** @type {HTMLElement} */ (m).hidden = true));
    menu.hidden = !open;
    if (open) /** @type {HTMLElement|null} */ (menu.querySelector('button, input'))?.focus();
  }
  document.addEventListener('click', (e) => {
    if (!/** @type {HTMLElement} */ (e.target).closest('.menu-wrap')) document.querySelectorAll('.menu').forEach((m) => (/** @type {HTMLElement} */ (m).hidden = true));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.menu').forEach((m) => (/** @type {HTMLElement} */ (m).hidden = true));
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !(/** @type {HTMLElement} */ (e.target).tagName === 'INPUT')) {
      e.preventDefault();
      post({ type: 'undo' });
    }
  });

  let flashTimer = 0;
  function flash(text) {
    const f = document.getElementById('foot');
    if (!f) return;
    const prev = f.textContent;
    f.textContent = text;
    f.classList.add('flash');
    clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => { f.classList.remove('flash'); if (st) render(); else f.textContent = prev; }, 4000);
  }

  post({ type: 'ready' });
})();
