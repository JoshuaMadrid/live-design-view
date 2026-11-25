// Links between pages: following them from the Design view ("follow link") and
// checking them (link checker → VS Code Problems panel).
import * as vscode from 'vscode';
import { parseHtml, type HtmlModel } from './htmlModel';
import { resolveHref } from './css/stylesheets';

/** Attributes that point at another file. */
const LINK_ATTRS: Record<string, string[]> = {
  a: ['href'],
  area: ['href'],
  link: ['href'],
  img: ['src'],
  script: ['src'],
  source: ['src'],
  iframe: ['src'],
  video: ['src', 'poster'],
  audio: ['src'],
  embed: ['src'],
  track: ['src'],
};

export interface PageLink {
  tag: string;
  attr: string;
  value: string;
  /** source range of the attribute (name="value") */
  start: number;
  end: number;
}

/** "kind" of a URL: links we don't check (external, mail, script…) vs local files / same-page anchors. */
export function linkKind(href: string): 'external' | 'skip' | 'anchor' | 'local' {
  const v = href.trim();
  if (!v || v === '#') return 'skip';
  if (v.startsWith('#')) return 'anchor';
  if (v.startsWith('//') || /^https?:/i.test(v)) return 'external';
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return 'skip'; // mailto:, tel:, javascript:, data:, …
  if (/[{}]|\$\{|<%|\{\{/.test(v)) return 'skip'; // template placeholders
  return 'local';
}

export function pageLinks(model: HtmlModel): PageLink[] {
  const out: PageLink[] = [];
  for (const n of model.nodes) {
    const attrs = LINK_ATTRS[n.tag];
    if (!attrs || !n.located) continue;
    for (const a of n.attrs) if (attrs.includes(a.name) && a.start >= 0) out.push({ tag: n.tag, attr: a.name, value: a.value, start: a.start, end: a.end });
  }
  return out;
}

/** Ids and named anchors defined in a page. */
export function anchorsIn(model: HtmlModel): Set<string> {
  const s = new Set<string>();
  for (const n of model.nodes) for (const a of n.attrs) if (a.name === 'id' || (a.name === 'name' && n.tag === 'a')) s.add(a.value);
  return s;
}

async function exists(uri: vscode.Uri): Promise<vscode.FileType | undefined> {
  try {
    return (await vscode.workspace.fs.stat(uri)).type;
  } catch {
    return undefined;
  }
}

/** The file a local link points at (folders → their index.html). */
export async function resolveLocal(href: string, pageUri: vscode.Uri): Promise<{ uri: vscode.Uri | undefined; hash: string; found: boolean }> {
  const hash = href.includes('#') ? href.slice(href.indexOf('#') + 1) : '';
  const pathPart = href.split(/[?#]/)[0];
  let uri: vscode.Uri | undefined;
  try {
    uri = pathPart ? resolveHref(pathPart, pageUri) : pageUri;
  } catch {
    return { uri: undefined, hash, found: false };
  }
  if (!uri) return { uri: undefined, hash, found: false };
  let t = await exists(uri);
  if (t === vscode.FileType.Directory || pathPart.endsWith('/')) {
    uri = vscode.Uri.joinPath(uri, 'index.html');
    t = await exists(uri);
  }
  return { uri, hash, found: t !== undefined };
}

/** Link checker for one page: broken local links and missing #anchors. */
export async function checkPageLinks(model: HtmlModel, pageUri: vscode.Uri, readPage: (uri: vscode.Uri) => Promise<string | undefined>): Promise<vscode.Diagnostic[]> {
  const doc = model.text;
  const pos = (o: number) => {
    const before = doc.slice(0, o);
    const line = (before.match(/\n/g) || []).length;
    return new vscode.Position(line, o - before.lastIndexOf('\n') - 1);
  };
  const own = anchorsIn(model);
  const otherAnchors = new Map<string, Set<string> | undefined>();
  const out: vscode.Diagnostic[] = [];
  const add = (l: PageLink, msg: string, sev = vscode.DiagnosticSeverity.Warning) => {
    const d = new vscode.Diagnostic(new vscode.Range(pos(l.start), pos(l.end)), msg, sev);
    d.source = 'Live Design links';
    d.code = 'broken-link';
    out.push(d);
  };
  for (const l of pageLinks(model)) {
    const kind = linkKind(l.value);
    if (kind === 'anchor') {
      const id = safeDecode(l.value.slice(1));
      if (!own.has(id)) add(l, `Missing anchor: no element with id="${id}" on this page.`);
      continue;
    }
    if (kind !== 'local') continue;
    const r = await resolveLocal(l.value, pageUri);
    if (!r.uri || !r.found) {
      add(l, `Broken link: ${l.value.split(/[?#]/)[0] || l.value} (file not found).`, vscode.DiagnosticSeverity.Error);
      continue;
    }
    if (r.hash && /\.html?$/i.test(r.uri.path) && l.tag === 'a') {
      const key = r.uri.toString();
      if (!otherAnchors.has(key)) {
        const text = await readPage(r.uri);
        otherAnchors.set(key, text === undefined ? undefined : anchorsIn(parseHtml(text)));
      }
      const set = otherAnchors.get(key);
      const id = safeDecode(r.hash);
      if (set && !set.has(id)) add(l, `Missing anchor: ${l.value.split('#')[0]} has no element with id="${id}".`);
    }
  }
  return out;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Reads a page from an open editor (unsaved text) or from disk. */
export async function readPageText(uri: vscode.Uri): Promise<string | undefined> {
  const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
  if (open) return open.getText();
  try {
    return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
  } catch {
    return undefined;
  }
}

/** Problems-panel link checking for HTML documents (on open / edit / save, plus a site-wide command). */
export function registerLinkChecker(context: vscode.ExtensionContext): { checkSite: () => Promise<number>; checkDocument: (doc: vscode.TextDocument) => Promise<void>; collection: vscode.DiagnosticCollection } {
  const collection = vscode.languages.createDiagnosticCollection('liveDesign.links');
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const isHtml = (d: vscode.TextDocument) => /\.html?$/i.test(d.uri.path) && d.uri.scheme === 'file';
  const checkDocument = async (doc: vscode.TextDocument) => {
    if (!isHtml(doc)) return;
    collection.set(doc.uri, await checkPageLinks(parseHtml(doc.getText()), doc.uri, readPageText));
  };
  const soon = (doc: vscode.TextDocument) => {
    if (!isHtml(doc) || !vscode.workspace.getConfiguration('liveDesign').get<boolean>('checkLinks', true)) return;
    const k = doc.uri.toString();
    clearTimeout(timers.get(k));
    timers.set(k, setTimeout(() => void checkDocument(doc), 600));
  };
  const checkSite = async () => {
    const files = await vscode.workspace.findFiles('**/*.{html,htm}', '**/{node_modules,.git,.vscode-test,out,dist}/**', 2000);
    let broken = 0;
    for (const uri of files) {
      const text = await readPageText(uri);
      if (text === undefined) continue;
      const diags = await checkPageLinks(parseHtml(text), uri, readPageText);
      collection.set(uri, diags);
      broken += diags.length;
    }
    return broken;
  };
  context.subscriptions.push(
    collection,
    vscode.workspace.onDidOpenTextDocument(soon),
    vscode.workspace.onDidChangeTextDocument((e) => soon(e.document)),
    vscode.workspace.onDidSaveTextDocument(soon),
    vscode.workspace.onDidCloseTextDocument((d) => collection.delete(d.uri)),
    vscode.commands.registerCommand('liveDesign.checkLinks', async () => {
      const n = await checkSite();
      void vscode.commands.executeCommand('workbench.actions.view.problems');
      void vscode.window.showInformationMessage(n ? `Check Links: ${n} problem${n > 1 ? 's' : ''} found — see the Problems panel.` : 'Check Links: no broken links found.');
      return n;
    }),
  );
  for (const d of vscode.workspace.textDocuments) soon(d);
  return { checkSite, checkDocument, collection };
}
