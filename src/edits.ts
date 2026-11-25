/**
 * Pure edit computations. Every function returns minimal text replacements at
 * source offsets (never a re-serialized DOM) plus where the affected element
 * will start afterwards, so the caller can re-select it after re-parsing.
 */
import {
  type HtmlModel,
  type LdNode,
  NO_CHILDREN,
  NO_SIBLINGS,
  attrInsertOffset,
  escapeAttr,
  escapeText,
} from './htmlModel';
import { type AssetId, HEAD_ASSETS, SNIPPETS } from './snippets';

export interface TextEdit {
  start: number;
  end: number;
  text: string;
}

export type EditResult =
  | { ok: true; edits: TextEdit[]; /** start offset of the affected element in the NEW text */ selectStart?: number }
  | { ok: false; message: string };

export type InsertPosition = 'before' | 'after' | 'inside-first' | 'inside-last';

const fail = (message: string): EditResult => ({ ok: false, message });

// ---------------------------------------------------------------------------
// Indentation helpers
// ---------------------------------------------------------------------------

export function lineStartOf(text: string, offset: number): number {
  const i = text.lastIndexOf('\n', offset - 1);
  return i + 1;
}

export function lineEndOf(text: string, offset: number): number {
  const i = text.indexOf('\n', offset);
  return i === -1 ? text.length : i;
}

/** Whitespace between the start of the line and offset, or undefined if there is other text there. */
export function leadingIndent(text: string, offset: number): string | undefined {
  const ls = lineStartOf(text, offset);
  const before = text.slice(ls, offset);
  return /^[ \t]*$/.test(before) ? before : undefined;
}

function onlyWhitespaceUntilEol(text: string, offset: number): boolean {
  return /^[ \t]*$/.test(text.slice(offset, lineEndOf(text, offset)));
}

/** Indentation string of the line containing offset. */
function indentOfLine(text: string, offset: number): string {
  const ls = lineStartOf(text, offset);
  return /^[ \t]*/.exec(text.slice(ls))![0];
}

/** Detects the document's indent unit (tab, or the most common step of spaces). Defaults to 2 spaces. */
export function detectIndentUnit(text: string): string {
  const lines = text.split('\n');
  let tabs = 0;
  let spaces = 0;
  const deltas = new Map<number, number>();
  let prev = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    const m = /^[ \t]*/.exec(line)![0];
    if (m.startsWith('\t')) tabs++;
    else if (m.length) spaces++;
    const w = m.replace(/\t/g, '    ').length;
    const d = w - prev;
    if (d > 0 && d <= 8) deltas.set(d, (deltas.get(d) ?? 0) + 1);
    prev = w;
  }
  if (tabs > spaces) return '\t';
  let best = 2;
  let bestCount = 0;
  for (const [d, c] of deltas) {
    if (c > bestCount || (c === bestCount && d < best)) {
      best = d;
      bestCount = c;
    }
  }
  return ' '.repeat(best);
}

/** Renders snippet lines at a base indent. First line is NOT prefixed (caller positions it). */
function renderSnippet(lines: string[], baseIndent: string, unit: string): string {
  return lines
    .map((line, i) => {
      const m = /^\t*/.exec(line)![0];
      const body = line.slice(m.length);
      const ind = unit.repeat(m.length);
      return (i === 0 ? '' : baseIndent) + ind + body;
    })
    .join('\n');
}

/** Single-line form for inline insertion (indent markers dropped). */
function renderInline(lines: string[]): string {
  return lines.map((l) => l.replace(/^\t+/, '')).join('');
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function canInsert(node: LdNode, position: InsertPosition): string | undefined {
  // A <body> the parser implied (no tag in the source) can still receive children.
  if (!node.located && node.tag === 'body' && position.startsWith('inside')) return undefined;
  if (!node.located) return `<${node.tag}> isn't written in the source, so nothing can be inserted relative to it.`;
  if (node.foreign) return `Can't insert HTML inside or next to SVG/MathML content.`;
  if (position === 'inside-first' || position === 'inside-last') {
    if (NO_CHILDREN.has(node.tag)) return `<${node.tag}> can't contain other elements.`;
  } else if (NO_SIBLINGS.has(node.tag)) {
    return `Can't insert before or after <${node.tag}>.`;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Insert
// ---------------------------------------------------------------------------

export function insertSnippet(
  model: HtmlModel,
  targetId: number,
  tag: string,
  position: InsertPosition,
  unit = detectIndentUnit(model.text),
): EditResult {
  const snippet = SNIPPETS[tag];
  if (!snippet) return fail(`Unknown tag "${tag}".`);
  return insertLines(model, targetId, { ...snippet, lines: numberLines(snippet.lines, model.text) }, position, unit);
}

/**
 * Replaces "{{n}}" in snippet lines with the first number whose ids aren't on the page yet
 * (widgets are named Accordion1, Accordion2 …).
 */
export function numberLines(lines: string[], pageText: string): string[] {
  const joined = lines.join('\n');
  if (!joined.includes('{{n}}')) return lines;
  const ids = [...joined.matchAll(/id="([^"]*\{\{n\}\}[^"]*)"/g)].map((m) => m[1]);
  let n = 1;
  while (ids.some((id) => pageText.includes(`id="${id.replace(/\{\{n\}\}/g, String(n))}"`))) n++;
  return lines.map((l) => l.replace(/\{\{n\}\}/g, String(n)));
}

/** Inserts lines ("\t" = one indent level) relative to an element. Shared by snippets and moves. */
function insertLines(
  model: HtmlModel,
  targetId: number,
  snippet: { lines: string[]; tag: string },
  position: InsertPosition,
  unit: string,
): EditResult {
  const node = model.nodes[targetId];
  if (!node) return fail('Nothing selected.');
  const bad = canInsert(node, position);
  if (bad) return fail(bad);

  const { text } = model;

  if (!node.located && node.tag === 'body') return insertIntoImpliedBody(model, node, snippet.lines, position, unit);

  if (position === 'before') {
    const indent = leadingIndent(text, node.start);
    if (indent !== undefined) {
      // Own line: put the new element on the line(s) above, at the same indentation.
      const at = lineStartOf(text, node.start);
      const body = indent + renderSnippet(snippet.lines, indent, unit) + '\n';
      return { ok: true, edits: [{ start: at, end: at, text: body }], selectStart: at + indent.length };
    }
    const body = renderInline(snippet.lines);
    return { ok: true, edits: [{ start: node.start, end: node.start, text: body }], selectStart: node.start };
  }

  if (position === 'after') {
    const indent = leadingIndent(text, node.start) ?? indentOfLine(text, node.start);
    if (onlyWhitespaceUntilEol(text, node.end) && leadingIndent(text, node.start) !== undefined) {
      const at = lineEndOf(text, node.end);
      const body = '\n' + indent + renderSnippet(snippet.lines, indent, unit);
      return { ok: true, edits: [{ start: at, end: at, text: body }], selectStart: at + 1 + indent.length };
    }
    const body = renderInline(snippet.lines);
    return { ok: true, edits: [{ start: node.end, end: node.end, text: body }], selectStart: node.end };
  }

  // Inside
  const contentStart = node.stEnd;
  const contentEnd = node.etStart ?? node.end;
  const content = text.slice(contentStart, contentEnd);
  const ownIndent = leadingIndent(text, node.start) ?? indentOfLine(text, node.start);

  // Child indentation: copy an existing child line's indentation when there is one.
  const childIndent = (() => {
    const m = /\n([ \t]*)\S/.exec(content);
    if (m && m[1].length > ownIndent.length) return m[1];
    return ownIndent + unit;
  })();

  if (content.trim() === '') {
    // Empty element: open it up onto its own lines. Only the whitespace inside the element is replaced.
    const blockish = snippet.lines.length > 1 || content.includes('\n') || isBlockTag(node.tag) || isBlockTag(snippet.tag);
    if (!blockish) {
      const body = renderInline(snippet.lines);
      return { ok: true, edits: [{ start: contentStart, end: contentEnd, text: body }], selectStart: contentStart };
    }
    const body = '\n' + childIndent + renderSnippet(snippet.lines, childIndent, unit) + '\n' + ownIndent;
    return {
      ok: true,
      edits: [{ start: contentStart, end: contentEnd, text: body }],
      selectStart: contentStart + 1 + childIndent.length,
    };
  }

  if (position === 'inside-first') {
    if (/^[ \t]*\n/.test(content)) {
      const body = '\n' + childIndent + renderSnippet(snippet.lines, childIndent, unit);
      // Insert right after the start tag, before the existing newline.
      return {
        ok: true,
        edits: [{ start: contentStart, end: contentStart, text: body }],
        selectStart: contentStart + 1 + childIndent.length,
      };
    }
    const body = renderInline(snippet.lines);
    return { ok: true, edits: [{ start: contentStart, end: contentStart, text: body }], selectStart: contentStart };
  }

  // inside-last
  const tail = /\n[ \t]*$/.exec(content);
  if (tail) {
    // The end tag (or end of element) sits on its own line: insert a new line just above it.
    const at = contentEnd - tail[0].length;
    const body = '\n' + childIndent + renderSnippet(snippet.lines, childIndent, unit);
    return { ok: true, edits: [{ start: at, end: at, text: body }], selectStart: at + 1 + childIndent.length };
  }
  const body = renderInline(snippet.lines);
  return { ok: true, edits: [{ start: contentEnd, end: contentEnd, text: body }], selectStart: contentEnd };
}

const BLOCK_TAGS = new Set([
  'div', 'section', 'header', 'nav', 'main', 'article', 'aside', 'footer', 'ul', 'ol', 'form', 'table',
  'thead', 'tbody', 'tfoot', 'tr', 'blockquote', 'body', 'figure', 'fieldset', 'details', 'dl',
]);
function isBlockTag(tag: string): boolean {
  return BLOCK_TAGS.has(tag);
}

// ---------------------------------------------------------------------------
// Delete / move
// ---------------------------------------------------------------------------

/** The element's range, widened to whole lines when it sits alone on its line(s). */
function blockRange(text: string, n: LdNode): { start: number; end: number } {
  const indent = leadingIndent(text, n.start);
  if (indent !== undefined && onlyWhitespaceUntilEol(text, n.end)) {
    const start = lineStartOf(text, n.start);
    let end = lineEndOf(text, n.end);
    if (text[end] === '\n') end += 1;
    else if (start > 0) {
      // Last line of the file: eat the preceding newline instead.
      return { start: start - 1, end };
    }
    return { start, end };
  }
  return { start: n.start, end: n.end };
}

export function deleteElement(model: HtmlModel, id: number): EditResult {
  const n = model.nodes[id];
  if (!n || !n.located) return fail('Nothing to delete.');
  if (n.tag === 'html' || n.tag === 'head' || n.tag === 'body') return fail(`Can't delete <${n.tag}>.`);
  const r = blockRange(model.text, n);
  return { ok: true, edits: [{ start: r.start, end: r.end, text: '' }] };
}

export function moveElement(model: HtmlModel, id: number, dir: 'up' | 'down'): EditResult {
  const n = model.nodes[id];
  if (!n || !n.located || n.parent === undefined) return fail('Nothing to move.');
  const siblings = model.nodes[n.parent].children.map((c) => model.nodes[c]).filter((c) => c.located);
  const idx = siblings.findIndex((s) => s.id === id);
  const other = siblings[dir === 'up' ? idx - 1 : idx + 1];
  if (!other) return fail(dir === 'up' ? 'Already the first element.' : 'Already the last element.');
  if (NO_SIBLINGS.has(n.tag) || NO_SIBLINGS.has(other.tag)) return fail(`Can't move <${n.tag}>.`);

  const [a, b] = dir === 'up' ? [other, n] : [n, other]; // a precedes b
  const { text } = model;
  const aText = text.slice(a.start, a.end);
  const bText = text.slice(b.start, b.end);
  const edits: TextEdit[] = [
    { start: a.start, end: a.end, text: bText },
    { start: b.start, end: b.end, text: aText },
  ];
  // After swapping: b's text now starts at a.start; a's text starts after b's text + the gap.
  const selectStart = dir === 'up' ? a.start : a.start + bText.length + (b.start - a.end);
  return { ok: true, edits, selectStart };
}

// ---------------------------------------------------------------------------
// Attributes
// ---------------------------------------------------------------------------

/** Attributes that stay (as name="") when cleared, because an empty value is meaningful. */
const KEEP_WHEN_EMPTY = new Set(['alt', 'src', 'href', 'action', 'value']);

export function setAttribute(model: HtmlModel, id: number, name: string, value: string): EditResult {
  const n = model.nodes[id];
  if (!n || !n.located) return fail('Nothing selected.');
  name = name.trim().toLowerCase();
  if (!/^[a-z_:][-a-z0-9_:.]*$/.test(name)) return fail(`"${name}" isn't a valid attribute name.`);
  const { text } = model;
  const existing = n.attrs.find((a) => a.name === name);
  const remove = value === '' && !KEEP_WHEN_EMPTY.has(name);

  if (existing && existing.start >= 0) {
    if (existing.value === value) return { ok: true, edits: [], selectStart: n.start };
    if (remove) {
      // Remove the attribute and the whitespace before it.
      let s = existing.start;
      while (s > n.stStart && /\s/.test(text[s - 1])) s--;
      return { ok: true, edits: [{ start: s, end: existing.end, text: '' }], selectStart: n.start };
    }
    return {
      ok: true,
      edits: [{ start: existing.start, end: existing.end, text: `${name}="${escapeAttr(value)}"` }],
      selectStart: n.start,
    };
  }
  if (remove) return { ok: true, edits: [], selectStart: n.start };
  const at = attrInsertOffset(text, n);
  const ins = ` ${name}="${escapeAttr(value)}"`;
  // Keep "<img src="x" />" style: if there was a space before "/>", insert before that space.
  const start = text[at - 1] === ' ' && text[at] === '/' ? at - 1 : at;
  return { ok: true, edits: [{ start, end: start, text: ins }], selectStart: n.start };
}

// ---------------------------------------------------------------------------
// Inline text editing
// ---------------------------------------------------------------------------

/**
 * changes: index into the element's descendant text nodes → new (decoded) value.
 * domTextCount: how many descendant text nodes the webview saw; must match the source.
 */
export function editTexts(
  model: HtmlModel,
  id: number,
  changes: { index: number; value: string }[],
  domTextCount: number,
): EditResult {
  const n = model.nodes[id];
  if (!n || !n.located) return fail('Nothing selected.');
  if (n.texts.length === 0) {
    // Element had no text at all: put the text between the tags.
    const value = changes.map((c) => c.value).join('');
    if (!value) return { ok: true, edits: [], selectStart: n.start };
    const end = n.etStart ?? n.end;
    return { ok: true, edits: [{ start: n.stEnd, end, text: escapeText(value) }], selectStart: n.start };
  }
  if (domTextCount !== n.texts.length) {
    return fail('The rendered text differs from the source (a script may have changed it). Edit this text in Code view.');
  }
  const edits: TextEdit[] = [];
  for (const c of changes) {
    const t = n.texts[c.index];
    if (!t || t.start < 0) return fail('Could not map the edited text back to the source.');
    if (t.value === c.value) continue;
    edits.push({ start: t.start, end: t.end, text: escapeText(c.value) });
  }
  return { ok: true, edits, selectStart: n.start };
}

// ---------------------------------------------------------------------------
// Wrap
// ---------------------------------------------------------------------------

/**
 * Wraps the element in the snippet's outer tag (keeping the snippet's starter attributes,
 * dropping its starter content). Block elements get their own lines and one extra indent level.
 */
export function wrapElement(model: HtmlModel, id: number, key: string, unit = detectIndentUnit(model.text)): EditResult {
  const n = model.nodes[id];
  const snippet = SNIPPETS[key];
  if (!n) return fail('Nothing selected.');
  if (!snippet) return fail(`Unknown tag "${key}".`);
  const bad = canInsert(n, 'before');
  if (bad) return fail(bad);
  if (NO_CHILDREN.has(snippet.tag)) return fail(`<${snippet.tag}> can't wrap other elements.`);
  const open = /^<[a-zA-Z][^>]*>/.exec(snippet.lines[0].replace(/^\t+/, ''))?.[0];
  if (!open) return fail(`Can't wrap with <${snippet.tag}>.`);
  if (snippet.noWrap) return fail(`${snippet.name} has several top-level elements, so it can't wrap.`);
  const close = `</${snippet.tag}>`;
  const { text } = model;

  const indent = leadingIndent(text, n.start);
  if (indent !== undefined && onlyWhitespaceUntilEol(text, n.end)) {
    // Own line(s): re-indent the wrapped element's lines by one unit.
    const body = text.slice(n.start, n.end).replace(/\n(?=[ \t]*\S)/g, '\n' + unit);
    const out = open + '\n' + indent + unit + body + '\n' + indent + close;
    return { ok: true, edits: [{ start: n.start, end: n.end, text: out }], selectStart: n.start };
  }
  return {
    ok: true,
    edits: [
      { start: n.start, end: n.start, text: open },
      { start: n.end, end: n.end, text: close },
    ],
    selectStart: n.start,
  };
}

// ---------------------------------------------------------------------------
// Page assets (<head>)
// ---------------------------------------------------------------------------

/**
 * Edits that add the given assets (e.g. the Tailwind CDN script) as the last children of <head>,
 * skipping any the page already has. Returns [] when nothing is needed or there's no <head>.
 */
export function ensureHeadAssets(model: HtmlModel, ids: AssetId[] = [], unit = detectIndentUnit(model.text)): TextEdit[] {
  const missing = ids.filter((id) => !HEAD_ASSETS[id].detect.test(model.text));
  if (!missing.length) return [];
  const edits: TextEdit[] = [];
  const headLines = missing.filter((id) => id !== 'jqueryui').flatMap((id) => HEAD_ASSETS[id].lines);
  if (missing.includes('jqueryui')) {
    const [jqLine, cssLine, uiLine] = HEAD_ASSETS.jqueryui.lines;
    // The page's own jQuery (anywhere, e.g. js/jquery.min.js at the end of <body>): load jQuery UI right after it.
    const jq = model.nodes.find((n) => {
      const src = n.attrs.find((a) => a.name === 'src')?.value ?? '';
      return n.tag === 'script' && n.located && /jquery(?:[-.][\d.]+)*(?:\.slim)?(?:\.min)?\.js/i.test(src) && !/jquery-ui/i.test(src);
    });
    headLines.push(cssLine);
    if (jq) {
      const indent = leadingIndent(model.text, jq.start) ?? '';
      edits.push({ start: jq.end, end: jq.end, text: '\n' + indent + uiLine });
    } else headLines.push(jqLine, uiLine);
  }
  if (headLines.length) edits.unshift(...appendToHead(model, headLines, unit));
  return edits;
}

/** Edits that add lines (e.g. a <link> or <style>) as the last children of <head>, matching indentation. */
export function appendToHead(model: HtmlModel, lines: string[], unit = detectIndentUnit(model.text)): TextEdit[] {
  const { text } = model;
  const head = model.nodes.find((n) => n.tag === 'head' && n.located && n.etStart !== undefined);
  if (!head) return [];
  const content = text.slice(head.stEnd, head.etStart);
  const ownIndent = leadingIndent(text, head.start) ?? '';
  const childIndent = /\n([ \t]*)\S/.exec(content)?.[1] ?? ownIndent + unit;
  const tail = /\n[ \t]*$/.exec(content);
  const at = tail ? head.etStart! - tail[0].length : head.etStart!;
  const body =
    lines.map((l, i) => '\n' + (i === 0 || !l.startsWith('</') ? childIndent : childIndent) + l).join('') + (tail ? '' : '\n' + ownIndent);
  return [{ start: at, end: at, text: body }];
}

// ---------------------------------------------------------------------------
// Empty pages / implied <body>
// ---------------------------------------------------------------------------

/** Standard HTML5 page . */
export function htmlTemplate(bodyLines: string[] = [], unit = '  '): string {
  const body = bodyLines.map((l) => (l ? unit + l : l)).join('\n');
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    `${unit}<meta charset="UTF-8">`,
    `${unit}<meta name="viewport" content="width=device-width, initial-scale=1.0">`,
    `${unit}<title>Untitled Document</title>`,
    '</head>',
    '<body>',
    ...(body ? [body] : []),
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/** Edit that turns an empty (whitespace-only) document into an HTML5 page. */
export function scaffoldPage(model: HtmlModel): EditResult {
  if (model.text.trim()) return fail('The page already has content.');
  const t = htmlTemplate();
  return { ok: true, edits: [{ start: 0, end: model.text.length, text: t }], selectStart: t.indexOf('<body>') };
}

/**
 * Inserts into a <body> that isn't written in the source. An empty document gets the HTML5
 * page structure with the new element inside <body>; otherwise the element goes before the
 * first / after the last body-level element.
 */
function insertIntoImpliedBody(model: HtmlModel, body: LdNode, lines: string[], position: InsertPosition, unit: string): EditResult {
  const { text } = model;
  if (!text.trim()) {
    const u = '  ';
    const rendered = renderSnippet(lines, u, u).split('\n');
    const t = htmlTemplate(rendered.map((l, i) => (i === 0 ? l : l.slice(u.length))), u);
    const first = rendered[0];
    return { ok: true, edits: [{ start: 0, end: text.length, text: t }], selectStart: t.indexOf(u + first) + u.length };
  }
  const kids = body.children.map((c) => model.nodes[c]).filter((c) => c.located);
  const indent = kids.length ? leadingIndent(text, kids[0].start) ?? '' : '';
  const snippetText = renderSnippet(lines, indent, unit);
  if (position === 'inside-first' && kids.length) {
    const at = kids[0].start;
    return { ok: true, edits: [{ start: at, end: at, text: snippetText + '\n' + indent }], selectStart: at };
  }
  let at: number;
  if (kids.length) at = kids[kids.length - 1].end;
  else {
    const html = model.nodes.find((n) => n.tag === 'html' && n.located);
    const before = model.nodes.filter((n) => n.located && n.parent !== undefined && model.nodes[n.parent].tag === 'head');
    at = html?.etStart ?? (before.length ? Math.max(...before.map((n) => n.end)) : text.replace(/\s+$/, '').length);
  }
  const lead = at > 0 && text[at - 1] !== '\n' ? '\n' : '';
  return { ok: true, edits: [{ start: at, end: at, text: lead + indent + snippetText + (text[at] === '\n' || at >= text.length ? '' : '\n') }], selectStart: at + lead.length + indent.length };
}

/**
 * Inserts text/markup inline at the end of an element's content (characters, date, <br>).
 * Elements that can't contain text get it right after them instead.
 */
export function insertInline(model: HtmlModel, id: number, markup: string): EditResult {
  const n = model.nodes[id];
  if (!n) return fail('Select an element first.');
  const { text } = model;
  if (!n.located) {
    if (n.tag !== 'body') return fail('Select an element first.');
    const kids = n.children.map((c) => model.nodes[c]).filter((c) => c.located);
    const at = kids.length ? kids[kids.length - 1].end : text.replace(/\s+$/, '').length;
    return { ok: true, edits: [{ start: at, end: at, text: markup }], selectStart: undefined };
  }
  if (NO_CHILDREN.has(n.tag) || n.foreign) {
    if (NO_SIBLINGS.has(n.tag)) return fail(`Can't add text to <${n.tag}>.`);
    return { ok: true, edits: [{ start: n.end, end: n.end, text: markup }], selectStart: n.start };
  }
  const contentEnd = n.etStart ?? n.end;
  const content = text.slice(n.stEnd, contentEnd);
  const at = contentEnd - (/\s*$/.exec(content)![0].length);
  return { ok: true, edits: [{ start: at, end: at, text: markup }], selectStart: n.start };
}

// ---------------------------------------------------------------------------
// Move anywhere (Structure panel drag & drop)
// ---------------------------------------------------------------------------

function isInside(model: HtmlModel, id: number, ancestorId: number): boolean {
  for (let n: LdNode | undefined = model.nodes[id]; n; n = n.parent !== undefined ? model.nodes[n.parent] : undefined) {
    if (n.id === ancestorId) return true;
  }
  return false;
}

/**
 * Moves an element (with its own lines) next to / into another element, re-indented to fit
 * its new place. Two edits: remove the old lines, insert at the new spot.
 */
export function moveElementTo(model: HtmlModel, id: number, targetId: number, position: InsertPosition, unit = detectIndentUnit(model.text)): EditResult {
  const n = model.nodes[id];
  const target = model.nodes[targetId];
  if (!n || !n.located || !target) return fail('Nothing to move.');
  if (NO_SIBLINGS.has(n.tag)) return fail(`Can't move <${n.tag}>.`);
  if (isInside(model, targetId, id)) return fail("Can't move an element into itself.");
  const { text } = model;
  const ownIndent = leadingIndent(text, n.start) ?? '';
  // Lines of the element relative to its own indentation; deeper indentation becomes "\t" levels.
  const unitW = unit === '\t' ? 1 : unit.length;
  const lines = text
    .slice(n.start, n.end)
    .split('\n')
    .map((l, i) => {
      if (i === 0) return l;
      const rel = l.startsWith(ownIndent) ? l.slice(ownIndent.length) : l.trimStart();
      const lead = /^[ \t]*/.exec(rel)![0];
      const levels = unit === '\t' ? (lead.match(/\t/g) ?? []).length : Math.floor(lead.replace(/\t/g, unit).length / unitW);
      return '\t'.repeat(levels) + rel.slice(lead.length);
    });
  const ins = insertLines(model, targetId, { lines, tag: n.tag }, position, unit);
  if (!ins.ok) return ins;
  const del = blockRangeOf(text, n);
  const edits = [{ start: del.start, end: del.end, text: '' }, ...ins.edits];
  const removed = del.end - del.start;
  const shift = (o: number) => (o >= del.end ? o - removed : o);
  return { ok: true, edits, selectStart: ins.selectStart !== undefined ? shift(ins.selectStart) : undefined };
}

function blockRangeOf(text: string, n: LdNode): { start: number; end: number } {
  const indent = leadingIndent(text, n.start);
  if (indent !== undefined && /^[ \t]*$/.test(text.slice(n.end, lineEndOf(text, n.end)))) {
    const start = lineStartOf(text, n.start);
    let end = lineEndOf(text, n.end);
    if (text[end] === '\n') end += 1;
    return { start, end };
  }
  return { start: n.start, end: n.end };
}

// ---------------------------------------------------------------------------
// Properties inspector helpers
// ---------------------------------------------------------------------------

/** Renames an element's tag (start + end tag names only), e.g. Format: Paragraph → Heading 2. */
export function renameTag(model: HtmlModel, id: number, newTag: string): EditResult {
  const n = model.nodes[id];
  if (!n || !n.located) return fail('Nothing selected.');
  newTag = newTag.trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]*$/.test(newTag)) return fail(`"${newTag}" isn't a valid tag name.`);
  if (newTag === n.tag) return { ok: true, edits: [], selectStart: n.start };
  if (NO_SIBLINGS.has(n.tag) || VOID_SET.has(n.tag) || VOID_SET.has(newTag)) return fail(`Can't change <${n.tag}> to <${newTag}>.`);
  const { text } = model;
  const nameLen = /^[A-Za-z][\w-]*/.exec(text.slice(n.stStart + 1))![0].length;
  const edits: TextEdit[] = [{ start: n.stStart + 1, end: n.stStart + 1 + nameLen, text: newTag }];
  if (n.etStart !== undefined) {
    const endLen = /^[A-Za-z][\w-]*/.exec(text.slice(n.etStart + 2))?.[0].length ?? 0;
    edits.push({ start: n.etStart + 2, end: n.etStart + 2 + endLen, text: newTag });
  }
  return { ok: true, edits, selectStart: n.start };
}
const VOID_SET = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/** Adds or removes a boolean attribute (required, disabled, checked…) written without a value. */
export function setBooleanAttribute(model: HtmlModel, id: number, name: string, on: boolean): EditResult {
  const n = model.nodes[id];
  if (!n || !n.located) return fail('Nothing selected.');
  const { text } = model;
  const existing = n.attrs.find((a) => a.name === name);
  if (on && existing) return { ok: true, edits: [], selectStart: n.start };
  if (!on && !existing) return { ok: true, edits: [], selectStart: n.start };
  if (on) {
    const at = attrInsertOffset(text, n);
    const start = text[at - 1] === ' ' && text[at] === '/' ? at - 1 : at;
    return { ok: true, edits: [{ start, end: start, text: ' ' + name }], selectStart: n.start };
  }
  let s = existing!.start;
  while (s > n.stStart && /\s/.test(text[s - 1])) s--;
  return { ok: true, edits: [{ start: s, end: existing!.end, text: '' }], selectStart: n.start };
}

/** Wraps an element in an explicit open tag, e.g. <a href="page.html"> around an image. */
export function wrapWith(model: HtmlModel, id: number, open: string, tag: string): EditResult {
  const n = model.nodes[id];
  if (!n || !n.located) return fail('Nothing selected.');
  return {
    ok: true,
    edits: [
      { start: n.start, end: n.start, text: open },
      { start: n.end, end: n.end, text: `</${tag}>` },
    ],
    selectStart: n.start + open.length,
  };
}

/** Replaces an element's whole content (e.g. a <select>'s option list), indented as children. */
export function replaceContent(model: HtmlModel, id: number, lines: string[], unit = detectIndentUnit(model.text)): EditResult {
  const n = model.nodes[id];
  if (!n || !n.located || n.etStart === undefined) return fail('Nothing selected.');
  const { text } = model;
  const own = leadingIndent(text, n.start) ?? '';
  const child = own + unit;
  const body = lines.length ? lines.map((l) => '\n' + child + l).join('') + '\n' + own : '';
  return { ok: true, edits: [{ start: n.stEnd, end: n.etStart, text: body }], selectStart: n.start };
}

/**
 * Inserts arbitrary markup (pasted HTML, a duplicated element) relative to an element. The markup's
 * own indentation is kept relative to its first line and re-based on the insertion point.
 */
export function insertMarkup(model: HtmlModel, targetId: number, markup: string, position: InsertPosition, unit = detectIndentUnit(model.text)): EditResult {
  const raw = markup.replace(/\r\n/g, '\n').replace(/^\s*\n/, '').replace(/\s+$/, '');
  if (!raw.trim()) return fail('Nothing to paste.');
  const lines = raw.split('\n');
  const rest = lines.slice(1).filter((l) => l.trim());
  const widthOf = (l: string) => /^[ \t]*/.exec(l)![0].replace(/\t/g, unit === '\t' ? '\t' : ' '.repeat(Math.max(unit.length, 1))).length;
  const common = rest.length ? Math.min(...rest.map(widthOf)) : 0;
  const unitW = unit === '\t' ? 1 : unit.length;
  const rel = lines.map((l, i) => {
    if (i === 0) return l.trimStart();
    if (!l.trim()) return '';
    const w = widthOf(l) - common;
    return '\t'.repeat(Math.max(0, Math.round(w / unitW))) + l.trimStart();
  });
  const tag = /^<([a-zA-Z][\w-]*)/.exec(rel[0])?.[1]?.toLowerCase() ?? 'div';
  return insertLines(model, targetId, { lines: rel, tag }, position, unit);
}
