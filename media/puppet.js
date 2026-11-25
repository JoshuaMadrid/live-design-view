// @ts-check
// Demo/recording helper: a drawn pointer that glides to an element and "clicks" or "types",
// so scripted walkthroughs (screen recordings, tests) look like a person using the UI.
// Only reacts to { type: 'puppet' } messages sent by the extension's own demo scripts.
(function () {
  'use strict';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ARROW =
    '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 2.5v17.2l4.3-4.1 2.9 6.6 2.9-1.3-2.9-6.5 6-.3z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  /** @type {HTMLElement|null} */ let cur = null;
  let at = { x: -40, y: -40 };

  function cursor() {
    if (cur) return cur;
    cur = document.createElement('div');
    cur.id = 'ldPuppetCursor';
    cur.innerHTML = ARROW;
    Object.assign(cur.style, {
      position: 'fixed', left: '-40px', top: '-40px', width: '24px', height: '24px', zIndex: '2147483647',
      pointerEvents: 'none', opacity: '0', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.45))',
      transitionProperty: 'left, top, opacity', transitionTimingFunction: 'cubic-bezier(.45,0,.2,1)',
    });
    document.body.appendChild(cur);
    return cur;
  }

  /** Element for a target: { sel, text?, page?, nth? } (page = inside the rendered page frame). */
  function find(t) {
    let root = /** @type {Document} */ (document);
    let off = { x: 0, y: 0 };
    if (t.page) {
      const pg = /** @type {any} */ (window).ldPuppetPage;
      const d = pg && pg.doc();
      const f = pg && pg.frame();
      if (!d || !f) return null;
      root = d;
      const r = f.getBoundingClientRect();
      off = { x: r.left, y: r.top };
    }
    const all = [...root.querySelectorAll(t.sel || '*')];
    const list = t.text ? all.filter((n) => (n.textContent || '').trim() === t.text) : all;
    const n = list[t.nth || 0];
    return n ? { n: /** @type {HTMLElement} */ (n), off, root } : null;
  }

  function pointOf(h, t) {
    const r = h.n.getBoundingClientRect();
    return { x: h.off.x + r.left + r.width * (t.fx ?? 0.5), y: h.off.y + r.top + r.height * (t.fy ?? 0.5) };
  }

  async function glide(p, ms) {
    const c = cursor();
    const d = Math.hypot(p.x - at.x, p.y - at.y);
    const dur = ms ?? Math.max(350, Math.min(900, 250 + d * 0.9));
    c.style.transitionDuration = `${dur}ms, ${dur}ms, 200ms`;
    c.style.opacity = '1';
    c.style.left = p.x - 5 + 'px';
    c.style.top = p.y - 2 + 'px';
    at = p;
    await sleep(dur + 60);
  }

  function ripple(p) {
    const r = document.createElement('div');
    Object.assign(r.style, {
      position: 'fixed', left: p.x - 14 + 'px', top: p.y - 14 + 'px', width: '28px', height: '28px', borderRadius: '50%',
      background: 'rgba(124, 92, 255, .35)', border: '2px solid rgba(124, 92, 255, .8)', zIndex: '2147483646', pointerEvents: 'none',
      transform: 'scale(.3)', opacity: '1', transition: 'transform .35s ease-out, opacity .45s ease-out',
    });
    document.body.appendChild(r);
    requestAnimationFrame(() => { r.style.transform = 'scale(1.2)'; r.style.opacity = '0'; });
    setTimeout(() => r.remove(), 600);
  }

  function mouse(h, type, p, extra = {}) {
    const win = h.n.ownerDocument.defaultView;
    const local = { clientX: p.x - h.off.x, clientY: p.y - h.off.y };
    const Ev = type.startsWith('pointer') ? win.PointerEvent : win.MouseEvent;
    h.n.dispatchEvent(new Ev(type, { bubbles: true, cancelable: true, view: win, button: 0, ...local, ...extra }));
  }

  async function run(m) {
    const h = m.sel || m.text ? find(m) : null;
    if ((m.sel || m.text) && !h) return;
    if (h && m.scroll !== false) h.n.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const p = h ? pointOf(h, m) : { x: m.x ?? at.x, y: m.y ?? at.y };
    switch (m.op) {
      case 'hide':
        cursor().style.opacity = '0';
        return;
      case 'show':
        await glide(p, 0);
        return;
      case 'move':
        await glide(p, m.ms);
        if (h && m.page) mouse(h, 'mousemove', p);
        return;
      case 'click':
      case 'dblclick':
      case 'pointer': {
        await glide(p, m.ms);
        if (!h) return;
        await sleep(90);
        ripple(p);
        if (m.op === 'pointer') { mouse(h, 'pointerdown', p); mouse(h, 'pointerup', p); return; }
        if (m.page) {
          mouse(h, 'mousemove', p);
          if (/^(INPUT|TEXTAREA|SELECT)$/.test(h.n.tagName)) h.n.focus();
          mouse(h, 'click', p, { metaKey: !!m.meta });
          if (m.op === 'dblclick') { await sleep(80); mouse(h, 'click', p); mouse(h, 'dblclick', p); }
        } else if (h.n instanceof HTMLSelectElement && m.value !== undefined) {
          h.n.value = m.value;
          h.n.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          h.n.focus && h.n.focus();
          h.n.click();
        }
        return;
      }
      case 'type': {
        // Types into an input (or, with `page`, into the element being edited inline).
        if (h && m.glide !== false) await glide(p, m.ms);
        const cps = m.cps || 11;
        if (m.page && h) {
          const n = h.n;
          const isField = /^(INPUT|TEXTAREA)$/.test(n.tagName);
          const win = n.ownerDocument.defaultView;
          let typed = '';
          if (isField) {
            /** @type {HTMLInputElement} */ (n).focus();
            if (m.selectAll) { /** @type {HTMLInputElement} */ (n).select(); await sleep(250); }
            else typed = /** @type {HTMLInputElement} */ (n).value;
          } else if (!m.selectAll) typed = n.textContent || '';
          for (const ch of String(m.value ?? '')) {
            typed += ch;
            if (isField) {
              /** @type {HTMLInputElement} */ (n).value = typed;
              n.dispatchEvent(new win.Event('input', { bubbles: true }));
            } else {
              n.textContent = typed;
            }
            await sleep(1000 / cps);
          }
        } else {
          const el = /** @type {HTMLInputElement} */ (h ? h.n : document.activeElement);
          el.focus();
          if (m.replace) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }
          for (const ch of String(m.value ?? '')) {
            el.value += ch;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            await sleep(1000 / cps);
          }
          if (m.change) el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (m.enter) {
          await sleep(250);
          const t = /** @type {HTMLElement} */ (m.page ? null : document.activeElement) || document.body;
          t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        }
        return;
      }
      case 'drag': {
        // Press on an element, move by dx/dy in small steps (pointer follows), release.
        await glide(p, m.ms);
        if (!h) return;
        await sleep(120);
        mouse(h, 'pointerdown', p, { pointerId: 7 });
        const steps = m.steps || 14;
        for (let i = 1; i <= steps; i++) {
          const q = { x: p.x + (m.dx || 0) * (i / steps), y: p.y + (m.dy || 0) * (i / steps) };
          const c = cursor();
          c.style.transitionDuration = '0ms';
          c.style.left = q.x - 5 + 'px';
          c.style.top = q.y - 2 + 'px';
          at = q;
          mouse(h, 'pointermove', q, { pointerId: 7 });
          await sleep((m.dur || 700) / steps);
        }
        mouse(h, 'pointerup', at, { pointerId: 7 });
        return;
      }
      case 'key': {
        const t = /** @type {HTMLElement} */ (document.activeElement) || document.body;
        t.dispatchEvent(new KeyboardEvent('keydown', { key: m.key, bubbles: true, cancelable: true }));
        return;
      }
    }
  }
  /** @type {any} */ (window).ldPuppet = async (m) => {
    try {
      await run(m);
    } catch (e) {
      /* a missing target just skips the step */
    }
    const done = /** @type {any} */ (window).ldPuppetDone;
    if (done && m.id !== undefined) done(m.id);
  };
})();
