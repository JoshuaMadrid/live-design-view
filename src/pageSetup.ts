// Page setup / Page properties: the document's title and language, its style sheet, and the
// page-wide look (font, size, colours, margin, padding) written as a `body` rule.
import * as vscode from 'vscode';
import * as path from 'path';
import { addRule, parseCss, setDeclarations } from './css/cssModel';
import type { TextEdit } from './edits';

export type SheetKind = 'file' | 'page' | 'none';

export interface PageSetup {
  title: string;
  lang: string;
  sheet: SheetKind;
  /** style sheet path relative to the page (sheet = 'file') */
  sheetPath: string;
  font: string;
  size: string;
  color: string;
  background: string;
  margin: string;
  padding: string;
}

/** Page-properties field → CSS property on `body`. */
const BODY_PROPS: [keyof PageSetup, string][] = [
  ['font', 'font-family'],
  ['size', 'font-size'],
  ['color', 'color'],
  ['background', 'background-color'],
  ['margin', 'margin'],
  ['padding', 'padding'],
];

const withUnit = (v: string) => v.trim().split(/\s+/).map((p) => (/^-?\d*\.?\d+$/.test(p) && p !== '0' ? p + 'px' : p)).join(' ');

/** The `body` declarations a setup asks for (empty fields are left alone). */
export function bodyProps(p: Partial<PageSetup>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, prop] of BODY_PROPS) {
    const v = String(p[k] ?? '').trim();
    if (!v) continue;
    out[prop] = prop === 'font-size' || prop === 'margin' || prop === 'padding' ? withUnit(v) : v;
  }
  return out;
}

export function applyTextEdits(text: string, edits: TextEdit[]): string {
  return [...edits].sort((a, b) => b.start - a.start).reduce((t, e) => t.slice(0, e.start) + e.text + t.slice(e.end), text);
}

/** Sets declarations on the global `body` rule, adding the rule if the sheet has none. */
export function upsertBodyRule(css: string, props: Record<string, string>): string {
  if (!Object.keys(props).length) return css;
  const find = (m: ReturnType<typeof parseCss>) => m.rules.find((r) => r.selector.trim() === 'body' && r.media === undefined);
  let m = parseCss(css);
  let rule = find(m);
  if (!rule) {
    css = applyTextEdits(css, addRule(m, 'body').edits);
    m = parseCss(css);
    rule = find(m);
    if (!rule) return css;
  }
  return applyTextEdits(css, setDeclarations(m, rule.id, props));
}

/** Current values of the body rule's page properties. */
export function readBodyProps(css: string): Partial<PageSetup> {
  const rule = parseCss(css).rules.find((r) => r.selector.trim() === 'body' && r.media === undefined);
  const out: Partial<PageSetup> = {};
  if (!rule) return out;
  for (const [k, prop] of BODY_PROPS) {
    const d = rule.decls.find((x) => x.prop === prop && !x.disabled);
    if (d) (out as Record<string, string>)[k] = d.value;
  }
  return out;
}

const TITLE_RE = /<title\b[^>]*>([\s\S]*?)<\/title>/i;
const STYLE_RE = /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/i;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

export function pageTitleOf(html: string): string {
  return unesc(TITLE_RE.exec(html)?.[1].trim() ?? '');
}

/** A new page: HTML5 structure with the title, language and style sheet link (or <style>). */
export function newPageHtml(p: PageSetup, unit = '  '): string {
  const props = bodyProps(p);
  const head = [
    `${unit}<meta charset="UTF-8">`,
    `${unit}<meta name="viewport" content="width=device-width, initial-scale=1.0">`,
    `${unit}<title>${esc(p.title.trim() || 'Untitled Document')}</title>`,
  ];
  if (p.sheet === 'file' && p.sheetPath.trim()) head.push(`${unit}<link rel="stylesheet" href="${p.sheetPath.trim()}">`);
  if (p.sheet === 'page') {
    const css = upsertBodyRule('', props).trimEnd();
    head.push(`${unit}<style>`, ...css.split('\n').map((l) => (l ? unit + unit + l : l)), `${unit}</style>`);
  }
  return ['<!DOCTYPE html>', `<html lang="${p.lang.trim() || 'en'}">`, '<head>', ...head, '</head>', '<body>', '</body>', '</html>', ''].join('\n');
}

/** Values for the Page properties form, read from a page and its first linked style sheet. */
export async function readPageSetup(doc: vscode.TextDocument, linked: { href: string; uri: vscode.Uri }[]): Promise<PageSetup> {
  const html = doc.getText();
  const lang = /<html\b[^>]*\blang\s*=\s*["']([^"']*)["']/i.exec(html)?.[1] ?? '';
  const base: PageSetup = { title: pageTitleOf(html), lang, sheet: 'file', sheetPath: 'css/styles.css', font: '', size: '', color: '', background: '', margin: '', padding: '' };
  if (linked.length) {
    let css = '';
    try {
      css = (await vscode.workspace.openTextDocument(linked[0].uri)).getText();
    } catch {
      /* missing file: no values */
    }
    return { ...base, sheetPath: linked[0].href, ...readBodyProps(css) };
  }
  const style = STYLE_RE.exec(html);
  if (style) return { ...base, sheet: 'page', ...readBodyProps(style[2]) };
  return base;
}

async function writeCssFile(uri: vscode.Uri, props: Record<string, string>) {
  let exists = true;
  try {
    await vscode.workspace.fs.stat(uri);
  } catch {
    exists = false;
  }
  if (!exists) await vscode.workspace.fs.writeFile(uri, new Uint8Array());
  if (!Object.keys(props).length) return;
  const doc = await vscode.workspace.openTextDocument(uri);
  const next = upsertBodyRule(doc.getText(), props);
  if (next === doc.getText()) return;
  const we = new vscode.WorkspaceEdit();
  we.replace(uri, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), next);
  await vscode.workspace.applyEdit(we);
  await doc.save();
}

/**
 * Applies a setup to a page: an empty page gets the full HTML5 structure; an existing page gets
 * its title, language, style sheet link and `body` rule updated in place.
 */
export async function applyPageSetup(doc: vscode.TextDocument, p: PageSetup, linked: { href: string; uri: vscode.Uri }[]) {
  const pageDir = vscode.Uri.joinPath(doc.uri, '..');
  const props = bodyProps(p);
  const sheetUri = p.sheet === 'file' && p.sheetPath.trim() ? vscode.Uri.joinPath(pageDir, p.sheetPath.trim()) : undefined;
  const text = doc.getText();
  const whole = new vscode.Range(doc.positionAt(0), doc.positionAt(text.length));

  if (!text.trim()) {
    if (sheetUri) await writeCssFile(sheetUri, props);
    const we = new vscode.WorkspaceEdit();
    we.replace(doc.uri, whole, newPageHtml(p));
    await vscode.workspace.applyEdit(we);
    return;
  }

  // Existing page: small edits, applied to the text in one go.
  let html = text;
  const title = esc(p.title.trim());
  const t = TITLE_RE.exec(html);
  if (t) {
    const start = t.index + t[0].indexOf('>') + 1;
    html = html.slice(0, start) + title + html.slice(start + t[1].length);
  } else if (title) {
    html = html.replace(/<head\b[^>]*>/i, (m) => `${m}\n  <title>${title}</title>`);
  }
  if (p.lang.trim()) {
    html = /<html\b[^>]*\blang\s*=/i.test(html)
      ? html.replace(/(<html\b[^>]*\blang\s*=\s*["'])[^"']*(["'])/i, `$1${p.lang.trim()}$2`)
      : html.replace(/<html\b/i, `<html lang="${p.lang.trim()}"`);
  }
  if (sheetUri && !linked.some((l) => l.uri.toString() === sheetUri.toString())) {
    const rel = path.posix.relative(pageDir.path, sheetUri.path);
    html = html.replace(/<\/head>/i, `  <link rel="stylesheet" href="${rel}">\n</head>`);
  }
  if (p.sheet === 'page' && Object.keys(props).length) {
    const s = STYLE_RE.exec(html);
    if (s) {
      const start = s.index + s[1].length;
      html = html.slice(0, start) + upsertBodyRule(s[2], props) + html.slice(start + s[2].length);
    } else {
      const css = upsertBodyRule('', props).trimEnd().split('\n').map((l) => '    ' + l).join('\n');
      html = html.replace(/<\/head>/i, `  <style>\n${css}\n  </style>\n</head>`);
    }
  }
  if (html !== text) {
    const we = new vscode.WorkspaceEdit();
    we.replace(doc.uri, whole, html);
    await vscode.workspace.applyEdit(we);
  }
  if (sheetUri) await writeCssFile(sheetUri, props);
}
