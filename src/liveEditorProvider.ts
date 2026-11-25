import * as vscode from 'vscode';
import {
  type HtmlModel,
  escapeAttr,
  escapeText,
  type LdNode,
  ancestry,
  buildServedHtml,
  isExternalUrl,
  label,
  nodeAtOffset,
  nodeByPath,
  nodeByStart,
  parseHtml,
} from './htmlModel';
import {
  type EditResult,
  type InsertPosition,
  canInsert,
  ensureHeadAssets,
  htmlTemplate,
  deleteElement,
  editTexts,
  insertSnippet,
  moveElement,
  setAttribute,
  wrapElement,
  insertMarkup,
  moveElementTo,
  renameTag,
  setBooleanAttribute,
  wrapWith,
  replaceContent,
  insertInline,
  appendToHead,
  scaffoldPage,
} from './edits';
import { INSERT_CATEGORIES, SNIPPETS } from './snippets';
import { updateInlineStyle } from './css/cssModel';
import { applyDesignerLayout, trackThemedWebview, uiTheme } from './theme';
import { linkKind, resolveLocal } from './links';
import type { AxeReport } from './audit';
import { bumpStylesheetVersion, dirtyStylesheet, linkedStylesheets, rebaseCssUrls, resolveHref, selectorNamesFor, stylesheetVersion } from './css/stylesheets';
import { type Mode, ModeController, VIEW_TYPE } from './modes';
import type { Hub } from './hub';

export type Placement = InsertPosition | 'wrap';

/** Attributes shown in the Attributes panel, per tag (id and class are always shown). */
const TAG_FIELDS: Record<string, string[]> = {
  a: ['href', 'target', 'title'],
  img: ['src', 'alt', 'width', 'height'],
  input: ['type', 'name', 'placeholder', 'value'],
  button: ['type'],
  form: ['action', 'method'],
  label: ['for'],
  textarea: ['name', 'placeholder', 'rows'],
  select: ['name'],
  option: ['value'],
  iframe: ['src', 'title', 'width', 'height'],
  video: ['src', 'poster'],
  audio: ['src'],
  source: ['src', 'type'],
  link: ['rel', 'href'],
  script: ['src'],
  th: ['colspan', 'rowspan'],
  td: ['colspan', 'rowspan'],
};

/** Rendered-copy-only CSS so empty containers stay visible and droppable (like outlines). */
const VISUAL_AIDS_CSS =
  '[data-ld-id]:empty:not(img,input,br,hr,meta,link,script,style,iframe,video,audio,canvas,textarea,select,area,base,col,embed,source,track,wbr,svg,option,html,head,title,template,span,a,b,i,em,strong,label,button){min-height:28px;outline:1px dashed rgba(30,136,255,.5);outline-offset:-1px}' +
  'span[data-ld-id]:empty,a[data-ld-id]:empty,em[data-ld-id]:empty,strong[data-ld-id]:empty,b[data-ld-id]:empty,i[data-ld-id]:empty{display:inline-block;min-width:16px;min-height:1em;outline:1px dashed rgba(30,136,255,.5)}';

/** Elements that can't be edited inline (text). */
export const NOT_TEXT_EDITABLE = new Set([
  'html', 'head', 'body', 'script', 'style', 'title', 'meta', 'link', 'img', 'input', 'br', 'hr', 'textarea',
  'select', 'option', 'iframe', 'video', 'audio', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'ul', 'ol', 'svg',
]);

export interface SelectionInfo {
  id: number;
  tag: string;
  label: string;
  attrs: Record<string, string>;
  fields: string[];
  located: boolean;
  crumbs: { id: number; label: string; located: boolean }[];
  canInside: boolean;
  canSiblings: boolean;
  textEditable: boolean;
  file: string;
  /** For elements inside an <a>: that link (image Link / Target fields). */
  parentLink?: { id: number; href: string; target: string };
  /** For <select>: its options. */
  options?: { label: string; value: string; selected: boolean }[];
  /** For <label>: ids of form controls on the page (the "for" picker). */
  formIds?: string[];
  children: number;
}

export interface RenderStats {
  version: number;
  ldIds: number;
  stylesheets: number;
  stylesheetsWithRules: number;
  images: number;
  imagesLoaded: number;
  jquery: boolean;
  scriptMarkers: string[];
  selectedId: number | null;
  scrollY: number;
  resources?: string[];
}

let formChannel: vscode.OutputChannel | undefined;
/** "Live Design: Form Tests" output: what each tested form would send. */
const formLog = () => (formChannel ??= vscode.window.createOutputChannel('Live Design: Form Tests'));

/** #anchor to scroll to once a page opened by Follow Link renders. */
const pendingAnchors = new Map<string, string>();

type FromWebview =
  | { type: 'ready' }
  | { type: 'select'; id: number | null }
  | { type: 'insert'; tag: string; position: Placement; targetId: number }
  | { type: 'editText'; id: number; changes: { index: number; value: string }[]; count: number }
  | { type: 'setAttr'; id: number; name: string; value: string }
  | { type: 'addClassOrId'; id: number; value: string }
  | { type: 'delete'; id: number }
  | { type: 'move'; id: number; dir: 'up' | 'down' }
  | { type: 'mode'; mode: Mode }
  | { type: 'showPanels' }
  | { type: 'visualAids'; on: boolean }
  | { type: 'showProperties' }
  | { type: 'chooseTheme' }
  | { type: 'clip'; op: string; id: number }
  | { type: 'changeTag'; id: number }
  | { type: 'setSelectors'; id: number; value: string }
  | { type: 'createRules'; selectors: string[]; source: string }
  | { type: 'followLink'; href: string }
  | { type: 'puppetDone'; id: number }
  | { type: 'runAudit' }
  | { type: 'lighthouse' }
  | { type: 'auditShow'; category: string }
  | { type: 'formSubmit'; action: string; method: string; fields: [string, string][]; id: number }
  | { type: 'formInvalid'; field: string; label: string; message: string }
  | { type: 'scaffold' }
  | { type: 'placeInsert'; key: string }
  | { type: 'boxEdit'; id: number; props: Record<string, string>; what: string }
  | { type: 'gridEdit'; id: number; axis: 'columns' | 'rows'; op: 'set' | 'add' | 'remove'; index: number; value?: string; computed: string[]; what: string }
  | { type: 'moveEl'; id: number; targetId: number; position: InsertPosition }
  | { type: 'rendered'; stats: RenderStats }
  | { type: 'log'; text: string }
  | { type: 'probeResult'; result: unknown }
  | { type: 'queryResult'; reqId: number; result: unknown };

export class LiveDesignProvider implements vscode.CustomTextEditorProvider {
  readonly sessions = new Set<LiveSession>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    readonly modes: ModeController,
    readonly hub: Hub,
  ) {}

  private shownProperties = false;

  resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): void {
    const session = new LiveSession(this.context, document, panel, this.modes, this.hub);
    // First Design view in this window: set up the workspace layout (files left, CSS + DOM right,
    // Properties bottom) so everything is discoverable.
    if (!this.shownProperties && vscode.workspace.getConfiguration('liveDesign').get<boolean>('applyLayoutOnOpen', true)) {
      this.shownProperties = true;
      setTimeout(() => void applyDesignerLayout(() => !session.disposed && panel.reveal(panel.viewColumn, false)), 400);
    }
    this.sessions.add(session);
    this.hub.add(session);
    panel.onDidDispose(() => {
      this.sessions.delete(session);
      this.hub.remove(session);
      session.dispose();
    });
  }

  sessionsFor(uri: vscode.Uri): LiveSession[] {
    return [...this.sessions].filter((s) => s.document.uri.toString() === uri.toString() && !s.disposed);
  }
}

export class LiveSession {
  model: HtmlModel;
  /** The model whose ids are stamped into the page currently shown in the canvas. */
  private renderedModel: HtmlModel | undefined;
  private modelVersion: number;
  selectedId: number | undefined;
  private selectedPath: number[] | undefined;
  private selectedTag: string | undefined;
  /** Start offset of the element to select after the next re-parse (set by our own edits). */
  private pendingSelectStart: number | undefined;
  private revealPendingInEditor = false;
  private renderTimer: ReturnType<typeof setTimeout> | undefined;
  private cursorTimer: ReturnType<typeof setTimeout> | undefined;
  private lastProgrammaticSelection: string | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private ready = false;
  private renderVersion = 0;
  disposed = false;
  /** Outlines: empty elements get a dashed outline and a minimum height. */
  visualAids = true;
  lastStats: RenderStats | undefined;
  private statWaiters: ((s: RenderStats) => void)[] = [];
  readonly messages: string[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    readonly document: vscode.TextDocument,
    readonly panel: vscode.WebviewPanel,
    private readonly modes: ModeController,
    private readonly hub: Hub,
  ) {
    this.model = parseHtml(document.getText());
    this.modelVersion = document.version;

    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    const docDir = vscode.Uri.joinPath(document.uri, '..');
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [folder?.uri ?? docDir, vscode.Uri.joinPath(context.extensionUri, 'media')],
    };
    panel.webview.html = this.shellHtml();
    this.disposables.push(trackThemedWebview(panel.webview));

    this.disposables.push(
      panel.webview.onDidReceiveMessage((m: FromWebview) => this.handleMessage(m)),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document !== this.document || e.contentChanges.length === 0) return;
        this.reparse();
        this.scheduleRender();
      }),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.contentChanges.length && this.linksTo(e.document.uri)) this.scheduleRender(80);
      }),
      vscode.workspace.onDidSaveTextDocument((d) => {
        if (!this.linksTo(d.uri)) return;
        bumpStylesheetVersion(d.uri);
        this.scheduleRender(0);
      }),
      vscode.window.onDidChangeTextEditorSelection((e) => {
        if (e.textEditor.document !== this.document) return;
        // kind is undefined for selections set by extensions (including our own revealInEditor).
        if (e.kind === undefined) return;
        this.onEditorSelection(e.textEditor);
      }),
      vscode.window.tabGroups.onDidChangeTabs(() => this.postMode()),
      modes.onDidChangeMode(() => this.postMode()),
      panel.onDidChangeViewState(() => {
        if (panel.active) hub.setActive(this);
        if (panel.visible) this.postMode();
      }),
    );
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.renderTimer);
    clearTimeout(this.cursorTimer);
    this.disposables.forEach((d) => d.dispose());
  }

  // -------------------------------------------------------------------------
  // Model / rendering
  // -------------------------------------------------------------------------

  /** Re-parses when the document changed, so offsets are always current. */
  reparse() {
    if (this.modelVersion === this.document.version) return;
    const prevSelected = this.selectedId !== undefined ? this.model.nodes[this.selectedId] : undefined;
    if (prevSelected) {
      this.selectedPath = prevSelected.path;
      this.selectedTag = prevSelected.tag;
    }
    this.model = parseHtml(this.document.getText());
    this.modelVersion = this.document.version;
    this.selectedId = this.resolveSelection();
    this.hub.modelChanged(this);
    this.hub.selectionChanged(this);
  }

  private resolveSelection(): number | undefined {
    if (this.pendingSelectStart !== undefined) {
      const n = nodeByStart(this.model, this.pendingSelectStart);
      this.pendingSelectStart = undefined;
      if (n) return n.id;
    }
    if (this.selectedPath) {
      const n = nodeByPath(this.model, this.selectedPath);
      if (n && n.tag === this.selectedTag) return n.id;
    }
    return undefined;
  }

  /** Whether this page links the given stylesheet. */
  linksTo(uri: vscode.Uri): boolean {
    if (!/\.css$/i.test(uri.path)) return false;
    return linkedStylesheets(this.model, this.document.uri).some((l) => l.uri.toString() === uri.toString());
  }

  private scheduleRender(ms?: number) {
    clearTimeout(this.renderTimer);
    const delay = ms ?? vscode.workspace.getConfiguration('liveDesign').get<number>('renderDelay', 300);
    this.renderTimer = setTimeout(() => this.render(), delay);
  }

  render() {
    if (!this.ready || this.disposed) return;
    clearTimeout(this.renderTimer);
    this.reparse();
    const webview = this.panel.webview;
    const docDir = vscode.Uri.joinPath(this.document.uri, '..');
    const folder = vscode.workspace.getWorkspaceFolder(this.document.uri);
    const dirUrl = webview.asWebviewUri(docDir).toString().replace(/\/?$/, '/');
    const rootUrl = webview.asWebviewUri(folder?.uri ?? docDir).toString().replace(/\/?$/, '/');
    const resolveWeb = (u: string) =>
      u.startsWith('/') ? new URL(u.slice(1), rootUrl).toString() : new URL(u, dirUrl).toString();
    const html = buildServedHtml(this.model, {
      nonce: this.nonce,
      designCss: this.visualAids ? VISUAL_AIDS_CSS : undefined,
      baseHref: dirUrl,
      rewriteUrl: (u) => {
        if (isExternalUrl(u)) return undefined;
        try {
          const url = resolveWeb(u);
          // Cache-bust saved stylesheets so the Design view picks up CSS changes.
          if (/\.css(?:$|[?#])/i.test(u)) {
            const file = resolveHref(u, this.document.uri);
            const v = file ? stylesheetVersion(file) : 0;
            if (v) return url + (url.includes('?') ? '&' : '?') + 'ld=' + v;
          }
          return url;
        } catch {
          return undefined;
        }
      },
      // Stylesheets with unsaved edits are rendered inline from the editor text.
      inlineStylesheet: (node) => {
        const href = node.attrs.find((a) => a.name === 'href')?.value.trim() ?? '';
        const rel = node.attrs.find((a) => a.name === 'rel')?.value.toLowerCase() ?? '';
        if (!/\bstylesheet\b/.test(rel) || !href || isExternalUrl(href)) return undefined;
        const file = resolveHref(href, this.document.uri);
        const doc = file && dirtyStylesheet(file);
        if (!doc) return undefined;
        return rebaseCssUrls(doc.getText(), webview.asWebviewUri(vscode.Uri.joinPath(file!, '..')).toString() + '/');
      },
    });
    this.renderVersion++;
    this.renderedModel = this.model;
    const issues = this.model.issues;
    const first = issues[0];
    this.post({
      type: 'render',
      version: this.renderVersion,
      html,
      selectId: this.selectedId ?? null,
      // <body> may be implied (not in the source); the canvas tags it so it can still be selected.
      bodyId: this.model.nodes.find((n) => n.tag === 'body')?.id ?? null,
      empty: !this.model.text.trim(),
      warning: issues.length
        ? `HTML has ${issues.length} parse issue${issues.length > 1 ? 's' : ''} — the Design view may differ from the source. First: ${first.code.replace(/-/g, ' ')} (line ${first.line}, col ${first.col}).`
        : null,
    });
    this.postSelection(false);
    void this.postNames();
    const anchor = pendingAnchors.get(this.document.uri.toString());
    if (anchor) {
      pendingAnchors.delete(this.document.uri.toString());
      this.post({ type: 'scrollToAnchor', id: anchor });
    }
    if (this.revealPendingInEditor) {
      this.revealPendingInEditor = false;
      this.revealInEditor();
    }
  }

  // -------------------------------------------------------------------------
  // Public operations (used by the canvas and by the side panels)
  // -------------------------------------------------------------------------

  get selected(): LdNode | undefined {
    return this.selectedId !== undefined ? this.model.nodes[this.selectedId] : undefined;
  }

  /** Selects an element everywhere: canvas, code editor (Split), Structure tree and Properties. */
  select(id: number | undefined, opts: { scrollCanvas?: boolean; revealEditor?: boolean } = {}) {
    this.selectedId = id;
    this.postSelection(opts.scrollCanvas ?? false);
    if (opts.revealEditor !== false) this.revealInEditor();
    this.hub.selectionChanged(this);
  }

  /** Insert-panel click: shows the Before/After/Wrap/Nest popover on the canvas, or appends to the page. */
  placeInsert(key: string) {
    const snippet = SNIPPETS[key];
    if (!snippet) return;
    const sel = this.selected;
    if (snippet.place === 'head') return this.insertHead(snippet.lines);
    if (snippet.place === 'inline') {
      const target = sel ?? this.model.nodes.find((n) => n.tag === 'body');
      if (!target) return this.notify('Select an element first.');
      const markup = key === 'date' ? new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : snippet.lines.join('');
      return this.applyResult(() => insertInline(this.model, target.id, markup), false);
    }
    if (sel && (sel.located || sel.tag === 'body')) {
      this.panel.reveal(this.panel.viewColumn, true);
      this.post({ type: 'place', key, tag: snippet.tag, name: snippet.name });
      return;
    }
    // Nothing selected: add at the end of <main> (or <body>), like inserting at the cursor.
    const target =
      this.model.nodes.find((n) => n.tag === 'main' && n.located) ??
      this.model.nodes.find((n) => n.tag === 'body');
    if (!target) return this.notify('Select an element first.');
    void this.insert(key, 'inside-last', target.id);
  }

  /** Head items (meta, link, base): appended to <head>, no placement needed. */
  insertHead(lines: string[]) {
    const head = this.model.nodes.find((n) => n.tag === 'head');
    if (!head?.located || head.etStart === undefined) {
      return this.notify('This page has no <head> in its source — add the HTML5 page structure first.');
    }
    return this.applyResult(() => {
      const edits = appendToHead(this.model, lines.map((l) => l.replace(/^\t+/, '')));
      return edits.length ? { ok: true, edits } : { ok: false, message: 'Could not find <head>.' };
    }, false);
  }

  insert(key: string, position: Placement, targetId: number) {
    const snippet = SNIPPETS[key];
    if (snippet?.place) {
      this.selectedId = targetId;
      return this.placeInsert(key);
    }
    return this.applyResult(() => {
      const res =
        position === 'wrap' ? wrapElement(this.model, targetId, key) : insertSnippet(this.model, targetId, key, position);
      if (!res.ok) return res;
      // Tailwind / React snippets also need their CDN scripts in <head> (added once, same undo step).
      const head = ensureHeadAssets(this.model, SNIPPETS[key]?.requires);
      if (!head.length) return res;
      let selectStart = res.selectStart;
      for (const h of head) if (selectStart !== undefined && h.start <= selectStart) selectStart += h.text.length;
      return { ok: true, edits: [...head, ...res.edits], selectStart };
    }, true);
  }

  /** Applies page edits computed against the current model (used by the Styles panel). */
  editPage(compute: (model: HtmlModel) => EditResult, reveal = false) {
    return this.applyResult(() => compute(this.model), reveal);
  }

  setAttr(id: number, name: string, value: string) {
    return this.applyResult(() => setAttribute(this.model, id, name, value), false);
  }

  moveTo(id: number, targetId: number, position: InsertPosition) {
    return this.applyResult(() => moveElementTo(this.model, id, targetId, position), true);
  }

  renameTag(id: number, tag: string) {
    return this.applyResult(() => renameTag(this.model, id, tag), false);
  }

  setBool(id: number, name: string, on: boolean) {
    return this.applyResult(() => setBooleanAttribute(this.model, id, name, on), false);
  }

  /** Image/element link: edits the parent <a>, or wraps the element in a new <a href>. */
  setLink(id: number, attr: 'href' | 'target', value: string) {
    const n = this.model.nodes[id];
    const parent = n?.parent !== undefined ? this.model.nodes[n.parent] : undefined;
    if (parent?.tag === 'a' && parent.located) return this.setAttr(parent.id, attr, value);
    if (attr !== 'href' || !value.trim()) return this.notify(attr === 'target' ? 'Set a Link first.' : '');
    return this.applyResult(() => wrapWith(this.model, id, `<a href="${escapeAttr(value.trim())}">`, 'a'), false);
  }

  /** Rewrites a <select>'s option list. */
  setOptions(id: number, options: { label: string; value: string; selected?: boolean }[]) {
    const lines = options.map(
      (o) => `<option value="${escapeAttr(o.value)}"${o.selected ? ' selected' : ''}>${escapeText(o.label)}</option>`,
    );
    return this.applyResult(() => replaceContent(this.model, id, lines), false);
  }

  /** Replaces the element's id and classes from text like "#hero .card big". */
  setSelectors(id: number, raw: string) {
    const tokens = raw.trim().split(/[\s,]+/).filter(Boolean);
    const ids = tokens.filter((t) => t.startsWith('#')).map((t) => t.slice(1)).filter(Boolean);
    const classes = tokens.filter((t) => !t.startsWith('#')).map((t) => t.replace(/^\./, '')).flatMap((t) => t.split('.')).filter(Boolean);
    return (async () => {
      await this.setAttr(id, 'id', ids[0] ?? '');
      await this.setAttr(id, 'class', [...new Set(classes)].join(' '));
    })();
  }

  /** Last form test in Interact mode (submit that passed validation, or the first invalid field). */
  lastFormTest: Record<string, unknown> | undefined;

  /** Runs axe-core inside the rendered page; violations come back with model ids. */
  async runAxe(axeUrl: string): Promise<AxeReport | { error: string } | undefined> {
    const r = await this.query<AxeReport | { error: string }>('axe', { axeUrl }, 30000);
    if (!r || 'error' in r) return r;
    return { ...r, violations: r.violations.map((v) => ({ ...v, nodes: v.nodes.map((n) => ({ ...n, id: n.id === null ? null : this.fromView(n.id) })) })) };
  }

  /** Shows audit markers (by model id) and the score bar on the canvas. */
  showAuditMarkers(items: { id?: number; impact: string; category: string; message: string }[], scores: Record<string, number | null>, note: string) {
    this.post({ type: 'auditMarkers', items: items.map((i) => ({ ...i, id: i.id === undefined ? null : this.viewId(i.id) ?? null })), scores, note });
  }

  /** Last link followed (test-only): what it resolved to and what happened. */
  lastFollow: { href: string; action: string; target?: string } | undefined;

  /**
   * Follow link: another page of the site opens in Design view (scrolled to #anchor),
   * a missing page offers to be created, external links open in the browser.
   */
  async followLink(href: string) {
    const kind = linkKind(href);
    const record = (action: string, target?: string) => (this.lastFollow = { href, action, target });
    if (kind === 'external' || /^(mailto|tel):/i.test(href.trim())) {
      record('external', href);
      await vscode.env.openExternal(vscode.Uri.parse(href.startsWith('//') ? 'https:' + href : href));
      return;
    }
    if (kind !== 'local') return void record('ignored');
    const r = await resolveLocal(href, this.document.uri);
    if (!r.uri) return void record('ignored');
    if (!r.found) {
      record('missing', r.uri.toString());
      const name = vscode.workspace.asRelativePath(r.uri);
      const pick = await vscode.window.showWarningMessage(`${name} doesn't exist yet.`, 'Create Page');
      if (pick !== 'Create Page') return;
      if (!/\.html?$/i.test(r.uri.path)) return;
      const title = r.uri.path.split('/').pop()!.replace(/\.html?$/i, '').replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase());
      await vscode.workspace.fs.writeFile(r.uri, new TextEncoder().encode(htmlTemplate([`<h1>${title}</h1>`]).replace('<title>Untitled Document</title>', `<title>${title}</title>`)));
    }
    if (/\.html?$/i.test(r.uri.path)) {
      record('page', r.uri.toString() + (r.hash ? '#' + r.hash : ''));
      if (r.hash) pendingAnchors.set(r.uri.toString(), r.hash);
      if (r.uri.toString() === this.document.uri.toString()) {
        if (r.hash) this.post({ type: 'scrollToAnchor', id: r.hash });
        return;
      }
      await vscode.commands.executeCommand('vscode.openWith', r.uri, VIEW_TYPE);
      return;
    }
    record('file', r.uri.toString());
    await vscode.commands.executeCommand('vscode.open', r.uri);
  }

  private lastNames = '';
  /** Class / ID names for the selection chip's hints: defined in CSS, and used on the page. */
  private async postNames() {
    let css = { classes: [] as string[], ids: [] as string[] };
    try {
      css = await selectorNamesFor(this.model, this.document.uri);
    } catch {
      /* unreadable stylesheet */
    }
    const usedC = new Set<string>();
    const usedI = new Set<string>();
    for (const n of this.model.nodes) {
      for (const a of n.attrs) {
        if (a.name === 'class') a.value.split(/\s+/).filter(Boolean).forEach((c) => usedC.add(c));
        if (a.name === 'id' && a.value.trim()) usedI.add(a.value.trim());
      }
    }
    const sources = (await this.hub.ruleSources?.().catch(() => [])) ?? [];
    const msg = { type: 'names', css, used: { classes: [...usedC].sort(), ids: [...usedI].sort() }, sources };
    const key = JSON.stringify(msg);
    if (key === this.lastNames) return;
    this.lastNames = key;
    this.post(msg);
  }

  // Clipboard (Copy, Cut, Paste, Paste As Child, Duplicate) ----------------------

  /** Source text of an element (copied to the system clipboard too, so it pastes into code). */
  async copyElement(id: number) {
    const n = this.model.nodes[id];
    if (!n?.located) return this.notify('Nothing to copy.');
    await vscode.env.clipboard.writeText(this.model.text.slice(n.start, n.end));
    this.notify(`Copied ${label(n)}.`);
  }

  async cutElement(id: number) {
    const n = this.model.nodes[id];
    if (!n?.located) return;
    await vscode.env.clipboard.writeText(this.model.text.slice(n.start, n.end));
    await this.deleteElement(id);
  }

  /** Pastes the clipboard's HTML after the element, or inside it (as its last child). */
  async pasteAt(id: number, asChild: boolean) {
    const text = await vscode.env.clipboard.readText();
    if (!text.trim()) return this.notify('The clipboard is empty.');
    this.reparse();
    const n = this.model.nodes[id];
    if (!n) return;
    return this.applyResult(() => insertMarkup(this.model, id, text, asChild || canInsert(n, 'after') ? 'inside-last' : 'after'), true);
  }

  duplicateElement(id: number) {
    const n = this.model.nodes[id];
    if (!n?.located) return;
    return this.applyResult(() => insertMarkup(this.model, id, this.model.text.slice(n.start, n.end), 'after'), true);
  }

  /** Updates the element's style="" attribute ("" removes a property). */
  setInlineStyle(id: number, props: Record<string, string>) {
    const n = this.model.nodes[id];
    if (!n) return;
    const cur = n.attrs.find((a) => a.name === 'style')?.value ?? '';
    return this.setAttr(id, 'style', updateInlineStyle(cur, props));
  }

  addClassOrId(id: number, raw: string) {
    const v = raw.trim();
    if (!v) return;
    const n = this.model.nodes[id];
    if (!n) return;
    if (v.startsWith('#')) return this.setAttr(id, 'id', v.slice(1));
    const add = v.replace(/^\./, '').split(/[\s.]+/).filter(Boolean);
    const cur = (n.attrs.find((a) => a.name === 'class')?.value ?? '').split(/\s+/).filter(Boolean);
    const next = [...cur, ...add.filter((c) => !cur.includes(c))].join(' ');
    return this.setAttr(id, 'class', next);
  }

  deleteElement(id: number) {
    const parent = this.model.nodes[id]?.parent;
    const parentNode = parent !== undefined ? this.model.nodes[parent] : undefined;
    return this.applyResult(() => deleteElement(this.model, id), false, parentNode?.located ? parentNode.start : undefined);
  }

  move(id: number, dir: 'up' | 'down') {
    return this.applyResult(() => moveElement(this.model, id, dir), true);
  }

  startTextEdit(id: number) {
    this.panel.reveal(this.panel.viewColumn, false);
    this.post({ type: 'startEdit', id });
  }

  selectionInfo(n: LdNode | undefined = this.selected): SelectionInfo | null {
    if (!n) return null;
    const attrs: Record<string, string> = {};
    for (const a of n.attrs) attrs[a.name] = a.value;
    return {
      id: n.id,
      tag: n.tag,
      label: label(n),
      attrs,
      fields: ['id', 'class', ...(TAG_FIELDS[n.tag] ?? [])],
      located: n.located,
      crumbs: ancestry(this.model, n.id).map((a) => ({ id: a.id, label: label(a), located: a.located })),
      canInside: !canInsert(n, 'inside-last'),
      canSiblings: !canInsert(n, 'before'),
      textEditable: n.located && !NOT_TEXT_EDITABLE.has(n.tag) && !n.foreign,
      file: vscode.workspace.asRelativePath(this.document.uri),
      parentLink: (() => {
        const p = n.parent !== undefined ? this.model.nodes[n.parent] : undefined;
        if (p?.tag !== 'a') return undefined;
        const get = (k: string) => p.attrs.find((a) => a.name === k)?.value ?? '';
        return { id: p.id, href: get('href'), target: get('target') };
      })(),
      options:
        n.tag === 'select'
          ? n.children
              .map((c) => this.model.nodes[c])
              .filter((c) => c.tag === 'option')
              .map((o) => {
                const label = o.texts.map((t) => t.value).join('').trim();
                const v = o.attrs.find((a) => a.name === 'value');
                return { label, value: v ? v.value : label, selected: o.attrs.some((a) => a.name === 'selected') };
              })
          : undefined,
      formIds: n.tag === 'label'
        ? this.model.nodes
            .filter((x) => ['input', 'select', 'textarea', 'button', 'output', 'meter', 'progress'].includes(x.tag))
            .map((x) => x.attrs.find((a) => a.name === 'id')?.value)
            .filter((x): x is string => !!x)
        : undefined,
      children: n.children.length,
    };
  }

  // -------------------------------------------------------------------------
  // Messages
  // -------------------------------------------------------------------------

  /**
   * The canvas speaks in ids of the model it last rendered; after a document change (before the
   * debounced re-render lands) those can differ from the current model's ids. Map by element path.
   */
  private fromView(id: number): number {
    const r = this.renderedModel;
    if (!r || r === this.model) return id;
    const n = r.nodes[id];
    const m = n && nodeByPath(this.model, n.path);
    return m && m.tag === n.tag ? m.id : -1;
  }

  /** Whether ids in the canvas currently match the model (no re-render pending). */
  private get viewInSync(): boolean {
    return this.renderedModel === this.model;
  }

  /** Test-only: types of the messages the canvas sent, newest last. */
  readonly handled: string[] = [];

  async handleMessage(raw: FromWebview): Promise<void> {
    this.handled.push(raw.type);
    if (this.handled.length > 200) this.handled.shift();
    this.reparse();
    const m = { ...raw } as FromWebview;
    if ('id' in m && typeof m.id === 'number') m.id = this.fromView(m.id);
    if ('targetId' in m && typeof m.targetId === 'number') m.targetId = this.fromView(m.targetId);
    switch (m.type) {
      case 'ready':
        this.ready = true;
        this.post({
          type: 'init',
          mode: this.modes.currentMode(this.document.uri),
          insertBar: vscode.workspace.getConfiguration('liveDesign').get<boolean>('insertBar', true),
          categories: INSERT_CATEGORIES,
          snippets: Object.fromEntries(
            Object.values(SNIPPETS)
              .filter((x) => x.source !== 'user')
              .map((x) => [x.key, { key: x.key, tag: x.tag, name: x.name, icon: x.icon, requires: x.requires, lines: x.lines, place: x.place }]),
          ),
        });
        this.render();
        return;
      case 'rendered':
        this.hub.rendered(this);
        this.lastStats = m.stats;
        this.statWaiters.splice(0).forEach((w) => w(m.stats));
        return;
      case 'select':
        this.hub.setActive(this);
        this.select(m.id === null || m.id < 0 ? undefined : m.id);
        return;
      case 'insert':
        return this.insert(m.tag, m.position, m.targetId);
      case 'editText':
        return this.applyResult(() => editTexts(this.model, m.id, m.changes, m.count), false);
      case 'setAttr':
        return this.setAttr(m.id, m.name, m.value);
      case 'addClassOrId':
        return this.addClassOrId(m.id, m.value);
      case 'delete':
        return this.deleteElement(m.id);
      case 'move':
        return this.move(m.id, m.dir);
      case 'mode':
        await vscode.commands.executeCommand(`liveDesign.${m.mode}View`, this.document.uri);
        return;
      case 'moveEl': {
        const mv = m as unknown as { id: number; targetId: number; position: InsertPosition };
        if (mv.id < 0 || mv.targetId < 0) return;
        return this.moveTo(mv.id, mv.targetId, mv.position);
      }
      case 'boxEdit':
      case 'gridEdit': {
        const ed = raw as unknown as { id: number; props?: Record<string, string>; axis?: 'columns' | 'rows'; op?: 'set' | 'add' | 'remove'; index?: number; value?: string; computed?: string[]; what: string };
        const id = this.fromView(ed.id);
        if (id < 0 || !this.hub.canvasEdit) return;
        if (id !== this.selectedId) this.select(id, { revealEditor: false });
        const where = await this.hub.canvasEdit(
          m.type === 'boxEdit'
            ? { kind: 'props', props: ed.props ?? {} }
            : { kind: 'track', axis: ed.axis!, op: ed.op!, index: ed.index ?? -1, value: ed.value, computed: ed.computed ?? [] },
        );
        if (where) this.notify(`${ed.what} → ${where}`);
        return;
      }
      case 'placeInsert':
        this.placeInsert((raw as { key: string }).key);
        return;
      case 'scaffold':
        return this.applyResult(() => scaffoldPage(this.model), true);
      case 'setSelectors': {
        const ss = raw as unknown as { id: number; value: string };
        if (ss.id >= 0) await this.setSelectors(ss.id, ss.value);
        return;
      }
      case 'runAudit':
        await vscode.commands.executeCommand('liveDesign.audit', this.document.uri);
        return;
      case 'lighthouse':
        await vscode.commands.executeCommand('liveDesign.lighthouse', this.document.uri);
        return;
      case 'auditShow':
        await vscode.commands.executeCommand('liveDesign.auditShow');
        return;
      case 'formSubmit': {
        const f = raw as unknown as { action: string; method: string; fields: [string, string][] };
        this.lastFormTest = { kind: 'submit', ...f };
        formLog().appendLine(`[${new Date().toLocaleTimeString()}] ${vscode.workspace.asRelativePath(this.document.uri)}: form would ${f.method} to ${f.action || '(no action)'}`);
        for (const [k, v] of f.fields) formLog().appendLine(`    ${k} = ${JSON.stringify(v)}`);
        if (!f.fields.length) formLog().appendLine('    (no fields sent — do the inputs have name attributes?)');
        void vscode.window.showInformationMessage(`Form test passed validation: ${f.method} ${f.action || '(no action)'} with ${f.fields.length} field(s).`, 'Show Data').then((p) => p && formLog().show(true));
        return;
      }
      case 'formInvalid': {
        const f = raw as unknown as { field: string; label: string; message: string };
        this.lastFormTest = { kind: 'invalid', ...f };
        formLog().appendLine(`[${new Date().toLocaleTimeString()}] ${vscode.workspace.asRelativePath(this.document.uri)}: blocked by validation — ${f.label}: ${f.message}`);
        return;
      }
      case 'puppetDone': {
        const id = (raw as unknown as { id: number }).id;
        this.puppetWaiters.get(id)?.();
        this.puppetWaiters.delete(id);
        return;
      }
      case 'followLink':
        return this.followLink((raw as unknown as { href: string }).href);
      case 'createRules': {
        const cr = raw as unknown as { selectors: string[]; source: string };
        await this.hub.createRules?.(cr.selectors, cr.source);
        this.lastNames = '';
        void this.postNames();
        return;
      }
      case 'changeTag': {
        const id = this.fromView((raw as unknown as { id: number }).id);
        if (id >= 0) await vscode.commands.executeCommand('liveDesign.dom.changeTag', { id });
        return;
      }
      case 'clip': {
        const c = raw as unknown as { op: string; id: number };
        const id = this.fromView(c.id);
        if (id < 0) return;
        if (c.op === 'copy') return this.copyElement(id);
        if (c.op === 'cut') return this.cutElement(id);
        if (c.op === 'paste') return this.pasteAt(id, false);
        if (c.op === 'pasteChild') return this.pasteAt(id, true);
        if (c.op === 'duplicate') return this.duplicateElement(id);
        return;
      }
      case 'visualAids':
        this.visualAids = !!(raw as { on: boolean }).on;
        this.render();
        return;
      case 'showProperties':
        await vscode.commands.executeCommand('liveDesign.properties.focus');
        return;
      case 'showPanels':
        await applyDesignerLayout(() => this.panel.reveal(this.panel.viewColumn, false));
        return;
      case 'chooseTheme':
        await vscode.commands.executeCommand('liveDesign.chooseTheme');
        return;
      case 'log':
        console.log('[live-design webview]', m.text);
        return;
      case 'queryResult': {
        const q = raw as { reqId: number; result: unknown };
        const w = this.queryWaiters.get(q.reqId);
        this.queryWaiters.delete(q.reqId);
        w?.(q.result);
        return;
      }
      case 'probeResult':
        this.probeWaiters.splice(0).forEach((w) => w(m.result));
        return;
    }
  }

  /**
   * Computes an edit against the current model and applies it as a single WorkspaceEdit,
   * so native undo/redo, dirty state and save all work.
   */
  private async applyResult(compute: () => EditResult, reveal: boolean, selectStartOverride?: number) {
    this.reparse();
    const res = compute();
    if (!res.ok) {
      this.notify(res.message);
      return;
    }
    if (res.edits.length === 0) return;
    const we = new vscode.WorkspaceEdit();
    for (const e of res.edits) {
      we.replace(
        this.document.uri,
        new vscode.Range(this.document.positionAt(e.start), this.document.positionAt(e.end)),
        e.text,
      );
    }
    this.pendingSelectStart = selectStartOverride ?? res.selectStart;
    if (this.pendingSelectStart === undefined) this.selectedPath = undefined;
    this.revealPendingInEditor = reveal;
    const ok = await vscode.workspace.applyEdit(we);
    if (!ok) {
      this.pendingSelectStart = undefined;
      this.notify('The edit could not be applied.');
      return;
    }
    // Our own edit: render promptly instead of waiting for the typing debounce.
    this.reparse();
    this.render();
  }

  notify(text: string) {
    this.messages.push(text);
    this.post({ type: 'message', text });
  }

  private post(msg: unknown) {
    if (this.disposed) return;
    void this.panel.webview.postMessage(msg);
  }

  private postMode() {
    if (!this.ready) return;
    this.post({ type: 'mode', mode: this.modes.currentMode(this.document.uri) });
  }

  private postSelection(scroll: boolean) {
    // While a re-render is pending the canvas still shows old ids; render() re-sends the selection.
    if (!this.viewInSync) return;
    this.post({ type: 'selection', info: this.selectionInfo(), scroll });
  }

  // -------------------------------------------------------------------------
  // Split-view sync
  // -------------------------------------------------------------------------

  private codeEditor(): vscode.TextEditor | undefined {
    return vscode.window.visibleTextEditors.find((e) => e.document === this.document);
  }

  private revealInEditor() {
    const editor = this.codeEditor();
    const n = this.selected;
    if (!editor || !n || !n.located) return;
    const sel = new vscode.Selection(this.document.positionAt(n.start), this.document.positionAt(n.end));
    this.lastProgrammaticSelection = selKey(sel);
    editor.selection = sel;
    editor.revealRange(sel, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  private onEditorSelection(editor: vscode.TextEditor) {
    const sel = editor.selection;
    if (selKey(sel) === this.lastProgrammaticSelection) return;
    this.lastProgrammaticSelection = undefined;
    clearTimeout(this.cursorTimer);
    this.cursorTimer = setTimeout(() => {
      this.reparse();
      // For a range selection use its start: the end offset sits just past the element (in its parent).
      const n = nodeAtOffset(this.model, this.document.offsetAt(sel.isEmpty ? sel.active : sel.start));
      if (!n || n.id === this.selectedId) return;
      this.select(n.id, { scrollCanvas: true, revealEditor: false });
    }, 60);
  }

  // -------------------------------------------------------------------------
  // Test hooks (used by the integration tests)
  // -------------------------------------------------------------------------

  waitForRender(minVersion?: number, timeoutMs = 15000): Promise<RenderStats> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Timed out waiting for Live render')), timeoutMs);
      const check = (s: RenderStats) => {
        if (minVersion === undefined || s.version >= minVersion) {
          clearTimeout(t);
          resolve(s);
        } else this.statWaiters.push(check);
      };
      if (this.lastStats && minVersion !== undefined && this.lastStats.version >= minVersion) check(this.lastStats);
      else this.statWaiters.push(check);
    });
  }

  get currentRenderVersion() {
    return this.renderVersion;
  }

  private probeWaiters: ((r: unknown) => void)[] = [];
  private queryWaiters = new Map<number, (r: unknown) => void>();
  private nextQuery = 1;

  /**
   * Asks the canvas something about the rendered page (e.g. which CSS rules match the selection).
   * Resolves undefined if the canvas doesn't answer (not rendered yet, or a re-render is pending).
   */
  query<T>(kind: string, payload: Record<string, unknown>, timeoutMs = 3000): Promise<T | undefined> {
    if (!this.ready || this.disposed) return Promise.resolve(undefined);
    const reqId = this.nextQuery++;
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        this.queryWaiters.delete(reqId);
        resolve(undefined);
      }, timeoutMs);
      this.queryWaiters.set(reqId, (r) => {
        clearTimeout(t);
        resolve(r as T);
      });
      this.post({ type: 'query', reqId, kind, ...payload });
    });
  }

  /**
   * Selects an element on the page that matches one of `selectors` (a CSS rule picked in the
   * Styles panel). Keeps the current selection if it already matches, unless `next` is set, which
   * steps to the following match. Returns false if nothing on the page matches.
   */
  async selectBySelector(selectors: string[], next = false): Promise<boolean> {
    if (!selectors.length || !this.viewInSync) return false;
    const res = await this.query<{ ids: number[] }>('selectorMatch', { selectors });
    const ids = (res?.ids ?? []).filter((id) => this.model.nodes[id]);
    if (!ids.length || !this.viewInSync) return false;
    const cur = this.selectedId !== undefined ? ids.indexOf(this.selectedId) : -1;
    if (cur >= 0 && !next) return true;
    this.select(ids[(cur + 1) % ids.length], { scrollCanvas: true });
    return true;
  }

  /** The id the canvas uses for a current-model element (undefined while a re-render is pending). */
  viewId(id: number | undefined): number | undefined {
    return id !== undefined && this.renderedModel === this.model ? id : undefined;
  }

  /** Test-only: asks the canvas for computed styles / text of elements matching a selector. */
  probe(selector: string, props: string[]): Promise<unknown> {
    return new Promise((resolve) => {
      this.probeWaiters.push(resolve);
      this.testAction({ kind: 'probe', selector, props });
    });
  }

  /** Test-only: reads a value from the page window ('jquery' | 'jqueryui' | 'scrollY'). */
  pageEval(what: string): Promise<any> {
    return new Promise((resolve) => {
      this.probeWaiters.push(resolve);
      this.testAction({ kind: 'pageEval', what });
    });
  }

  private puppetWaiters = new Map<number, () => void>();
  private puppetSeq = 0;
  /** Demo-only: drive the canvas with the drawn pointer (media/puppet.js); resolves when the step finishes. */
  puppet(action: Record<string, unknown>, timeoutMs = 15000): Promise<void> {
    const id = ++this.puppetSeq;
    return new Promise((resolve) => {
      const t = setTimeout(() => { this.puppetWaiters.delete(id); resolve(); }, timeoutMs);
      this.puppetWaiters.set(id, () => { clearTimeout(t); resolve(); });
      this.testAction({ kind: 'puppet', id, ...action });
    });
  }

  /** Test-only: toolbar button states, Elements bar / interact / visual-aids state. */
  uiState(): Promise<any> {
    return new Promise((resolve) => {
      this.probeWaiters.push(resolve);
      this.testAction({ kind: 'uiState' });
    });
  }

  /** Test-only: counts of the box-model overlay pieces for the current selection. */
  boxModelStats(): Promise<any> {
    return new Promise((resolve) => {
      this.probeWaiters.push(resolve);
      this.testAction({ kind: 'boxModel' });
    });
  }

  /** Sends a scripted action to the webview (test-only), e.g. a simulated drop. */
  testAction(action: unknown) {
    this.post({ type: 'test', action });
  }

  // -------------------------------------------------------------------------
  // Shell
  // -------------------------------------------------------------------------

  private readonly nonce = makeNonce();

  private shellHtml(): string {
    const webview = this.panel.webview;
    const media = (f: string) => webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', f));
    const csp = webview.cspSource;
    const n = this.nonce;
    const policy = [
      `default-src 'none'`,
      `img-src ${csp} https: http: data: blob:`,
      `media-src ${csp} https: http: data: blob:`,
      `font-src ${csp} https: data:`,
      `style-src ${csp} https: 'unsafe-inline'`,
      `script-src 'nonce-${n}' ${csp} https:`,
      `frame-src ${csp} https: data: blob: vscode-webview:`,
      `connect-src ${csp} https:`,
    ].join('; ');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${policy}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${media('codicons/codicon.css')}">
<link rel="stylesheet" href="${media('webview.css')}">
<link rel="stylesheet" href="${media('themes.css')}">
<title>Live Design View</title>
</head>
<body class="ld-canvas" data-ld-theme="${uiTheme()}">
<script nonce="${n}" src="${media('theme.js')}"></script>
<script nonce="${n}" src="${media('tooltip.js')}"></script>
<div id="app">
  <div id="toolbar">
    <div class="seg" id="modeSeg" role="group" aria-label="View mode">
      <button data-mode="code" title="Code view"><i class="codicon codicon-code"></i>Code</button>
      <button data-mode="split" title="Split view"><i class="codicon codicon-split-horizontal"></i>Split</button>
      <button data-mode="live" title="Design view"><i class="codicon codicon-eye"></i>Design</button>
    </div>
    <span id="status" role="status" aria-live="polite"></span>
    <button id="toggleBox" class="icon-btn" title="Box model\nShow margin, border, padding, and flex / grid gaps on the selection" aria-pressed="true"><i class="codicon codicon-layers"></i></button>
    <button id="toggleAllLayouts" class="icon-btn" title="Show all grid &amp; flex\nOutline every grid (tracks and gaps) and flex container (items) on the page, each in its own colour. Click a badge to select it." aria-pressed="false"><i class="codicon codicon-table"></i></button>
    <button id="toggleAids" class="icon-btn on" title="Outlines: show empty elements so you can drop into them" aria-pressed="true"><i class="codicon codicon-symbol-ruler"></i></button>
    <button id="showProps" class="icon-btn" title="Show the Attributes panel"><i class="codicon codicon-layout-panel"></i></button>
    <button id="toggleInsertBar" class="icon-btn" title="Show/hide the Elements bar" aria-pressed="true"><i class="codicon codicon-layout-panel-off"></i></button>
    <button id="toggleInteract" class="icon-btn" title="Interact with the page (links, scripts) instead of selecting" aria-pressed="false"><i class="codicon codicon-play"></i></button>
    <button id="runAudit" class="icon-btn" title="Audit this page (like Lighthouse)\nAccessibility (axe-core, WCAG 2.2 AA), SEO, Best Practices and Forms — results in the Problems panel and on the page"><i class="codicon codicon-checklist"></i></button>
    <button id="chooseTheme" class="icon-btn" title="Choose UI theme (Modern, Canvas, Graphite, VS Code)"><i class="codicon codicon-symbol-color"></i></button>
    <button id="showPanels" class="icon-btn" title="Workspace layout: Styles and Structure on the right, Attributes at the bottom"><i class="codicon codicon-layout"></i></button>
  </div>
  <div id="insertBar" hidden>
    <div id="ibTabs" role="tablist" aria-label="Element categories"></div>
    <div id="ibSub" role="tablist" aria-label="Component groups" hidden></div>
    <div id="ibItems" role="toolbar" aria-label="Elements"></div>
  </div>
  <div id="levelMenu" hidden role="menu" aria-label="Heading level"></div>
  <div id="auditBar" hidden role="status" aria-label="Audit results">
    <span id="auditScores"></span>
    <span id="auditCount"></span>
    <span id="auditNote"></span>
    <span class="audit-actions">
      <button id="auditRerun" class="icon-btn" title="Run the audit again"><i class="codicon codicon-refresh"></i></button>
      <button id="auditLighthouse" class="icon-btn" title="Full Lighthouse report (runs Lighthouse with Chrome in a terminal on the saved file)"><i class="codicon codicon-pulse"></i></button>
      <button id="auditClose" class="icon-btn" title="Hide audit results"><i class="codicon codicon-close"></i></button>
    </span>
  </div>
  <div id="warning" hidden><i class="codicon codicon-warning"></i><span id="warningText"></span><button id="warningClose" class="icon-btn" title="Dismiss"><i class="codicon codicon-close"></i></button></div>
  <div id="canvas">
    <div id="frames"></div>
    <div id="overlay" aria-hidden="true">
      <div id="hoverBox" class="box hover" hidden></div>
      <div id="selBox" class="box sel" hidden></div>
      <div id="hoverLabel" hidden></div>
      <div id="dropLine" hidden></div>
      <div id="dropBox" hidden></div>
    </div>
    <div id="auditMarks"></div>
    <div id="hud" hidden>
      <span id="hudTag"></span><span id="hudNames"></span><button id="hudAdd" title="Add a class or ID &#10;Type .name or #name — Enter to apply">+</button>
      <span id="hudActions" role="toolbar" aria-label="Element actions">
        <button data-op="cut" title="Cut  (⌘X)" aria-label="Cut element"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><circle cx="4.5" cy="11.5" r="2"/><circle cx="11.5" cy="11.5" r="2"/><path d="M5.8 10 12 2.5M10.2 10 4 2.5"/></svg></button>
        <button data-op="copy" title="Copy  (⌘C)" aria-label="Copy element"><i class="codicon codicon-copy"></i></button>
        <button data-op="paste" title="Paste after  (⌘V)\nShift-click: paste inside  (⇧⌘V)" aria-label="Paste after element"><i class="codicon codicon-clippy"></i></button>
        <button data-op="duplicate" title="Duplicate  (⌘D)" aria-label="Duplicate element"><i class="codicon codicon-files"></i></button>
        <button data-op="delete" title="Delete  (⌫)" aria-label="Delete element"><i class="codicon codicon-trash"></i></button>
      </span>
    </div>
    <div id="hudRule" hidden role="dialog" aria-label="Create CSS rule">
      <div class="hr-title"><i class="codicon codicon-symbol-color"></i><span id="hudRuleText"></span></div>
      <label class="hr-row">In <select id="hudRuleSource" aria-label="Stylesheet for the new rule"></select></label>
      <div class="hr-row hr-actions">
        <label class="hr-always"><input type="checkbox" id="hudRuleAlways"> Always create</label>
        <button id="hudRuleSkip" class="hr-btn">Skip</button>
        <button id="hudRuleCreate" class="hr-btn primary">Create</button>
      </div>
    </div>
    <div id="hudEdit" hidden>
      <input id="hudInput" placeholder=".class or #id" spellcheck="false" autocomplete="off" aria-label="Class (.name) or ID (#name)" aria-autocomplete="list" aria-controls="hudHints">
      <div id="hudHints" role="listbox" aria-label="Available classes and IDs"></div>
    </div>
    <div id="emptyState" hidden>
      <p><strong>This page is empty.</strong></p>
      <p>Click an item in the Elements bar to add it, or start from a standard page.</p>
      <button id="scaffoldBtn" class="primary"><i class="codicon codicon-file-code"></i> Add HTML5 page structure</button>
    </div>
    <div id="dragShield" hidden></div>
    <div id="placeMenu" hidden role="menu" aria-label="Insert position"></div>
  </div>
  <nav id="crumbs" aria-label="Element ancestry"></nav>
</div>
<script nonce="${n}" src="${media('webview.js')}"></script>
<script nonce="${n}" src="${media('puppet.js')}"></script>
</body>
</html>`;
  }
}

function selKey(s: vscode.Selection) {
  return `${s.anchor.line}:${s.anchor.character}-${s.active.line}:${s.active.character}`;
}

export function makeNonce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export { VIEW_TYPE };
