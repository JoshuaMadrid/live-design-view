/**
 * Pure (vscode-free) HTML model built on parse5 source locations.
 *
 * Every element gets a numeric id in document order. The id is only ever
 * injected into the *served* copy of the page (as data-ld-id) — never into the
 * user's file.
 */
import { parse, type DefaultTreeAdapterMap } from 'parse5';

type P5Node = DefaultTreeAdapterMap['node'];
type P5Element = DefaultTreeAdapterMap['element'];
type P5Text = DefaultTreeAdapterMap['textNode'];

export interface AttrInfo {
  name: string;
  value: string;
  start: number;
  end: number;
}

export interface LdNode {
  id: number;
  tag: string;
  /** false when the parser created the element without any source text (implied <html>, <tbody>, …). */
  located: boolean;
  start: number;
  end: number;
  /** start tag range */
  stStart: number;
  stEnd: number;
  /** end tag range, when the source has an explicit end tag */
  etStart?: number;
  etEnd?: number;
  attrs: AttrInfo[];
  parent?: number;
  children: number[];
  /** index among element siblings (used to restore selection across re-parses) */
  path: number[];
  /** descendant text nodes in document order (source ranges + decoded value) */
  texts: { start: number; end: number; value: string }[];
  /** true if element (or an ancestor) is inside <svg>/<math>/<template> */
  foreign: boolean;
}

export interface ParseIssue {
  code: string;
  line: number;
  col: number;
  offset: number;
}

export interface HtmlModel {
  text: string;
  nodes: LdNode[];
  issues: ParseIssue[];
}

export const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr',
]);

/** Elements whose content model makes "insert inside" meaningless or harmful. */
export const NO_CHILDREN = new Set([
  ...VOID_ELEMENTS,
  'textarea', 'script', 'style', 'title', 'iframe', 'select', 'option', 'noscript', 'template', 'svg', 'math', 'head', 'html',
]);

/** Elements that can't have new siblings inserted next to them from the palette. */
export const NO_SIBLINGS = new Set(['html', 'head', 'body']);

/**
 * parse5 reports a lot of pedantic issues; we only surface ones that mean the
 * DOM likely differs from what the author wrote.
 */
const IGNORED_ISSUES = new Set([
  'missing-doctype',
  'non-void-html-element-start-tag-with-trailing-solidus',
  'end-tag-with-trailing-solidus',
]);

export function parseHtml(text: string): HtmlModel {
  const issues: ParseIssue[] = [];
  const doc = parse(text, {
    sourceCodeLocationInfo: true,
    onParseError: (e) => {
      if (!IGNORED_ISSUES.has(e.code)) {
        issues.push({ code: e.code, line: e.startLine, col: e.startCol, offset: e.startOffset });
      }
    },
  });

  const nodes: LdNode[] = [];

  const visit = (n: P5Node, parentId: number | undefined, path: number[], foreign: boolean) => {
    let elementIndex = 0;
    const kids = 'childNodes' in n ? (n.childNodes as P5Node[]) : [];
    for (const child of kids) {
      if (!isElement(child)) continue;
      const loc = child.sourceCodeLocation;
      const id = nodes.length;
      const isForeign = foreign || child.tagName === 'svg' || child.tagName === 'math';
      const node: LdNode = {
        id,
        tag: child.tagName,
        located: !!(loc && loc.startTag),
        start: loc?.startOffset ?? -1,
        end: loc?.endOffset ?? -1,
        stStart: loc?.startTag?.startOffset ?? -1,
        stEnd: loc?.startTag?.endOffset ?? -1,
        etStart: loc?.endTag?.startOffset,
        etEnd: loc?.endTag?.endOffset,
        attrs: child.attrs.map((a) => {
          const al = loc?.attrs?.[a.name] ?? (loc?.startTag as { attrs?: Record<string, { startOffset: number; endOffset: number }> } | undefined)?.attrs?.[a.name];
          return { name: a.name, value: a.value, start: al?.startOffset ?? -1, end: al?.endOffset ?? -1 };
        }),
        parent: parentId,
        children: [],
        path: [...path, elementIndex],
        texts: [],
        foreign: isForeign,
      };
      // Implicitly closed elements (<li>, <p> without an end tag) end where the next tag starts,
      // which swallows trailing whitespace; treat the element as ending at its last non-space char.
      if (node.located && node.etStart === undefined && !VOID_ELEMENTS.has(node.tag)) {
        let e = node.end;
        while (e > node.stEnd && /\s/.test(text[e - 1])) e--;
        node.end = e;
      }
      nodes.push(node);
      if (parentId !== undefined) nodes[parentId].children.push(id);
      elementIndex++;
      // <template> content lives in a separate fragment; the browser never renders it.
      if (child.tagName !== 'template') {
        visit(child, id, node.path, isForeign);
      }
    }
  };
  visit(doc, undefined, [], false);

  // Fill descendant text nodes (document order) for every element.
  const collectTexts = (el: P5Element, out: LdNode['texts']) => {
    for (const c of el.childNodes as P5Node[]) {
      if (c.nodeName === '#text') {
        const t = c as P5Text;
        const l = t.sourceCodeLocation;
        out.push({ start: l?.startOffset ?? -1, end: l?.endOffset ?? -1, value: t.value });
      } else if (isElement(c) && c.tagName !== 'template') {
        collectTexts(c, out);
      }
    }
  };
  let i = 0;
  const fill = (n: P5Node) => {
    const kids = 'childNodes' in n ? (n.childNodes as P5Node[]) : [];
    for (const child of kids) {
      if (!isElement(child)) continue;
      const node = nodes[i++];
      collectTexts(child, node.texts);
      if (child.tagName !== 'template') fill(child);
    }
  };
  fill(doc);

  issues.push(...structuralIssues(text, nodes));
  issues.sort((a, b) => a.offset - b.offset);
  return { text, nodes, issues };
}

/** End tags that are optional per the HTML spec, so a missing one is not an author error. */
const OPTIONAL_END = new Set([
  'html', 'head', 'body', 'li', 'p', 'dt', 'dd', 'option', 'optgroup', 'tr', 'td', 'th', 'thead', 'tbody',
  'tfoot', 'colgroup', 'caption', 'rb', 'rt', 'rtc', 'rp',
]);

/**
 * parse5 only reports tokenizer errors, so detect the tree-construction problems that
 * matter for a design view ourselves: unclosed elements and stray end tags.
 */
function structuralIssues(text: string, nodes: LdNode[]): ParseIssue[] {
  const out: ParseIssue[] = [];
  const at = (offset: number, code: string) => {
    const before = text.slice(0, offset);
    const line = (before.match(/\n/g)?.length ?? 0) + 1;
    out.push({ code, line, col: offset - before.lastIndexOf('\n'), offset });
  };
  for (const n of nodes) {
    if (n.located && n.etStart === undefined && !VOID_ELEMENTS.has(n.tag) && !OPTIONAL_END.has(n.tag) && !n.foreign) {
      at(n.stStart, `unclosed-${n.tag}-element`);
    }
  }
  // Ranges where "</x" isn't markup: comments and raw-text element bodies.
  const skip: [number, number][] = [];
  for (const m of text.matchAll(/<!--[\s\S]*?(?:-->|$)/g)) skip.push([m.index!, m.index! + m[0].length]);
  for (const n of nodes) {
    if (['script', 'style', 'textarea', 'title'].includes(n.tag) && n.located) skip.push([n.stEnd, n.etStart ?? n.end]);
  }
  const used = new Set(nodes.filter((n) => n.etStart !== undefined).map((n) => n.etStart));
  for (const m of text.matchAll(/<\/([a-zA-Z][^\s/>]*)/g)) {
    const i = m.index!;
    if (used.has(i) || skip.some(([a, b]) => i >= a && i < b)) continue;
    if (/^(br|p)$/i.test(m[1])) continue; // </br> and </p> create elements; harmless
    at(i, `stray-end-tag-${m[1].toLowerCase()}`);
  }
  return out;
}

function isElement(n: P5Node): n is P5Element {
  return 'tagName' in n;
}

/** Innermost located element whose [start, end) range contains offset. */
export function nodeAtOffset(model: HtmlModel, offset: number): LdNode | undefined {
  let best: LdNode | undefined;
  for (const n of model.nodes) {
    if (!n.located) continue;
    if (offset >= n.start && offset < Math.max(n.end, n.start + 1)) {
      if (!best || n.start >= best.start) best = n;
    }
  }
  return best;
}

export function nodeByStart(model: HtmlModel, start: number): LdNode | undefined {
  // When several elements start at the same offset (impossible for located elements) take the outermost.
  return model.nodes.find((n) => n.located && n.start === start);
}

export function nodeByPath(model: HtmlModel, path: number[]): LdNode | undefined {
  return model.nodes.find((n) => n.path.length === path.length && n.path.every((v, i) => v === path[i]));
}

export function ancestry(model: HtmlModel, id: number): LdNode[] {
  const out: LdNode[] = [];
  let cur: LdNode | undefined = model.nodes[id];
  while (cur) {
    out.unshift(cur);
    cur = cur.parent !== undefined ? model.nodes[cur.parent] : undefined;
  }
  return out;
}

export function label(n: LdNode): string {
  const id = n.attrs.find((a) => a.name === 'id')?.value;
  const cls = n.attrs.find((a) => a.name === 'class')?.value.trim().split(/\s+/).filter(Boolean) ?? [];
  return n.tag + (id ? `#${id}` : '') + cls.map((c) => `.${c}`).join('');
}

/**
 * Offset at which a new attribute can be inserted into a start tag:
 * just before ">" or "/>".
 */
export function attrInsertOffset(text: string, n: LdNode): number {
  const end = n.stEnd; // exclusive; text[end-1] === '>'
  const lastAttrEnd = n.attrs.reduce((m, a) => Math.max(m, a.end), -1);
  if (text[end - 2] === '/' && lastAttrEnd <= end - 2) return end - 2;
  return end - 1;
}

// ---------------------------------------------------------------------------
// Serving: build the copy of the page rendered in the webview.
// ---------------------------------------------------------------------------

export interface ServeOptions {
  /** Called with a raw src/href value; return the rewritten URL or undefined to keep it. */
  rewriteUrl: (url: string) => string | undefined;
  /** <base href> for anything we don't rewrite (inline style url(), script-created URLs). */
  baseHref: string;
  /** CSP nonce stamped onto every <script> so the page's own scripts are allowed to run. */
  nonce: string;
  /**
   * For a <link rel=stylesheet>: return CSS text to render inline instead (used for
   * stylesheets with unsaved edits), or undefined to keep the link.
   */
  inlineStylesheet?: (node: LdNode) => string | undefined;
  /** Design-time CSS added to the rendered copy only (outlines). */
  designCss?: string;
}

interface Patch {
  at: number;
  del: number;
  ins: string;
}

const URL_ATTRS: Record<string, string[]> = {
  link: ['href'],
  script: ['src'],
  img: ['src', 'srcset'],
  source: ['src', 'srcset'],
  video: ['src', 'poster'],
  audio: ['src'],
  track: ['src'],
  embed: ['src'],
  object: ['data'],
  input: ['src'],
};

export function buildServedHtml(model: HtmlModel, opts: ServeOptions): string {
  const { text } = model;
  const patches: Patch[] = [];

  for (const n of model.nodes) {
    if (!n.located) continue;
    if (n.tag === 'link' && opts.inlineStylesheet) {
      const css = opts.inlineStylesheet(n);
      if (css !== undefined) {
        const href = n.attrs.find((a) => a.name === 'href')?.value ?? '';
        patches.push({
          at: n.start,
          del: n.end - n.start,
          ins: `<style data-ld-id="${n.id}" data-ld-href="${escapeAttr(href)}">${css.replace(/<\/(style)/gi, '<\\/$1')}</style>`,
        });
        continue;
      }
    }
    const extra: string[] = [` data-ld-id="${n.id}"`];
    if (n.tag === 'script' && !n.attrs.some((a) => a.name === 'nonce')) extra.push(` nonce="${opts.nonce}"`);
    if (n.tag === 'link' && !n.attrs.some((a) => a.name === 'nonce')) extra.push(` nonce="${opts.nonce}"`);
    patches.push({ at: attrInsertOffset(text, n), del: 0, ins: extra.join('') });

    const urlAttrs = URL_ATTRS[n.tag];
    if (urlAttrs) {
      for (const a of n.attrs) {
        if (!urlAttrs.includes(a.name) || a.start < 0) continue;
        const rewritten =
          a.name === 'srcset' ? rewriteSrcset(a.value, opts.rewriteUrl) : opts.rewriteUrl(a.value.trim());
        if (rewritten !== undefined && rewritten !== a.value) {
          patches.push({ at: a.start, del: a.end - a.start, ins: `${a.name}="${escapeAttr(rewritten)}"` });
        }
      }
    }
  }

  // <base> must live in <head>. Prefer right after an explicit <head>, else after <html>, else after the doctype.
  const base = `<base href="${escapeAttr(opts.baseHref)}">` + (opts.designCss ? `<style data-ld-design>${opts.designCss}</style>` : '');
  const head = model.nodes.find((n) => n.tag === 'head' && n.located);
  const html = model.nodes.find((n) => n.tag === 'html' && n.located);
  let baseAt: number;
  if (head) baseAt = head.stEnd;
  else if (html) baseAt = html.stEnd;
  else {
    const m = /^\s*<!doctype[^>]*>/i.exec(text);
    baseAt = m ? m[0].length : 0;
  }
  patches.push({ at: baseAt, del: 0, ins: base });

  return applyPatches(text, patches);
}

function rewriteSrcset(value: string, rw: (u: string) => string | undefined): string {
  return value
    .split(',')
    .map((part) => {
      const m = /^(\s*)(\S+)(.*)$/.exec(part);
      if (!m) return part;
      return m[1] + (rw(m[2]) ?? m[2]) + m[3];
    })
    .join(',');
}

function applyPatches(text: string, patches: Patch[]): string {
  // Stable sort: by offset, inserts (del=0) before replacements at the same offset.
  const sorted = patches
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p.at - b.p.at || a.p.del - b.p.del || a.i - b.i)
    .map((x) => x.p);
  let out = '';
  let pos = 0;
  for (const p of sorted) {
    if (p.at < pos) continue; // overlapping patch — skip defensively
    out += text.slice(pos, p.at) + p.ins;
    pos = p.at + p.del;
  }
  return out + text.slice(pos);
}

export function escapeAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

export function escapeText(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/ /g, '&nbsp;');
}

/** True for URLs we must not touch (absolute, protocol-relative, data:, fragments, templating). */
export function isExternalUrl(u: string): boolean {
  return u === '' || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\{\{|<%|\$\{)/i.test(u);
}
