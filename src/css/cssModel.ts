/**
 * Pure CSS model + minimal text edits for the Styles panel (no vscode imports).
 * Parsing uses postcss only to get exact source ranges; edits are always small text
 * replacements at those ranges — the stylesheet is never re-serialized.
 */
import postcss, { type AtRule, type ChildNode, type Comment, type Declaration, type Rule } from 'postcss';
import type { TextEdit } from '../edits';

export interface CssDecl {
  prop: string;
  value: string;
  important: boolean;
  /** commented out ("disabled") in the source: /* prop: value; *\/ */
  disabled: boolean;
  start: number;
  end: number;
}

export interface CssMedia {
  id: number;
  params: string;
  start: number;
  end: number;
  open: number;
  close: number;
}

export interface CssRule {
  id: number;
  selector: string;
  parts: string[];
  /** id of the innermost @media containing the rule (undefined = global) */
  media?: number;
  start: number;
  end: number;
  /** offset of "{" and "}" */
  open: number;
  close: number;
  decls: CssDecl[];
  /** document order (for the cascade) */
  order: number;
}

export interface CssModel {
  text: string;
  rules: CssRule[];
  media: CssMedia[];
  error?: string;
}

const DISABLED_DECL = /^\s*([-\w]+)\s*:\s*([\s\S]*?)\s*;?\s*$/;

export function parseCss(text: string): CssModel {
  const model: CssModel = { text, rules: [], media: [] };
  let root;
  try {
    root = postcss.parse(text);
  } catch (e) {
    model.error = e instanceof Error ? e.message : String(e);
    return model;
  }
  const mediaIds = new Map<AtRule, number>();
  const range = (n: ChildNode) => ({ start: n.source!.start!.offset, end: n.source!.end!.offset });

  root.walk((n) => {
    if (n.type === 'atrule' && n.name.toLowerCase() === 'media') {
      const r = range(n);
      const open = text.indexOf('{', r.start);
      const m: CssMedia = { id: model.media.length, params: n.params, ...r, open, close: r.end - 1 };
      mediaIds.set(n, m.id);
      model.media.push(m);
    }
    if (n.type !== 'rule') return;
    // Skip keyframe steps ("from", "50%") — they aren't selectors.
    let p = n.parent as { type: string; parent?: unknown } | undefined;
    while (p && p.type === 'atrule') {
      if (/keyframes$/i.test((p as AtRule).name)) return;
      p = p.parent as typeof p;
    }
    let media: number | undefined;
    for (let q = n.parent as { type: string; parent?: unknown } | undefined; q; q = q.parent as typeof q) {
      if (q.type === 'atrule' && mediaIds.has(q as unknown as AtRule)) {
        media = mediaIds.get(q as unknown as AtRule);
        break;
      }
    }
    const r = range(n);
    const open = text.indexOf('{', r.start);
    const rule: CssRule = {
      id: model.rules.length,
      selector: n.selector,
      parts: splitSelector(n.selector),
      media,
      ...r,
      open,
      close: r.end - 1,
      decls: [],
      order: model.rules.length,
    };
    for (const c of (n as Rule).nodes ?? []) {
      if (c.type === 'decl') {
        const d = c as Declaration;
        rule.decls.push({ prop: d.prop.toLowerCase(), value: d.value, important: !!d.important, disabled: false, ...range(d) });
      } else if (c.type === 'comment') {
        const m = DISABLED_DECL.exec((c as Comment).text);
        if (m) rule.decls.push({ prop: m[1].toLowerCase(), value: m[2].replace(/\s*!important$/i, ''), important: /!important$/i.test(m[2]), disabled: true, ...range(c) });
      }
    }
    model.rules.push(rule);
  });
  return model;
}

/** Splits "a, b > c, d:is(e, f)" on top-level commas. */
export function splitSelector(sel: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of sel) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** [ids, classes/attributes/pseudo-classes, types/pseudo-elements] */
export type Specificity = [number, number, number];

export function specificity(part: string): Specificity {
  let s = part;
  let a = 0;
  let b = 0;
  let c = 0;
  // :where() contributes nothing; :is()/:not()/:has() take their argument's specificity.
  s = s.replace(/:where\((?:[^()]|\([^()]*\))*\)/g, '');
  s = s.replace(/:(?:is|not|has|matches)\(((?:[^()]|\([^()]*\))*)\)/g, (_m, inner: string) => {
    const best = splitSelector(inner).map(specificity).sort(compareSpecificity).pop() ?? [0, 0, 0];
    a += best[0];
    b += best[1];
    c += best[2];
    return ' ';
  });
  s = s.replace(/\[[^\]]*\]/g, () => (b++, ' '));
  s = s.replace(/#[-\w]+/g, () => (a++, ' '));
  s = s.replace(/\.[-\w]+/g, () => (b++, ' '));
  s = s.replace(/::[-\w]+(\([^)]*\))?|:(?:before|after|first-line|first-letter)\b/gi, () => (c++, ' '));
  s = s.replace(/:[-\w]+(\([^)]*\))?/g, () => (b++, ' '));
  s.replace(/(^|[\s>+~])([a-zA-Z][-\w]*)/g, (_m) => {
    c++;
    return '';
  });
  return [a, b, c];
}

export function compareSpecificity(x: Specificity, y: Specificity): number {
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

/** Selector usable with Element.matches(): state pseudos and pseudo-elements removed. */
export function matchableSelector(part: string): { selector: string; state: boolean } {
  let state = false;
  const sel = part
    .replace(/::?(?:before|after|first-line|first-letter|placeholder|selection|marker|backdrop|file-selector-button)\b(\([^)]*\))?/gi, () => {
      state = true;
      return '';
    })
    .replace(/:(?:hover|focus|focus-within|focus-visible|active|visited|link|target|checked|disabled|enabled|invalid|valid|placeholder-shown)\b/gi, () => {
      state = true;
      return '';
    })
    .trim();
  return { selector: sel || '*', state };
}

// ---------------------------------------------------------------------------
// Edits
// ---------------------------------------------------------------------------

const lineStart = (t: string, o: number) => t.lastIndexOf('\n', o - 1) + 1;
const lineEnd = (t: string, o: number) => {
  const i = t.indexOf('\n', o);
  return i === -1 ? t.length : i;
};
const indentAt = (t: string, o: number) => /^[ \t]*/.exec(t.slice(lineStart(t, o)))![0];

export function detectCssIndent(text: string): string {
  const m = /\{[ \t]*\n([ \t]+)\S/.exec(text);
  if (!m) return '  ';
  const inner = m[1];
  const outer = indentAt(text, m.index);
  return inner.startsWith(outer) && inner.length > outer.length ? inner.slice(outer.length) : inner;
}

/** Range of a node, widened to whole line(s) when it's alone on them. */
function wholeLines(t: string, start: number, end: number) {
  const before = t.slice(lineStart(t, start), start);
  const after = t.slice(end, lineEnd(t, end));
  if (/^[ \t]*$/.test(before) && /^[ \t]*$/.test(after)) {
    let e = lineEnd(t, end);
    if (t[e] === '\n') e++;
    return { start: lineStart(t, start), end: e };
  }
  return { start, end };
}

function declText(prop: string, value: string, important: boolean) {
  return `${prop}: ${value.trim()}${important ? ' !important' : ''};`;
}

/** Sets (or adds) a declaration; an empty value removes it. Disabled copies are re-enabled. */
export function setDeclaration(model: CssModel, ruleId: number, prop: string, value: string): TextEdit[] {
  const rule = model.rules[ruleId];
  if (!rule) return [];
  const t = model.text;
  prop = prop.trim().toLowerCase();
  let important = false;
  value = value.trim().replace(/\s*!important$/i, () => {
    important = true;
    return '';
  });
  const existing = [...rule.decls].reverse().find((d) => d.prop === prop && !d.disabled) ?? [...rule.decls].reverse().find((d) => d.prop === prop);
  if (!value) return existing ? removeDeclaration(model, ruleId, prop) : [];
  if (existing) {
    if (!existing.disabled && existing.value === value && existing.important === important) return [];
    return [{ start: existing.start, end: existing.end, text: declText(prop, value, important) }];
  }
  return insertDeclaration(t, rule, declText(prop, value, important));
}

function insertDeclaration(t: string, rule: CssRule, decl: string): TextEdit[] {
  const body = t.slice(rule.open + 1, rule.close);
  const edits: TextEdit[] = [];
  const last = rule.decls.filter((d) => !d.disabled).at(-1);
  if (last && t[last.end - 1] !== ';') edits.push({ start: last.end, end: last.end, text: ';' });
  if (!body.includes('\n')) {
    if (!body.trim()) return [{ start: rule.open + 1, end: rule.close, text: ' ' + decl + ' ' }];
    // Single-line rule: keep it on one line.
    const at = rule.close - (/[ \t]*$/.exec(body)![0].length);
    const semi = edits.length && edits[0].start === at ? edits.shift()!.text : '';
    edits.push({ start: at, end: at, text: semi + ' ' + decl });
    return edits;
  }
  const ruleIndent = indentAt(t, rule.start);
  const declIndent = rule.decls.length ? indentAt(t, rule.decls[rule.decls.length - 1].start) : ruleIndent + detectCssIndent(t);
  if (!body.trim()) return [{ start: rule.open + 1, end: rule.close, text: `\n${declIndent}${decl}\n${ruleIndent}` }];
  const tail = /\n[ \t]*$/.exec(body);
  const at = tail ? rule.close - tail[0].length : rule.close;
  // A missing ";" on the last declaration at the same offset goes into the same edit.
  const semi = edits.length && edits[0].start === at ? edits.shift()!.text : '';
  edits.push({ start: at, end: at, text: `${semi}\n${declIndent}${decl}` + (tail ? '' : `\n${ruleIndent}`) });
  return edits;
}

export function removeDeclaration(model: CssModel, ruleId: number, prop: string): TextEdit[] {
  const rule = model.rules[ruleId];
  if (!rule) return [];
  const t = model.text;
  return rule.decls
    .filter((d) => d.prop === prop)
    .map((d) => {
      const r = wholeLines(t, d.start, d.end);
      // Same-line declaration: also drop one separating space so "a; b; c" doesn't become "a;  c".
      if (r.start === d.start && t[r.start - 1] === ' ' && /[ }]/.test(t[r.end] ?? '')) r.start -= 1;
      return { ...r, text: '' };
    })
    .sort((a, b) => b.start - a.start);
}

/** Comments a declaration out (disable) or back in (enable), like a toggle. */
export function toggleDeclaration(model: CssModel, ruleId: number, prop: string, enable: boolean): TextEdit[] {
  const rule = model.rules[ruleId];
  const d = rule && [...rule.decls].reverse().find((x) => x.prop === prop && x.disabled === enable);
  if (!d) return [];
  return [{ start: d.start, end: d.end, text: enable ? declText(d.prop, d.value, d.important) : `/* ${declText(d.prop, d.value, d.important)} */` }];
}

/** Adds an empty rule at the end of the given @media block, or of the stylesheet. */
export function addRule(model: CssModel, selector: string, mediaId?: number): { edits: TextEdit[]; selectorStart: number } {
  const t = model.text;
  const unit = detectCssIndent(t);
  const m = mediaId !== undefined ? model.media[mediaId] : undefined;
  if (m) {
    const ind = indentAt(t, m.start) + unit;
    const body = t.slice(m.open + 1, m.close);
    const tail = /\n[ \t]*$/.exec(body);
    const at = tail ? m.close - tail[0].length : m.close;
    const sep = body.trim() ? '\n' : '';
    const text = `${sep}\n${ind}${selector} {\n${ind}}` + (tail ? '' : '\n' + indentAt(t, m.start));
    return { edits: [{ start: at, end: at, text }], selectorStart: at + text.indexOf(selector) };
  }
  const prefix = t.length === 0 ? '' : t.endsWith('\n\n') ? '' : t.endsWith('\n') ? '\n' : '\n\n';
  const text = `${prefix}${selector} {\n}\n`;
  return { edits: [{ start: t.length, end: t.length, text }], selectorStart: t.length + prefix.length };
}

export function addMedia(model: CssModel, condition: string): TextEdit[] {
  const t = model.text;
  const cond = condition.trim().replace(/^@media\s+/i, '');
  const prefix = t.length === 0 ? '' : t.endsWith('\n\n') ? '' : t.endsWith('\n') ? '\n' : '\n\n';
  return [{ start: t.length, end: t.length, text: `${prefix}@media ${cond} {\n}\n` }];
}

export function removeRule(model: CssModel, ruleId: number): TextEdit[] {
  const r = model.rules[ruleId];
  return r ? [{ ...wholeLines(model.text, r.start, r.end), text: '' }] : [];
}

export function removeMedia(model: CssModel, mediaId: number): TextEdit[] {
  const m = model.media[mediaId];
  return m ? [{ ...wholeLines(model.text, m.start, m.end), text: '' }] : [];
}

/** Expands margin/padding shorthand into [top, right, bottom, left]. */
export function expandBox(value: string): [string, string, string, string] {
  const v = value.trim().split(/\s+(?![^(]*\))/).filter(Boolean);
  const [t = '', r = t, b = t, l = r] = v;
  return [t, r, b, l];
}

export function collapseBox(sides: [string, string, string, string]): string {
  const [t, r, b, l] = sides.map((s) => s || '0');
  if (t === r && r === b && b === l) return t;
  if (t === b && r === l) return `${t} ${r}`;
  if (r === l) return `${t} ${r} ${b}`;
  return `${t} ${r} ${b} ${l}`;
}

/**
 * Sets several declarations on one rule ("" removes a property) as ONE edit that replaces just
 * that rule's text — so the change is a single undo step and nothing else in the file moves.
 */
export function setDeclarations(model: CssModel, ruleId: number, props: Record<string, string>): TextEdit[] {
  const rule = model.rules[ruleId];
  if (!rule) return [];
  let text = model.text;
  let m = model;
  let id = ruleId;
  for (const [prop, value] of Object.entries(props)) {
    const edits = setDeclaration(m, id, prop, value);
    if (!edits.length) continue;
    text = [...edits].sort((a, b) => b.start - a.start).reduce((t, e) => t.slice(0, e.start) + e.text + t.slice(e.end), text);
    const before = m.rules[id];
    m = parseCss(text);
    // Same rule = same start offset (only this rule's body changed).
    id = m.rules.findIndex((r) => r.start === before.start);
    if (id < 0) return [];
  }
  const after = m.rules[id];
  const newRuleText = text.slice(after.start, after.end);
  if (newRuleText === model.text.slice(rule.start, rule.end)) return [];
  return [{ start: rule.start, end: rule.end, text: newRuleText }];
}

/** Parses a style="" attribute value into ordered [prop, value] pairs. */
export function parseInlineStyle(style: string): [string, string][] {
  const out: [string, string][] = [];
  for (const part of style.split(/;(?![^(]*\))/)) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const p = part.slice(0, i).trim().toLowerCase();
    const v = part.slice(i + 1).trim();
    if (p) out.push([p, v]);
  }
  return out;
}

/** Applies prop changes ("" removes) to a style="" value, keeping the other declarations in order. */
export function updateInlineStyle(style: string, props: Record<string, string>): string {
  const decls = parseInlineStyle(style);
  for (const [p, v] of Object.entries(props)) {
    const i = decls.findIndex(([q]) => q === p);
    if (!v.trim()) {
      if (i >= 0) decls.splice(i, 1);
    } else if (i >= 0) decls[i] = [p, v.trim()];
    else decls.push([p, v.trim()]);
  }
  return decls.map(([p, v]) => `${p}: ${v}`).join('; ') + (decls.length ? ';' : '');
}

// ---------------------------------------------------------------------------
// Grid track lists (grid-template-columns / rows)
// ---------------------------------------------------------------------------

/** Splits a track list on top-level whitespace: "repeat(2, 1fr) minmax(100px, 1fr)" → 2 tokens. */
export function splitTracks(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of value.trim()) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (cur) out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Expands a track list to one token per track. repeat(N, …) with a number is expanded;
 * auto-fill / auto-fit and named lines can't be edited per track, so they return undefined.
 */
export function expandTracks(value: string): string[] | undefined {
  const v = value.trim();
  if (!v || v === 'none') return [];
  if (/\[|auto-fill|auto-fit|subgrid|masonry/.test(v)) return undefined;
  const out: string[] = [];
  for (const tok of splitTracks(v)) {
    const m = /^repeat\(\s*(\d+)\s*,\s*([\s\S]+)\)$/.exec(tok);
    if (m) {
      const inner = splitTracks(m[2]);
      for (let i = 0; i < Number(m[1]); i++) out.push(...inner);
    } else out.push(tok);
  }
  return out;
}

/** Joins tracks back, using repeat(n, x) when every track is the same. */
export function compressTracks(tracks: string[]): string {
  if (!tracks.length) return '';
  if (tracks.length > 1 && tracks.every((t) => t === tracks[0])) return `repeat(${tracks.length}, ${tracks[0]})`;
  return tracks.join(' ');
}

/** Applies a track edit: set one track's size, add a track at the end, or remove one. */
export function editTracks(tracks: string[], op: 'set' | 'add' | 'remove', index: number, value?: string): string[] {
  const t = tracks.slice();
  if (op === 'set' && index >= 0 && index < t.length && value?.trim()) t[index] = value.trim();
  else if (op === 'add') t.splice(index >= 0 && index <= t.length ? index : t.length, 0, value?.trim() || t[t.length - 1] || '1fr');
  else if (op === 'remove' && t.length > 1 && index >= 0 && index < t.length) t.splice(index, 1);
  return t;
}

// ---------------------------------------------------------------------------
// Reordering rules (Styles panel: drag selectors)
// ---------------------------------------------------------------------------

/** Start of a rule including a comment block directly above it (no blank line in between). */
function startWithComment(t: string, start: number): number {
  let s = lineStart(t, start);
  for (;;) {
    if (s === 0) break;
    const prevStart = lineStart(t, s - 1);
    const prev = t.slice(prevStart, s - 1);
    if (/^\s*\/\*[\s\S]*\*\/\s*$/.test(prev) || /^\s*\*\/\s*$/.test(prev)) {
      // walk up through a multi-line comment
      let cs = prevStart;
      if (!/\/\*/.test(prev)) {
        const open = t.lastIndexOf('/*', prevStart);
        if (open < 0) break;
        cs = lineStart(t, open);
      }
      s = cs;
      continue;
    }
    break;
  }
  return /^[ \t]*$/.test(t.slice(lineStart(t, start), start)) ? Math.min(s, lineStart(t, start)) : start;
}

/**
 * Moves a rule before / after another rule. The rule's lines (and a comment attached above it)
 * are re-indented for their new place (e.g. into or out of an @media block). Two edits.
 */
export function moveRule(model: CssModel, id: number, targetId: number, position: 'before' | 'after'): TextEdit[] {
  const t = model.text;
  const r = model.rules[id];
  const g = model.rules[targetId];
  if (!r || !g || id === targetId) return [];
  const blockStart = startWithComment(t, r.start);
  const own = wholeLines(t, blockStart, r.end);
  // Also drop one blank line after the block so blank lines don't pile up.
  let delEnd = own.end;
  const nextLineEnd = lineEnd(t, delEnd);
  if (own.start !== blockStart || /^[ \t]*$/.test(t.slice(delEnd, nextLineEnd))) {
    if (t[nextLineEnd] === '\n' && /^[ \t]*$/.test(t.slice(delEnd, nextLineEnd)) && delEnd < t.length) delEnd = nextLineEnd + 1;
  }
  if (g.start >= own.start && g.end <= delEnd) return [];

  const ownIndent = indentAt(t, r.start);
  const targetIndent = indentAt(t, g.start);
  const lines = t.slice(blockStart, r.end).split('\n').map((l, i) => {
    if (i === 0) return targetIndent + l.trimStart();
    const rel = l.startsWith(ownIndent) ? l.slice(ownIndent.length) : l.trimStart();
    return rel.trim() ? targetIndent + rel : '';
  });
  const block = lines.join('\n');
  const targetBlockStart = startWithComment(t, g.start);
  // A rule that stood on its own (blank lines around it) keeps a blank line at its new place;
  // one taken from a tight group of one-liners stays tight.
  const blankAbove = own.start === 0 || /\n[ \t]*\n$/.test(t.slice(Math.max(0, own.start - 4), own.start)) || /^[ \t]*\n/.test(t.slice(lineStart(t, own.start - 1), own.start));
  const blankBelow = delEnd > own.end || own.end >= t.length;
  const sep = blankAbove && blankBelow ? '\n' : '';
  let ins: TextEdit;
  if (position === 'before') {
    const at = lineStart(t, targetBlockStart);
    ins = { start: at, end: at, text: block + '\n' + sep };
  } else {
    const at = lineEnd(t, g.end);
    ins = { start: at, end: at, text: '\n' + sep + block };
  }
  return [{ start: own.start, end: delEnd, text: '' }, ins];
}
