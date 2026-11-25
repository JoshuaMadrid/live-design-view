// @ts-check
// Elements panel (sidebar webview view). Click an item to insert it at the selection
// (the canvas shows Before / After / Wrap / Inside), or drag it onto the page.
(function () {
  'use strict';
  // @ts-ignore
  const vscode = acquireVsCodeApi();
  const list = /** @type {HTMLUListElement} */ (document.getElementById('list'));
  const select = /** @type {HTMLSelectElement} */ (document.getElementById('category'));
  const foot = /** @type {HTMLElement} */ (document.getElementById('foot'));
  const tabs = /** @type {HTMLElement} */ (document.getElementById('tabs'));
  /** @type {any} */ let data = null;
  let category = 'HTML';
  let headingLevel = 'h2';

  window.addEventListener('message', (ev) => {
    const m = ev.data;
    if (m.type === 'init') {
      data = m;
      category = m.category;
      headingLevel = m.headingLevel;
      select.innerHTML = '';
      for (const c of m.categories) {
        const o = document.createElement('option');
        o.value = o.textContent = c.name;
        select.appendChild(o);
      }
      select.value = category;
      buildTabs();
      build();
      setSession(m.hasSession);
    } else if (m.type === 'session') setSession(m.hasSession);
  });

  function setSession(has) {
    foot.textContent = has
      ? 'Click to place at the selection, or drag onto the page.'
      : 'Open an HTML file in Design or Split view to insert elements.';
    document.body.classList.toggle('no-session', !has);
  }

  function setCategory(c) {
    category = c;
    select.value = c;
    vscode.postMessage({ type: 'pref', name: 'insertCategory', value: category });
    buildTabs();
    build();
  }
  select.addEventListener('change', () => setCategory(select.value));

  /** Tab strip, shown when the panel is docked wide and short (e.g. in the bottom panel). */
  function buildTabs() {
    tabs.innerHTML = '';
    for (const c of data.categories) {
      const b = document.createElement('button');
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(c.name === category));
      b.textContent = c.name;
      b.addEventListener('click', () => setCategory(c.name));
      tabs.appendChild(b);
    }
  }

  function layout() {
    const bar = window.innerWidth >= 520 && window.innerHeight <= 240;
    document.body.classList.toggle('bar', bar);
  }
  window.addEventListener('resize', layout);
  layout();

  /** Tag-shaped glyph ("P", "H3", "div"). */
  function tagIcon(text) {
    const w = Math.max(22, 8 + text.length * 6.2);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${w + 6} 16`);
    svg.setAttribute('width', String(w + 6));
    svg.setAttribute('height', '16');
    svg.classList.add('tag-icon');
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', `M1 1.5h${w - 3}l5 6.5-5 6.5H1z`);
    const t = document.createElementNS(ns, 'text');
    t.setAttribute('x', String((w - 2) / 2 + 1));
    t.setAttribute('y', '11.5');
    t.setAttribute('text-anchor', 'middle');
    t.textContent = text;
    svg.append(p, t);
    return svg;
  }

  function icon(id) {
    const box = document.createElement('span');
    box.className = 'icon';
    if (id.startsWith('tag:')) box.appendChild(tagIcon(id.slice(4)));
    else {
      const i = document.createElement('i');
      i.className = 'codicon codicon-' + id;
      box.appendChild(i);
    }
    return box;
  }

  function snippetText(sn) {
    return sn.lines.map((/** @type {string} */ l) => l.replace(/^\t+/, (t) => '  '.repeat(t.length))).join('\n');
  }

  function build() {
    if (!data) return;
    list.innerHTML = '';
    const cat = data.categories.find((/** @type {any} */ c) => c.name === category) || data.categories[0];
    const keys = cat.groups ? cat.groups.flatMap((/** @type {any} */ g) => ['#' + g.name, ...g.items.filter((/** @type {string} */ k) => k !== '-')]) : cat.items;
    for (const key of keys) {
      if (key.startsWith('#')) {
        const li = document.createElement('li');
        li.className = 'group-head';
        li.textContent = key.slice(1);
        list.appendChild(li);
        continue;
      }
      if (key === '-') {
        const li = document.createElement('li');
        li.className = 'divider';
        li.setAttribute('role', 'separator');
        list.appendChild(li);
        continue;
      }
      const isHeading = key === 'heading';
      const snipKey = isHeading ? headingLevel : key;
      const sn = data.snippets[snipKey];
      const li = document.createElement('li');
      li.className = 'item';
      li.tabIndex = 0;
      li.draggable = true;
      li.dataset.key = snipKey;
      li.title = `${sn.name} <${sn.tag}>${sn.requires ? ' — adds ' + sn.requires.join(' + ') + ' to <head>' : ''}\nClick to place at the selection, or drag onto the page`;
      li.setAttribute('aria-label', sn.name);
      li.appendChild(icon(sn.icon));
      if (isHeading) {
        const lab = document.createElement('span');
        lab.className = 'label';
        lab.textContent = 'Heading';
        const lvl = document.createElement('select');
        lvl.className = 'level';
        lvl.setAttribute('aria-label', 'Heading level');
        for (let i = 1; i <= 6; i++) {
          const o = document.createElement('option');
          o.value = 'h' + i;
          o.textContent = 'H' + i;
          lvl.appendChild(o);
        }
        lvl.value = headingLevel;
        lvl.addEventListener('click', (e) => e.stopPropagation());
        lvl.addEventListener('change', () => {
          headingLevel = lvl.value;
          vscode.postMessage({ type: 'pref', name: 'headingLevel', value: headingLevel });
          build();
        });
        lab.appendChild(lvl);
        li.appendChild(lab);
      } else {
        const lab = document.createElement('span');
        lab.className = 'label';
        lab.textContent = sn.name;
        li.appendChild(lab);
      }
      const go = () => vscode.postMessage({ type: 'insert', key: li.dataset.key });
      li.addEventListener('click', go);
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go();
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const items = [...list.querySelectorAll('.item')];
          const i = items.indexOf(li) + (e.key === 'ArrowDown' ? 1 : -1);
          const next = /** @type {HTMLElement|undefined} */ (items[i]);
          if (next) next.focus();
        }
      });
      li.addEventListener('dragstart', (e) => {
        if (!e.dataTransfer) return;
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('application/x-live-design-tag', li.dataset.key || '');
        // Plain text too, so the snippet can also be dropped straight into a code editor.
        e.dataTransfer.setData('text/plain', snippetText(data.snippets[li.dataset.key || '']));
        li.classList.add('dragging');
      });
      li.addEventListener('dragend', () => li.classList.remove('dragging'));
      list.appendChild(li);
    }
  }

  vscode.postMessage({ type: 'ready' });
})();
