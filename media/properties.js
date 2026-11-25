// @ts-check
// Properties inspector (attributes panel): a horizontal strip, docked in the
// bottom panel, whose fields depend on the selected element's type.
(function () {
  'use strict';
  // @ts-ignore
  const vscode = acquireVsCodeApi();
  const root = /** @type {HTMLElement} */ (document.getElementById('props'));
  const post = (/** @type {any} */ m) => vscode.postMessage(m);
  /** @type {any} */ let info = null;
  /** @type {string[]} */ let classes = [];

  let optionsOpen = false;

  window.addEventListener('message', (ev) => {
    const m = ev.data;
    if (m.type !== 'selection') return;
    const sameEl = info && m.info && info.id === m.info.id && info.tag === m.info.tag;
    const active = /** @type {HTMLInputElement|null} */ (document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) ? document.activeElement : null);
    info = m.info;
    classes = m.classes || [];

    if (!sameEl) optionsOpen = false;
    // Don't rebuild under the cursor while typing in a field of the same element.
    if (active && sameEl && active.dataset.key && currentValue(active.dataset.key) === active.value) return;
    build(m.hasSession);
  });

  // ---------------------------------------------------------------------------
  // Field schema per element type
  // ---------------------------------------------------------------------------
  const T = (name, label, extra = {}) => ({ kind: 'text', name, label, ...extra });
  const S = (name, label, options, extra = {}) => ({ kind: 'select', name, label, options, ...extra });
  const B = (name, label) => ({ kind: 'bool', name, label: label || name[0].toUpperCase() + name.slice(1) });
  const BROWSE = (name, label, kindOf) => ({ kind: 'text', name, label, browse: kindOf || 'file' });
  const TARGETS = ['', '_blank', '_self', '_parent', '_top'];
  const FORMAT = { kind: 'format', label: 'Format' };
  const TEXT_LIKE = ['text', 'email', 'password', 'url', 'tel', 'search'];
  const RANGED = ['number', 'range', 'date', 'month', 'week', 'time', 'datetime-local'];

  /** @returns {{ icon: string, idLabel: string, fields: any[], bools: any[] }} */
  function schemaFor(i) {
    const tag = i.tag;
    const a = i.attrs;
    const type = (a.type || 'text').toLowerCase();
    switch (tag) {
      case 'img':
        return {
          icon: 'file-media', idLabel: 'Image ID',
          fields: [BROWSE('src', 'Src', 'image'), T('alt', 'Alt'), T('width', 'W', { small: true }), T('height', 'H', { small: true }), T('title', 'Title'),
            { kind: 'link', label: 'Link' }, { kind: 'linkTarget', label: 'Target' }, S('loading', 'Loading', ['', 'lazy', 'eager'])],
          bools: [],
        };
      case 'a':
        return {
          icon: 'link', idLabel: 'Link ID',
          fields: [BROWSE('href', 'Link'), S('target', 'Target', TARGETS), T('title', 'Title'), T('rel', 'Rel', { list: ['noopener', 'noreferrer', 'nofollow', 'external'] }), T('download', 'Download')],
          bools: [],
        };
      case 'form':
        return {
          icon: 'checklist', idLabel: 'Form ID',
          fields: [T('name', 'Name'), BROWSE('action', 'Action'), S('method', 'Method', ['', 'get', 'post', 'dialog']),
            S('enctype', 'Enctype', ['', 'application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain']), S('target', 'Target', TARGETS),
            S('autocomplete', 'Autocomplete', ['', 'on', 'off']), T('accept-charset', 'Accept Charset')],
          bools: [B('novalidate', 'No Validate')],
        };
      case 'input': {
        const fields = [S('type', 'Type', ['text', 'email', 'password', 'url', 'tel', 'search', 'number', 'range', 'color', 'date', 'month', 'week', 'time', 'datetime-local', 'checkbox', 'radio', 'file', 'hidden', 'image', 'submit', 'reset', 'button']), T('name', 'Name'), T('value', 'Value')];
        if (TEXT_LIKE.includes(type)) fields.push(T('placeholder', 'Place Holder'), T('size', 'Size', { small: true }), T('maxlength', 'Max Length', { small: true }), T('pattern', 'Pattern'), T('autocomplete', 'Autocomplete'), T('list', 'List'));
        if (RANGED.includes(type)) fields.push(T('min', 'Min', { small: true }), T('max', 'Max', { small: true }), T('step', 'Step', { small: true }));
        if (type === 'file') fields.push(T('accept', 'Accept', { list: ['image/*', '.pdf', '.png,.jpg', 'video/*'] }));
        if (type === 'image') fields.push(BROWSE('src', 'Src', 'image'), T('alt', 'Alt'));
        fields.push(T('title', 'Title'), T('tabindex', 'Tab Index', { small: true }), T('form', 'Form'));
        const bools = [B('required'), B('disabled'), B('readonly', 'Read Only'), B('autofocus', 'Auto Focus')];
        if (type === 'checkbox' || type === 'radio') bools.unshift(B('checked'));
        if (type === 'file' || type === 'email') bools.push(B('multiple'));
        return { icon: 'symbol-string', idLabel: 'Input ID', fields, bools };
      }
      case 'textarea':
        return {
          icon: 'note', idLabel: 'Text Area ID',
          fields: [T('name', 'Name'), T('rows', 'Rows', { small: true }), T('cols', 'Cols', { small: true }), T('placeholder', 'Place Holder'), T('maxlength', 'Max Length', { small: true }),
            S('wrap', 'Wrap', ['', 'soft', 'hard']), T('title', 'Title'), T('tabindex', 'Tab Index', { small: true })],
          bools: [B('required'), B('disabled'), B('readonly', 'Read Only'), B('autofocus', 'Auto Focus')],
        };
      case 'select':
        return {
          icon: 'chevron-down', idLabel: 'Select ID',
          fields: [T('name', 'Name'), T('size', 'Size', { small: true }), T('title', 'Title'), { kind: 'options', label: 'List Values' }],
          bools: [B('multiple'), B('required'), B('disabled'), B('autofocus', 'Auto Focus')],
        };
      case 'option':
        return { icon: 'list-flat', idLabel: 'Option ID', fields: [T('value', 'Value'), T('label', 'Label')], bools: [B('selected'), B('disabled')] };
      case 'button':
        return {
          icon: 'record-small', idLabel: 'Button ID',
          fields: [S('type', 'Type', ['button', 'submit', 'reset']), T('name', 'Name'), T('value', 'Value'), BROWSE('formaction', 'Form Action'), T('form', 'Form'), T('title', 'Title')],
          bools: [B('disabled'), B('autofocus', 'Auto Focus')],
        };
      case 'label':
        return { icon: 'tag', idLabel: 'Label ID', fields: [T('for', 'For', { list: i.formIds || [] }), FORMAT], bools: [] };
      case 'fieldset':
        return { icon: 'symbol-namespace', idLabel: 'Fieldset ID', fields: [T('name', 'Name'), T('form', 'Form')], bools: [B('disabled')] };
      case 'table':
        return {
          icon: 'table', idLabel: 'Table ID',
          fields: [T('width', 'W', { small: true }), T('border', 'Border', { small: true }), T('cellpadding', 'CellPad', { small: true }), T('cellspacing', 'CellSpace', { small: true }), T('summary', 'Summary')],
          bools: [],
        };
      case 'td':
      case 'th':
        return { icon: 'table', idLabel: 'Cell ID', fields: [T('colspan', 'Col Span', { small: true }), T('rowspan', 'Row Span', { small: true }), S('scope', 'Scope', ['', 'col', 'row', 'colgroup', 'rowgroup']), T('headers', 'Headers')], bools: [] };
      case 'iframe':
        return {
          icon: 'browser', idLabel: 'IFrame ID',
          fields: [BROWSE('src', 'Src'), T('title', 'Title'), T('width', 'W', { small: true }), T('height', 'H', { small: true }), S('loading', 'Loading', ['', 'lazy', 'eager']), T('allow', 'Allow'), T('name', 'Name')],
          bools: [B('allowfullscreen', 'Allow Fullscreen')],
        };
      case 'video':
        return {
          icon: 'device-camera-video', idLabel: 'Video ID',
          fields: [BROWSE('src', 'Src'), BROWSE('poster', 'Poster', 'image'), T('width', 'W', { small: true }), T('height', 'H', { small: true }), S('preload', 'Preload', ['', 'auto', 'metadata', 'none'])],
          bools: [B('controls'), B('autoplay', 'Auto Play'), B('loop'), B('muted'), B('playsinline', 'Plays Inline')],
        };
      case 'audio':
        return { icon: 'unmute', idLabel: 'Audio ID', fields: [BROWSE('src', 'Src'), S('preload', 'Preload', ['', 'auto', 'metadata', 'none'])], bools: [B('controls'), B('autoplay', 'Auto Play'), B('loop'), B('muted')] };
      case 'meta':
        return { icon: 'tag', idLabel: 'ID', fields: [T('name', 'Name', { list: ['description', 'keywords', 'viewport', 'author', 'robots', 'theme-color'] }), T('content', 'Content'), T('charset', 'Charset', { small: true }), T('http-equiv', 'Http-Equiv'), T('property', 'Property')], bools: [] };
      case 'link':
        return { icon: 'link-external', idLabel: 'ID', fields: [S('rel', 'Rel', ['stylesheet', 'icon', 'preconnect', 'preload', 'canonical', 'manifest', 'alternate']), BROWSE('href', 'Href'), T('type', 'Type'), T('media', 'Media')], bools: [] };
      case 'script':
        return { icon: 'file-code', idLabel: 'ID', fields: [BROWSE('src', 'Src'), S('type', 'Type', ['', 'module', 'text/babel', 'application/ld+json'])], bools: [B('defer'), B('async')] };
      case 'base':
        return { icon: 'home', idLabel: 'ID', fields: [T('href', 'Href'), S('target', 'Target', TARGETS)], bools: [] };
      case 'p': case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': case 'pre':
        return { icon: 'symbol-text', idLabel: 'ID', fields: [FORMAT, T('title', 'Title')], bools: [] };
      case 'div':
        return { icon: 'code', idLabel: 'Div ID', fields: [T('title', 'Title'), T('role', 'Role')], bools: [B('hidden')] };
      default:
        return { icon: 'symbol-structure', idLabel: 'ID', fields: [T('title', 'Title'), T('role', 'Role'), T('lang', 'Lang', { small: true })], bools: [B('hidden')] };
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
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
  const icon = (n) => h('i', { class: 'codicon codicon-' + n, 'aria-hidden': 'true' });

  function currentValue(key) {
    if (!info) return '';
    if (key === 'class') return (info.attrs.class || '').trim().split(/\s+/).filter(Boolean).join(' ');
    if (key === 'link') return info.parentLink ? info.parentLink.href : '';
    if (key === 'linkTarget') return info.parentLink ? info.parentLink.target : '';
    return info.attrs[key] ?? '';
  }

  function build(hasSession) {
    root.innerHTML = '';
    if (!info) {
      root.append(h('p', { class: 'empty', text: hasSession ? 'Select an element in the Design view or Structure panel.' : 'Open an HTML file in Design or Split view.' }));
      return;
    }
    const sc = schemaFor(info);
    const ro = !info.located;
    const badge = h('div', { class: 'pi-badge', title: `<${info.tag}>` }, h('div', { class: 'pi-icon' }, icon(sc.icon)), h('div', { class: 'pi-tag', text: info.tag }));

    const idBlock = h('div', { class: 'pi-col pi-ident' },
      field({ kind: 'text', name: 'id', label: sc.idLabel }, ro),
      classField(ro));
    // actions sit under ID / Class so the strip stays one row high

    const grid = h('div', { class: 'pi-fields' }, ...sc.fields.map((f) => field(f, ro)));
    const bools = sc.bools.length
      ? h('div', { class: 'pi-bools' }, ...sc.bools.map((b) => h('label', { class: 'pi-bool' },
          h('input', { type: 'checkbox', checked: b.name in info.attrs, disabled: ro, onchange: (e) => post({ type: 'setBool', id: info.id, name: b.name, on: /** @type {HTMLInputElement} */ (e.target).checked }) }),
          h('span', { text: b.label }))))
      : null;

    const actions = h('div', { class: 'pi-actions' },
      h('button', { class: 'pill', onclick: () => post({ type: 'openCss' }), title: 'Open the Styles panel for this element' }, h('span', { text: 'Styles' })),
      iconBtn('edit', 'Edit text (double-click in Design view)', () => post({ type: 'editText', id: info.id }), !info.textEditable),
      iconBtn('go-to-file', 'Go to code', () => post({ type: 'gotoCode', id: info.id })),
      iconBtn('arrow-up', 'Move up (Alt+↑)', () => post({ type: 'move', id: info.id, dir: 'up' }), ro),
      iconBtn('arrow-down', 'Move down (Alt+↓)', () => post({ type: 'move', id: info.id, dir: 'down' }), ro),
      info.crumbs.length > 1 ? iconBtn('arrow-small-up', `Select parent (${info.crumbs[info.crumbs.length - 2].label})`, () => post({ type: 'select', id: info.crumbs[info.crumbs.length - 2].id }), !info.crumbs[info.crumbs.length - 2].located) : null,
      iconBtn('trash', 'Delete element', () => post({ type: 'delete', id: info.id }), !info.canSiblings),
    );

    const others = Object.keys(info.attrs).filter((k) => !['id', 'class'].includes(k) && !sc.fields.some((f) => f.name === k) && !sc.bools.some((b) => b.name === k));
    const extra = h('details', { class: 'pi-more' },
      h('summary', { text: `All attributes${others.length ? ` (${others.length} more)` : ''}` }),
      h('div', { class: 'pi-fields' }, ...others.map((k) => field({ kind: 'text', name: k, label: k }, ro)), addAttr(ro)));

    idBlock.append(actions);
    root.append(h('div', { class: 'pi' }, badge, h('div', { class: 'pi-sep' }), idBlock, h('div', { class: 'pi-sep' }),
      h('div', { class: 'pi-col pi-main' }, grid, bools, optionsOpen && info.options ? optionsEditor() : null, extra)));
    if (ro) root.append(h('p', { class: 'empty', text: `<${info.tag}> isn't written in the source (the browser adds it), so it has no attributes to edit.` }));
  }

  function iconBtn(n, title, onclick, disabled) {
    return h('button', { class: 'icon-btn', title, 'aria-label': String(title).split('\n')[0], onclick, disabled: !!disabled }, icon(n));
  }

  function field(f, ro) {
    const wrap = (control) => h('label', { class: 'pi-field' + (f.small ? ' small' : '') }, h('span', { class: 'pi-label', text: f.label }), control);
    if (f.kind === 'format') {
      const opts = [['p', 'Paragraph'], ['h1', 'Heading 1'], ['h2', 'Heading 2'], ['h3', 'Heading 3'], ['h4', 'Heading 4'], ['h5', 'Heading 5'], ['h6', 'Heading 6'], ['pre', 'Preformatted'], ['div', 'None (div)']];
      return wrap(h('select', { disabled: ro, onchange: (e) => post({ type: 'renameTag', id: info.id, tag: /** @type {HTMLSelectElement} */ (e.target).value }) },
        ...opts.map(([v, l]) => h('option', { value: v, selected: v === info.tag, text: l })),
        opts.some(([v]) => v === info.tag) ? null : h('option', { value: info.tag, selected: true, text: info.tag })));
    }
    if (f.kind === 'options') {
      return wrap(h('button', { class: 'pill', disabled: ro, onclick: () => { optionsOpen = !optionsOpen; build(true); } }, h('span', { text: `${optionsOpen ? 'Hide' : 'Edit'} (${(info.options || []).length})` })));
    }
    if (f.kind === 'link' || f.kind === 'linkTarget') {
      const key = f.kind;
      const value = currentValue(key);
      if (key === 'linkTarget') {
        return wrap(h('select', { disabled: ro || !info.parentLink, title: info.parentLink ? '' : 'Set a Link first', onchange: (e) => post({ type: 'setLink', id: info.id, attr: 'target', value: /** @type {HTMLSelectElement} */ (e.target).value }) },
          ...TARGETS.map((t) => h('option', { value: t, selected: t === value, text: t || '(none)' }))));
      }
      return wrap(h('span', { class: 'ctl' },
        input(key, value, ro, (v) => post({ type: 'setLink', id: info.id, attr: 'href', value: v }), 'Wraps the image in <a href> (or edits its link)'),
        iconBtn('folder-opened', 'Browse for a file', () => post({ type: 'browse', id: info.id, name: 'href', link: true }), ro)));
    }
    const value = info.attrs[f.name] ?? '';
    if (f.kind === 'select') {
      return wrap(h('select', { disabled: ro, onchange: (e) => post({ type: 'setAttr', id: info.id, name: f.name, value: /** @type {HTMLSelectElement} */ (e.target).value }) },
        ...f.options.map((o) => h('option', { value: o, selected: o === value, text: o || '(none)' })),
        value && !f.options.includes(value) ? h('option', { value, selected: true, text: value }) : null));
    }
    const commit = (v) => post({ type: 'setAttr', id: info.id, name: f.name, value: v });
    const inp = input(f.name, value, ro, commit, undefined, f.list);
    return wrap(f.browse ? h('span', { class: 'ctl' }, inp, iconBtn('folder-opened', 'Browse for a file', () => post({ type: 'browse', id: info.id, name: f.name, kind: f.browse }), ro)) : inp);
  }

  function input(key, value, ro, commit, title, list) {
    const listId = list && list.length ? 'dl-' + key : undefined;
    const i = /** @type {HTMLInputElement} */ (h('input', { value, readonly: ro, spellcheck: 'false', 'data-key': key, title, list: listId,
      onchange: (e) => { const v = /** @type {HTMLInputElement} */ (e.target).value; if (v !== value) commit(v); },
      onkeydown: (e) => { if (e.key === 'Escape') /** @type {HTMLInputElement} */ (e.target).value = value; } }));
    if (!listId) return i;
    return h('span', { class: 'ctl' }, i, h('datalist', { id: listId }, ...list.map((o) => h('option', { value: o }))));
  }

  /** Class picker: shows current classes; pick from the page's stylesheets or type several. */
  function classField(ro) {
    const value = currentValue('class');
    const i = /** @type {HTMLInputElement} */ (h('input', { value, readonly: ro, spellcheck: 'false', 'data-key': 'class', list: 'dl-classes', placeholder: 'None',
      title: 'Classes separated by spaces; pick from your stylesheets',
      onchange: (e) => {
        const v = /** @type {HTMLInputElement} */ (e.target).value.trim();
        // Picking a single known class from the list adds it to the existing ones.
        const picked = classes.includes(v) && value && !value.split(/\s+/).includes(v) && !v.includes(' ') ? `${value} ${v}` : v;
        if (picked !== value) post({ type: 'setClasses', id: info.id, value: picked });
      } }));
    return h('label', { class: 'pi-field' }, h('span', { class: 'pi-label', text: 'Class' }),
      h('span', { class: 'ctl' }, i, h('datalist', { id: 'dl-classes' }, ...classes.map((c) => h('option', { value: c })))));
  }

  function addAttr(ro) {
    if (ro) return null;
    const n = /** @type {HTMLInputElement} */ (h('input', { placeholder: 'attribute', 'aria-label': 'New attribute name' }));
    const v = /** @type {HTMLInputElement} */ (h('input', { placeholder: 'value', 'aria-label': 'New attribute value',
      onkeydown: (e) => { if (e.key === 'Enter' && n.value.trim()) post({ type: 'setAttr', id: info.id, name: n.value.trim(), value: v.value }); } }));
    return h('div', { class: 'pi-field pi-add' }, n, v, iconBtn('add', 'Add attribute', () => n.value.trim() && post({ type: 'setAttr', id: info.id, name: n.value.trim(), value: v.value })));
  }

  /** <select> List Values editor (a "List Values…" dialog, inline). */
  function optionsEditor() {
    const rows = (info.options || []).map((o) => ({ ...o }));
    const table = h('div', { class: 'pi-options' });
    const redraw = () => {
      table.innerHTML = '';
      table.append(h('div', { class: 'opt-head' }, h('span', { text: 'Item Label' }), h('span', { text: 'Value' }), h('span', { text: 'Selected' }), h('span')));
      rows.forEach((r, idx) => {
        table.append(h('div', { class: 'opt-row' },
          h('input', { value: r.label, 'aria-label': 'Item label', oninput: (e) => (r.label = /** @type {HTMLInputElement} */ (e.target).value) }),
          h('input', { value: r.value, 'aria-label': 'Value', oninput: (e) => (r.value = /** @type {HTMLInputElement} */ (e.target).value) }),
          h('input', { type: 'checkbox', checked: r.selected, 'aria-label': 'Initially selected', onchange: (e) => (r.selected = /** @type {HTMLInputElement} */ (e.target).checked) }),
          iconBtn('close', 'Remove item', () => { rows.splice(idx, 1); redraw(); })));
      });
      table.append(h('div', { class: 'opt-foot' },
        h('button', { class: 'pill', onclick: () => { rows.push({ label: 'Option', value: String(rows.length + 1), selected: false }); redraw(); } }, icon('add'), h('span', { text: 'Add item' })),
        h('button', { class: 'pill primary', onclick: () => post({ type: 'setOptions', id: info.id, options: rows }) }, h('span', { text: 'Apply' }))));
    };
    redraw();
    return table;
  }

  post({ type: 'ready' });
})();
