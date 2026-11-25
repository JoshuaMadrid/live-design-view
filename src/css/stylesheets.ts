import * as vscode from 'vscode';
import type { HtmlModel, LdNode } from '../htmlModel';
import { isExternalUrl } from '../htmlModel';

/** Linked local stylesheets of a page: <link rel="stylesheet" href="…"> resolved to file URIs. */
export function linkedStylesheets(model: HtmlModel, pageUri: vscode.Uri): { node: LdNode; href: string; uri: vscode.Uri }[] {
  const out: { node: LdNode; href: string; uri: vscode.Uri }[] = [];
  for (const n of model.nodes) {
    if (n.tag !== 'link' || !n.located) continue;
    const rel = n.attrs.find((a) => a.name === 'rel')?.value.toLowerCase().split(/\s+/) ?? [];
    const href = n.attrs.find((a) => a.name === 'href')?.value.trim() ?? '';
    if (!rel.includes('stylesheet') || !href || isExternalUrl(href)) continue;
    const uri = resolveHref(href, pageUri);
    if (uri) out.push({ node: n, href, uri });
  }
  return out;
}

export function resolveHref(href: string, pageUri: vscode.Uri): vscode.Uri | undefined {
  const clean = decodeURI(href.split(/[?#]/)[0]);
  if (!clean) return undefined;
  if (clean.startsWith('/')) {
    const folder = vscode.workspace.getWorkspaceFolder(pageUri);
    return vscode.Uri.joinPath(folder?.uri ?? vscode.Uri.joinPath(pageUri, '..'), clean);
  }
  return vscode.Uri.joinPath(pageUri, '..', clean);
}

/** Per-stylesheet version, bumped on save so the Design view re-fetches instead of using a cached copy. */
const versions = new Map<string, number>();
export function stylesheetVersion(uri: vscode.Uri): number {
  return versions.get(uri.toString()) ?? 0;
}
export function bumpStylesheetVersion(uri: vscode.Uri) {
  versions.set(uri.toString(), stylesheetVersion(uri) + 1);
}

/** The open, unsaved document for a stylesheet, if any. */
export function dirtyStylesheet(uri: vscode.Uri): vscode.TextDocument | undefined {
  return vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString() && d.isDirty);
}

/** Rewrites url(...) and @import "…" in inlined CSS so they resolve relative to the CSS file, not the page. */
export function rebaseCssUrls(css: string, cssDirUrl: string): string {
  const fix = (u: string) => {
    if (isExternalUrl(u) || u.startsWith('/')) return u;
    try {
      return new URL(u, cssDirUrl).toString();
    } catch {
      return u;
    }
  };
  return css
    .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (_m, q: string, u: string) => `url(${q}${fix(u.trim())}${q})`)
    .replace(/@import\s+(['"])([^'"]+)\1/gi, (_m, q: string, u: string) => `@import ${q}${fix(u)}${q}`);
}

/** Class names defined in the page's linked local stylesheets and <style> blocks (for the Class picker). */
export async function classNamesFor(model: HtmlModel, pageUri: vscode.Uri): Promise<string[]> {
  return (await selectorNamesFor(model, pageUri)).classes;
}

/** Class and ID names used in the selectors of the page's stylesheets and <style> blocks. */
export async function selectorNamesFor(model: HtmlModel, pageUri: vscode.Uri): Promise<{ classes: string[]; ids: string[] }> {
  const texts: string[] = [];
  for (const l of linkedStylesheets(model, pageUri)) {
    try {
      texts.push((await vscode.workspace.openTextDocument(l.uri)).getText());
    } catch {
      /* missing file */
    }
  }
  for (const n of model.nodes) if (n.tag === 'style' && n.located && n.etStart !== undefined) texts.push(model.text.slice(n.stEnd, n.etStart));
  const names = new Set<string>();
  const ids = new Set<string>();
  for (const t of texts) {
    const noComments = t.replace(/\/\*[\s\S]*?\*\//g, '');
    // only look at selector text (before "{"), skipping @-rule preludes
    for (const sel of noComments.match(/[^{}]+(?=\{)/g) ?? []) {
      if (/^\s*@/.test(sel)) continue;
      const bare = sel.replace(/\[[^\]]*\]|\([^)]*\)|"[^"]*"|'[^']*'/g, '');
      for (const m of bare.matchAll(/\.(-?[_a-zA-Z][-_a-zA-Z0-9]*)/g)) names.add(m[1]);
      for (const m of bare.matchAll(/#(-?[_a-zA-Z][-_a-zA-Z0-9]*)/g)) ids.add(m[1]);
    }
  }
  const sort = (x: Set<string>) => [...x].sort((a, b) => a.localeCompare(b));
  return { classes: sort(names), ids: sort(ids) };
}
