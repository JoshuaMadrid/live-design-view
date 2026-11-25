// CSS length units for the Styles panel's number fields: a bare number gets a unit (px by
// default), and a dropdown switches the unit or picks a keyword the property allows.
// Shared by the webview and the unit tests (UMD-style export).
(function (root) {
  'use strict';

  const UNITS = ['px', '%', 'em', 'rem', 'vw', 'vh', 'ch', 'pt'];

  /** Properties that take plain numbers (no unit added). */
  const UNITLESS = new Set(['z-index', 'opacity', 'flex-grow', 'flex-shrink', 'order', 'font-weight', 'orphans', 'widows', 'zoom', 'line-height', 'tab-size']);
  /** line-height accepts both: plain number (multiplier) or a length. */
  const UNITLESS_OR_LENGTH = new Set(['line-height']);

  const sides = (p) => [p, `${p}-top`, `${p}-right`, `${p}-bottom`, `${p}-left`];
  const AUTO = new Set(['width', 'height', 'min-width', 'min-height', 'top', 'right', 'bottom', 'left', 'flex-basis', 'inset', ...sides('margin')]);
  const NORMAL = new Set(['line-height', 'letter-spacing', 'word-spacing', 'gap', 'row-gap', 'column-gap']);
  const NONE = new Set(['max-width', 'max-height']);

  /** Properties that get the unit field (lengths). */
  const LENGTH_PROPS = new Set([
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'top', 'right', 'bottom', 'left', 'inset',
    ...sides('margin'), ...sides('padding'),
    'font-size', 'line-height', 'letter-spacing', 'word-spacing', 'text-indent',
    'border-width', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-radius', 'outline-width', 'outline-offset',
    'gap', 'row-gap', 'column-gap', 'flex-basis',
  ]);

  const NUM = /^(-?\d*\.?\d+)([a-z%]*)$/i;

  /** { num, unit } for a single length, { keyword } for a bare keyword, { raw } otherwise (calc(), var(), lists…). */
  function parse(value) {
    const v = String(value == null ? '' : value).trim();
    if (!v) return { empty: true };
    const m = NUM.exec(v);
    if (m) return { num: m[1], unit: m[2].toLowerCase() };
    if (/^[a-z-]+$/i.test(v)) return { keyword: v.toLowerCase() };
    return { raw: v };
  }

  /** Units and keywords offered for a property. */
  function optionsFor(prop) {
    const kw = [];
    if (AUTO.has(prop)) kw.push('auto');
    if (NORMAL.has(prop)) kw.push('normal');
    if (NONE.has(prop)) kw.push('none');
    const units = UNITLESS.has(prop) && !UNITLESS_OR_LENGTH.has(prop) ? [] : UNITS.slice();
    if (UNITLESS_OR_LENGTH.has(prop)) units.unshift('—'); // "—" = plain number
    return { units, keywords: kw };
  }

  /** The unit to show for a value (falls back to px, or "—" for unitless props). */
  function unitOf(prop, value) {
    const p = parse(value);
    if (p.keyword) return p.keyword;
    if (p.num !== undefined) return p.unit || (UNITLESS.has(prop) ? '—' : 'px');
    return UNITLESS.has(prop) ? '—' : 'px';
  }

  /**
   * What to write when the user types `input` with `unit` selected: bare numbers get the unit
   * ("20" → "20px"), anything with its own unit / keyword / calc() is kept as typed.
   */
  function normalize(prop, input, unit) {
    const v = String(input == null ? '' : input).trim();
    if (!v) return '';
    const p = parse(v);
    if (p.num !== undefined && !p.unit) {
      if (UNITLESS.has(prop) && (!UNITLESS_OR_LENGTH.has(prop) || !unit || unit === '—')) return p.num;
      const u = !unit || unit === '—' || !UNITS.includes(unit) ? 'px' : unit;
      return p.num + u;
    }
    return v;
  }

  /** New value after picking `choice` (unit or keyword) in the dropdown; null if nothing to write yet. */
  function withUnit(prop, value, choice) {
    if (choice === 'auto' || choice === 'normal' || choice === 'none') return choice;
    const p = parse(value);
    if (p.num === undefined) return null; // nothing to convert — the unit applies to the next number typed
    if (choice === '—') return p.num;
    return p.num + choice;
  }

  // Margin / padding box: linked sides and shorthand -----------------------------------
  // Sides are [top, right, bottom, left]. links = { all, x (left↔right), y (top↔bottom) }.

  /** Shortest shorthand for four side values ("10px", "10px 20px", "10px 20px 5px", "a b c d"). */
  function compressBox(vals) {
    const [t, r, b, l] = vals.map((v) => (v || '').trim() || '0');
    if (t === r && r === b && b === l) return t;
    if (t === b && r === l) return `${t} ${r}`;
    if (r === l) return `${t} ${r} ${b}`;
    return `${t} ${r} ${b} ${l}`;
  }

  /** Link state implied by an authored shorthand: 1 value → all, 2 → both pairs, 3 → left/right. */
  function inferLinks(shorthand) {
    const n = String(shorthand || '').trim().split(/\s+(?![^(]*\))/).filter(Boolean).length;
    return { all: n === 1, x: n === 1 || n === 2 || n === 3, y: n === 1 || n === 2 };
  }

  /** Side values after setting side `i` to `v`, with linked sides following. */
  function linkBox(vals, i, v, links) {
    const next = vals.slice();
    if (links && links.all) return [v, v, v, v];
    next[i] = v;
    if (links && links.y && (i === 0 || i === 2)) next[2 - i] = v;
    if (links && links.x && (i === 1 || i === 3)) next[4 - i] = v;
    return next;
  }

  /** Side values after turning a link on: the pair (or all four) take one value. */
  function applyLink(vals, kind) {
    const next = vals.slice();
    const pick = (...ix) => ix.map((k) => vals[k]).find((v) => v) || '';
    if (kind === 'all') { const v = pick(0, 3, 1, 2); return v ? [v, v, v, v] : next; }
    if (kind === 'y') { const v = pick(0, 2); if (v) next[0] = next[2] = v; }
    if (kind === 'x') { const v = pick(3, 1); if (v) next[1] = next[3] = v; }
    return next;
  }

  const api = { UNITS, LENGTH_PROPS, UNITLESS, parse, optionsFor, unitOf, normalize, withUnit, compressBox, inferLinks, linkBox, applyLink };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ldUnits = api;
})(typeof window !== 'undefined' ? window : globalThis);
