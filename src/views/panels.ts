import * as vscode from 'vscode';
import type { Hub } from '../hub';
import { INSERT_CATEGORIES, SNIPPETS } from '../snippets';
import { makeNonce } from '../liveEditorProvider';
import { trackThemedWebview, uiTheme } from '../theme';
import * as path from 'path';
import { classNamesFor } from '../css/stylesheets';


/** Shared HTML scaffolding for the side-panel webviews (Insert, Properties). */
function panelHtml(webview: vscode.Webview, extensionUri: vscode.Uri, script: string, body: string, extraScripts: string[] = []): string {
  const media = (f: string) => webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', f));
  const nonce = makeNonce();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${media('codicons/codicon.css')}">
<link rel="stylesheet" href="${media('panels.css')}">
<link rel="stylesheet" href="${media('themes.css')}">
</head>
<body data-ld-theme="${uiTheme()}">
<script nonce="${nonce}" src="${media('theme.js')}"></script>
<script nonce="${nonce}" src="${media('tooltip.js')}"></script>
${body}
${extraScripts.map((f) => `<script nonce="${nonce}" src="${media(f)}"></script>`).join('\n')}
<script nonce="${nonce}" src="${media(script)}"></script>
</body>
</html>`;
}

/** Elements panel: list of elements with a category dropdown. */
export class InsertViewProvider implements vscode.WebviewViewProvider {
  static readonly id = 'liveDesign.insert';
  view: vscode.WebviewView | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly hub: Hub,
    private readonly state: vscode.Memento,
  ) {}

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
    };
    trackThemedWebview(view.webview);
    view.webview.html = panelHtml(
      view.webview,
      this.extensionUri,
      'insert.js',
      `<div class="toolbar"><select id="category" aria-label="Insert category"></select></div>
<div id="tabs" role="tablist" aria-label="Insert categories"></div>
<ul id="list" role="list"></ul>
<p class="foot" id="foot"></p>`,
    );
    view.webview.onDidReceiveMessage((m) => {
      if (m.type === 'ready') {
        view.webview.postMessage({
          type: 'init',
          categories: INSERT_CATEGORIES,
          snippets: SNIPPETS,
          category: this.state.get('liveDesign.insertCategory', 'HTML'),
          headingLevel: this.state.get('liveDesign.headingLevel', 'h2'),
          hasSession: !!this.hub.active,
        });
      } else if (m.type === 'insert') {
        const s = this.hub.active;
        if (!s) {
          void vscode.window.showInformationMessage('Open an HTML file in Design or Split view to insert elements.');
          return;
        }
        s.placeInsert(m.key);
      } else if (m.type === 'pref') {
        void this.state.update(`liveDesign.${m.name}`, m.value);
      }
    });
    this.hub.onDidChangeActive((s) => view.webview.postMessage({ type: 'session', hasSession: !!s }));
  }
}

/**
 * Properties inspector (attributes panel), docked in the bottom panel by default.
 * Shows fields for the selected element's type: Div, text (Format), Link, Image, Form controls,
 * Select (List Values), Table, media, head elements.
 */
export class PropertiesViewProvider implements vscode.WebviewViewProvider {
  static readonly id = 'liveDesign.properties';
  view: vscode.WebviewView | undefined;
  private classes: string[] = [];
  private classesFor: string | undefined;
  private updateSeq = 0;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly hub: Hub,
  ) {
    hub.onDidChangeSelection(() => void this.update());
    hub.onDidChangeActive(() => void this.update(true));
    vscode.workspace.onDidSaveTextDocument((d) => {
      if (/\.css$/i.test(d.uri.path)) void this.update(true);
    });
  }

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
    };
    trackThemedWebview(view.webview);
    view.webview.html = panelHtml(view.webview, this.extensionUri, 'properties.js', `<div id="props"></div>`, ['puppet.js']);
    view.webview.onDidReceiveMessage((m) => void this.onMessage(m));
    view.onDidChangeVisibility(() => view.visible && void this.update(true));
  }

  async onMessage(m: any) {
    const s = this.hub.active;
    if (m.type === 'ready') return this.update(true);
    if (m.type === 'puppetDone') {
      this.puppetWaiters.get(m.id)?.();
      this.puppetWaiters.delete(m.id);
      return;
    }
    if (!s) return;
    switch (m.type) {
      case 'setAttr':
        return s.setAttr(m.id, m.name, m.value);
      case 'setTitle':
        return setPageTitle(s.document, String(m.value ?? ''));
      case 'setBool':
        return s.setBool(m.id, m.name, !!m.on);
      case 'setClasses':
        return s.setAttr(m.id, 'class', String(m.value).split(/[\s.]+/).filter(Boolean).join(' '));
      case 'renameTag':
        return s.renameTag(m.id, m.tag);
      case 'setLink':
        return s.setLink(m.id, m.attr, m.value);
      case 'setOptions':
        return s.setOptions(m.id, m.options);
      case 'select':
        return s.select(m.id, { scrollCanvas: true });
      case 'delete':
        return s.deleteElement(m.id);
      case 'move':
        return s.move(m.id, m.dir);
      case 'editText':
        return s.startTextEdit(m.id);
      case 'openCss':
        return vscode.commands.executeCommand('liveDesign.css.focus');
      case 'gotoCode':
        await vscode.commands.executeCommand('liveDesign.splitView', s.document.uri);
        return s.select(m.id);
      case 'browse': {
        const pageDir = vscode.Uri.joinPath(s.document.uri, '..');
        const picked = await vscode.window.showOpenDialog({
          title: `Choose file for ${m.name}`,
          defaultUri: pageDir,
          canSelectMany: false,
          filters: m.kind === 'image' ? { Images: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif'] } : undefined,
        });
        if (!picked?.[0]) return;
        const rel = path.posix.relative(pageDir.path, picked[0].path) || path.posix.basename(picked[0].path);
        if (m.link) return s.setLink(m.id, 'href', rel);
        return s.setAttr(m.id, m.name, rel);
      }
    }
  }

  async update(reloadClasses = false) {
    const s = this.hub.active;
    const seq = ++this.updateSeq;
    if (s && (reloadClasses || this.classesFor !== s.document.uri.toString())) {
      this.classes = await classNamesFor(s.model, s.document.uri);
      this.classesFor = s.document.uri.toString();
    }
    let info: any = s?.selectionInfo() ?? null;
    if (info && info.tag === 'body') info = { ...info, pageTitle: pageTitleOf(s!.document.getText()) };
    if (seq !== this.updateSeq) return; // a newer update is on its way
    this.lastPayload = { info };
    // HTML attributes only — styling lives in the Styles panel.
    void this.view?.webview.postMessage({ type: 'selection', info, hasSession: !!s, classes: this.classes });
  }

  private puppetWaiters = new Map<number, () => void>();
  private puppetSeq = 0;
  /** Demo hook: drive the panel with the drawn pointer (see media/puppet.js); resolves when the step finishes. */
  puppet(action: Record<string, unknown>, timeoutMs = 15000): Promise<void> {
    const id = ++this.puppetSeq;
    return new Promise((resolve) => {
      const t = setTimeout(() => { this.puppetWaiters.delete(id); resolve(); }, timeoutMs);
      this.puppetWaiters.set(id, () => { clearTimeout(t); resolve(); });
      void this.view?.webview.postMessage({ type: 'puppet', id, ...action });
    });
  }

  /** Last state sent to the panel (tests). */
  lastPayload: { info: unknown } | undefined;
}

const TITLE_RE = /<title\b[^>]*>([\s\S]*?)<\/title>/i;

/** Text of the page's <title>, or '' if there is none. */
export function pageTitleOf(html: string): string {
  return TITLE_RE.exec(html)?.[1].trim() ?? '';
}

/** Sets the page's <title> text, adding a <title> to <head> if the page has none. */
async function setPageTitle(doc: vscode.TextDocument, title: string) {
  const text = doc.getText();
  const esc = title.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const m = TITLE_RE.exec(text);
  const we = new vscode.WorkspaceEdit();
  if (m) {
    const start = m.index + m[0].indexOf('>') + 1;
    we.replace(doc.uri, new vscode.Range(doc.positionAt(start), doc.positionAt(start + m[1].length)), esc);
  } else {
    const head = /<head\b[^>]*>/i.exec(text);
    if (!head) return;
    const at = head.index + head[0].length;
    we.insert(doc.uri, doc.positionAt(at), `\n  <title>${esc}</title>`);
  }
  await vscode.workspace.applyEdit(we);
}
