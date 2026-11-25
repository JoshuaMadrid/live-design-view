// Fast, themed tooltips for every Live Design webview (replaces the slow native title tooltips).
// Any element with a title (or data-tip) gets one. A title's first line is the name; further
// lines (e.g. the CSS a control writes) show smaller underneath.
(function () {
  'use strict';
  const tip = document.createElement('div');
  tip.className = 'ld-tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  let current = null;
  let timer = 0;

  function attach() {
    if (!tip.isConnected && document.body) document.body.appendChild(tip);
  }

  function textOf(el) {
    // Move title -> data-tip so the browser's own tooltip never shows.
    const t = el.getAttribute('title');
    if (t !== null) {
      if (t) el.setAttribute('data-tip', t);
      el.removeAttribute('title');
    }
    return el.getAttribute('data-tip') || '';
  }

  function show(el) {
    const text = textOf(el);
    if (!text) return;
    attach();
    const [head, ...rest] = text.split('\n');
    tip.innerHTML = '';
    const h = document.createElement('div');
    h.className = 'ld-tip-head';
    h.textContent = head;
    tip.appendChild(h);
    if (rest.length) {
      const b = document.createElement('div');
      b.className = 'ld-tip-body';
      b.textContent = rest.join('\n');
      tip.appendChild(b);
    }
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let left = r.left + r.width / 2 - tw / 2;
    left = Math.max(6, Math.min(left, window.innerWidth - tw - 6));
    let top = r.bottom + 6;
    if (top + th > window.innerHeight - 4) top = r.top - th - 6;
    tip.style.left = left + 'px';
    tip.style.top = Math.max(4, top) + 'px';
  }

  function hide() {
    clearTimeout(timer);
    current = null;
    tip.hidden = true;
  }

  function targetOf(node) {
    return node && node.closest ? node.closest('[title], [data-tip]') : null;
  }

  document.addEventListener('mouseover', (e) => {
    const el = targetOf(e.target);
    if (el === current) return;
    clearTimeout(timer);
    current = el;
    if (!el) return void (tip.hidden = true);
    textOf(el);
    // Quick when moving between controls (tooltip already open), short delay otherwise.
    const delay = tip.hidden ? 350 : 60;
    timer = window.setTimeout(() => current === el && el.isConnected && show(el), delay);
  });
  document.addEventListener('mouseout', (e) => {
    if (current && !current.contains(/** @type {Node} */ (e.relatedTarget))) hide();
  });
  document.addEventListener('focusin', (e) => {
    const el = targetOf(e.target);
    if (el && el.matches(':focus-visible')) {
      current = el;
      show(el);
    }
  });
  document.addEventListener('focusout', hide);
  document.addEventListener('mousedown', hide, true);
  document.addEventListener('scroll', hide, true);
  window.addEventListener('blur', hide);
})();
