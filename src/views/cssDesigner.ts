import * as vscode from 'vscode';
import * as path from 'path';
import type { Hub } from '../hub';
import type { LiveSession } from '../liveEditorProvider';
import { makeNonce } from '../liveEditorProvider';
import { type LdNode, label as nodeLabel } from '../htmlModel';
import { appendToHead, type TextEdit } from '../edits';
import {
  type CssModel,
  type CssRule,
  type Specificity,
  addMedia,
  addRule,
  compareSpecificity,
  matchableSelector,
  parseCss,
  removeDeclaration,
  removeMedia,
  removeRule,
  setDeclaration,
  setDeclarations,
  moveRule,
  compressTracks,
  editTracks,
  expandTracks,
  parseInlineStyle,
  specificity,
  toggleDeclaration,
} from '../css/cssModel';
import { linkedStylesheets } from '../css/stylesheets';
import { trackThemedWebview, uiTheme } from '../theme';

/** A stylesheet the page uses: a linked local .css file, or a <style> block in the page. */
interface Source {
  key: string;
  kind: 'file' | 'style';
  label: string;
  node: LdNode;
  uri?: vscode.Uri;
  /** page offset of the <style> content (style sources) */
  base: number;
  css: CssModel;
  missing?: boolean;
}

interface UndoEntry {
  uri: vscode.Uri;
  version: number;
  edits: TextEdit[];
  save: boolean;
}

/** Properties whose computed values the designer shows as hints (and in "Computed"). */
const COMPUTED_PROPS = [
  'width', 'height', 'display', 'box-sizing', 'position', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'top', 'right', 'bottom', 'left', 'float', 'overflow-x',
  'overflow-y', 'z-index', 'opacity', 'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height',
  'text-align', 'text-decoration-line', 'text-transform', 'letter-spacing', 'border-top-width', 'border-top-style',
  'border-top-color', 'border-radius', 'background-color', 'background-image', 'box-shadow', 'flex-direction',
  'justify-content', 'align-items', 'gap', 'flex-wrap', 'align-content', 'row-gap', 'column-gap',
  'grid-template-columns', 'grid-template-rows', 'grid-auto-flow', 'justify-items', 'flex-grow', 'flex-shrink', 'flex-basis', 'align-self', 'order',
];

const ALL = '*';

/**
 * Styles panel: Stylesheets, Rules (with a media filter) and Style, in Page mode
 * (every rule) or Current mode (rules that apply to the selected element, with overridden
 * properties struck through). Every change is a minimal edit to the stylesheet text.
 */
export class CssDesignerProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly id = 'liveDesign.css';
  view: vscode.WebviewView | undefined;
  private mode: 'all' | 'current' = 'all';
  private sourceKey = ALL;
  /** '' = global (no @media), undefined = all media */
  private mediaKey: string | undefined;
  private ruleKey: string | undefined;
  private showSet = true;
  private sources: Source[] = [];
  private undoStack: UndoEntry[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  /** Last state posted (used by tests). */
  lastState: any;
  private stateWaiters: ((s: any) => void)[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly hub: Hub,
    private readonly memento: vscode.Memento,
  ) {
    this.mode = memento.get('liveDesign.cssMode', 'all');
    this.showSet = memento.get('liveDesign.cssShowSet', true);
    this.disposables.push(
      hub.onDidChangeActive(() => this.refresh(0)),
      hub.onDidChangeSelection(() => this.refresh(60)),
      hub.onDidChangeModel(() => this.refresh(150)),
      hub.onDidRender(() => this.refresh(30)),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.contentChanges.length && this.sources.some((s) => s.uri?.toString() === e.document.uri.toString())) this.refresh(80);
      }),
    );
  }

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')] };
    trackThemedWebview(view.webview);
    const media = (f: string) => view.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', f));
    const nonce = makeNonce();
    view.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${view.webview.cspSource} 'unsafe-inline'; img-src data:; font-src ${view.webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${media('codicons/codicon.css')}">
<link rel="stylesheet" href="${media('panels.css')}">
<link rel="stylesheet" href="${media('cssDesigner.css')}">
<link rel="stylesheet" href="${media('themes.css')}">
</head>
<body data-ld-theme="${uiTheme()}">
<script nonce="${nonce}" src="${media('theme.js')}"></script>
<script nonce="${nonce}" src="${media('tooltip.js')}"></script>
<div id="root"></div>
<script nonce="${nonce}" src="${media('sizing.js')}"></script>
<script nonce="${nonce}" src="${media('units.js')}"></script>
<script nonce="${nonce}" src="${media('cssDesigner.js')}"></script>
<script nonce="${nonce}" src="${media('puppet.js')}"></script>
</body>
</html>`;
    view.webview.onDidReceiveMessage((m) => void this.onMessage(m));
    view.onDidChangeVisibility(() => view.visible && this.refresh(0));
  }

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  private async loadSources(s: LiveSession): Promise<Source[]> {
    const out: Source[] = [];
    const linked = linkedStylesheets(s.model, s.document.uri);
    for (const n of s.model.nodes) {
      if (!n.located) continue;
      const link = linked.find((l) => l.node === n);
      if (link) {
        let text = '';
        let missing = false;
        try {
          text = (await vscode.workspace.openTextDocument(link.uri)).getText();
        } catch {
          missing = true;
        }
        out.push({ key: 'file:' + link.uri.toString(), kind: 'file', label: link.href, node: n, uri: link.uri, base: 0, css: parseCss(text), missing });
      } else if (n.tag === 'style' && n.etStart !== undefined) {
        const count = out.filter((x) => x.kind === 'style').length;
        out.push({
          key: 'style:' + n.path.join('.'),
          kind: 'style',
          label: count ? `<style> ${count + 1}` : '<style>',
          node: n,
          base: n.stEnd,
          css: parseCss(s.model.text.slice(n.stEnd, n.etStart)),
        });
      }
    }
    return out;
  }

  /** Stable key for a rule across edits: source + media + selector + occurrence. */
  private ruleKeyOf(src: Source, r: CssRule): string {
    const media = r.media !== undefined ? src.css.media[r.media].params : '';
    const same = src.css.rules.filter((x) => x.selector === r.selector && (x.media !== undefined ? src.css.media[x.media].params : '') === media);
    return `${src.key}|${media}|${r.selector}|${same.indexOf(r)}`;
  }

  private findRule(key: string | undefined): { src: Source; rule: CssRule } | undefined {
    if (!key) return undefined;
    for (const src of this.sources) for (const rule of src.css.rules) if (this.ruleKeyOf(src, rule) === key) return { src, rule };
    return undefined;
  }

  refresh(ms = 60) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.update(), ms);
  }

  private async update() {
    const s = this.hub.active;
    if (!s) {
      this.sources = [];
      return this.post({ type: 'state', hasSession: false });
    }
    s.reparse();
    this.sources = await this.loadSources(s);
    const selected = s.selected;
    const viewId = s.viewId(s.selectedId);

    // Every rule with its source, for matching.
    const all: { src: Source; rule: CssRule; key: string; media: string }[] = [];
    for (const src of this.sources) {
      for (const rule of src.css.rules) {
        all.push({ src, rule, key: this.ruleKeyOf(src, rule), media: rule.media !== undefined ? src.css.media[rule.media].params : '' });
      }
    }

    // Ask the canvas which rules apply to the selected element (and for its computed style).
    let match: { found: boolean; matches?: { part: number; state: boolean; media: boolean }[]; computed?: Record<string, string>; parentDisplay?: string; parentDirection?: string; parentAlignItems?: string } | undefined;
    if (viewId !== undefined && selected?.located) {
      match = await s.query('cssMatch', {
        id: viewId,
        rules: all.map((x) => ({ media: x.media || null, parts: x.rule.parts.map((p) => {
          const m = matchableSelector(p);
          return { sel: m.selector, state: m.state };
        }) })),
        props: COMPUTED_PROPS,
      });
    }
    // The canvas can't answer while a re-render is in flight. In Current mode that would wipe the
    // rule list and the selected rule, so skip this refresh — another follows when the render lands.
    if (this.mode === 'current' && selected?.located && !match?.found && this.lastState?.hasSession) return;
    const matched = new Map<string, { spec: Specificity; state: boolean; order: number }>();
    if (match?.found && match.matches) {
      all.forEach((x, i) => {
        const r = match!.matches![i];
        if (r && r.part >= 0 && r.media) matched.set(x.key, { spec: specificity(x.rule.parts[r.part]), state: r.state, order: i });
      });
    }

    // Cascade among matching (non-state) rules: lowest priority first.
    const cascade = all
      .filter((x) => matched.has(x.key) && !matched.get(x.key)!.state)
      .sort((a, b) => {
        const ma = matched.get(a.key)!;
        const mb = matched.get(b.key)!;
        return compareSpecificity(ma.spec, mb.spec) || ma.order - mb.order;
      });
    const overridden = new Map<string, Set<string>>();
    const winner = new Map<string, { key: string; important: boolean; idx: number }>();
    cascade.forEach((x, idx) => {
      for (const d of x.rule.decls) {
        if (d.disabled) continue;
        const w = winner.get(d.prop);
        if (!w || d.important || !w.important) {
          if (w) (overridden.get(w.key) ?? overridden.set(w.key, new Set()).get(w.key)!).add(d.prop);
          winner.set(d.prop, { key: x.key, important: d.important, idx });
        } else (overridden.get(x.key) ?? overridden.set(x.key, new Set()).get(x.key)!).add(d.prop);
      }
    });

    // Panes ------------------------------------------------------------------
    if (this.sourceKey !== ALL && !this.sources.some((x) => x.key === this.sourceKey)) this.sourceKey = ALL;
    const inSource = (x: { src: Source }) => this.sourceKey === ALL || x.src.key === this.sourceKey;
    const mediaList: { key: string; label: string; count: number }[] = [{ key: '', label: 'Base styles', count: 0 }];
    for (const x of all.filter(inSource)) {
      let m = mediaList.find((e) => e.key === x.media);
      if (!m) mediaList.push((m = { key: x.media, label: x.media, count: 0 }));
      m.count++;
    }
    // Media blocks with no rules yet still show up.
    for (const src of this.sources.filter((x) => this.sourceKey === ALL || x.key === this.sourceKey)) {
      for (const m of src.css.media) if (!mediaList.some((e) => e.key === m.params)) mediaList.push({ key: m.params, label: m.params, count: 0 });
    }
    if (this.mediaKey !== undefined && !mediaList.some((m) => m.key === this.mediaKey)) this.mediaKey = undefined;

    let rules: { key: string; selector: string; where: string; spec: string; state?: boolean; matched?: boolean }[];
    if (this.mode === 'current') {
      const listed = all
        .filter((x) => matched.has(x.key))
        .sort((a, b) => {
          const ma = matched.get(a.key)!;
          const mb = matched.get(b.key)!;
          return Number(ma.state) - Number(mb.state) || compareSpecificity(mb.spec, ma.spec) || mb.order - ma.order;
        });
      rules = listed.map((x) => ({
        key: x.key,
        selector: x.rule.selector,
        where: [x.src.label, x.media].filter(Boolean).join(' • '),
        spec: matched.get(x.key)!.spec.join(','),
        state: matched.get(x.key)!.state,
        matched: true,
      }));
      if (selected) rules.unshift({ key: 'computed', selector: 'Computed', where: nodeLabel(selected), spec: '' });
    } else {
      rules = all
        .filter(inSource)
        .filter((x) => this.mediaKey === undefined || x.media === this.mediaKey)
        .map((x) => ({
          key: x.key,
          selector: x.rule.selector,
          where: [this.sourceKey === ALL ? x.src.label : '', this.mediaKey === undefined ? x.media : ''].filter(Boolean).join(' • '),
          spec: specificity(x.rule.parts[0] ?? '').join(','),
          matched: matched.has(x.key),
        }));
    }
    if (this.ruleKey && this.ruleKey !== 'computed' && !rules.some((r) => r.key === this.ruleKey)) this.ruleKey = undefined;
    if (this.mode === 'current' && !this.ruleKey && rules.length) this.ruleKey = rules.find((r) => r.key !== 'computed')?.key ?? rules[0].key;

    const hit = this.findRule(this.ruleKey);
    const decls =
      hit?.rule.decls.map((d) => ({
        prop: d.prop,
        value: d.value,
        important: d.important,
        disabled: d.disabled,
        overridden: !d.disabled && (overridden.get(this.ruleKey!)?.has(d.prop) ?? false),
      })) ?? [];

    this.post({
      type: 'state',
      hasSession: true,
      file: vscode.workspace.asRelativePath(s.document.uri),
      mode: this.mode,
      showSet: this.showSet,
      element: selected?.located ? nodeLabel(selected) : null,
      sources: [
        { key: ALL, label: 'All stylesheets', kind: 'all', count: all.length },
        ...this.sources.map((x) => ({ key: x.key, label: x.label, kind: x.kind, count: x.css.rules.length, missing: x.missing, error: x.css.error })),
      ],
      source: this.sourceKey,
      media: mediaList,
      mediaKey: this.mediaKey ?? null,
      rules,
      rule: this.ruleKey ?? null,
      ruleSelector: hit?.rule.selector ?? (this.ruleKey === 'computed' ? 'Computed' : null),
      ruleWhere: hit ? [hit.src.label, hit.rule.media !== undefined ? hit.src.css.media[hit.rule.media].params : ''].filter(Boolean).join(' • ') : '',
      decls,
      computed: match?.computed ?? null,
      parentDisplay: match?.parentDisplay ?? null,
      parentDirection: match?.parentDirection ?? null,
      parentAlignItems: match?.parentAlignItems ?? null,
      suggestions: selected?.located ? suggestSelectors(s, selected) : [],
      canUndo: this.undoStack.length > 0,
    });
  }

  private post(state: any) {
    this.lastState = state;
    this.stateWaiters.splice(0).forEach((w) => w(state));
    void this.view?.webview.postMessage(state);
  }

  private groupWaiters: ((r: any) => void)[] = [];
  /** Test hook: click a property group header (accordion) and report the open groups. */
  testGroups(click?: string, alt = false): Promise<{ open: string[]; rows: { id: string; rows: number }[] }> {
    return new Promise((resolve) => {
      this.groupWaiters.push(resolve);
      void this.view?.webview.postMessage({ type: 'testGroups', click, alt });
    });
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

  /** Test hook: click a margin/padding link toggle ("padding:all" | "padding:x" | "padding:y"). */
  testBoxLink(link: string) {
    void this.view?.webview.postMessage({ type: 'testBoxLink', link });
  }

  /** Test hook: type a value into a unit field, or pick a unit in its dropdown. */
  testUnit(prop: string, value?: string, unit?: string) {
    void this.view?.webview.postMessage({ type: 'testUnit', prop, value, unit });
  }

  /** Test hook: drag one selector row onto another in the panel UI. */
  testDragRule(from: string, to: string, after: boolean) {
    void this.view?.webview.postMessage({ type: 'testDragRule', from, to, after });
  }

  /** Test hook: pick a W/H sizing mode in the panel UI. */
  testSize(prop: 'width' | 'height', mode: string, value?: string) {
    void this.view?.webview.postMessage({ type: 'testSize', prop, mode, value });
  }

  /** Test hook: resolves with the next state posted to the panel. */
  nextState(): Promise<any> {
    return new Promise((r) => this.stateWaiters.push(r));
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async onMessage(m: any) {
    const s = this.hub.active;
    switch (m.type) {
      case 'ready':
        return this.refresh(0);
      case 'mode':
        this.mode = m.mode === 'current' ? 'current' : 'all';
        void this.memento.update('liveDesign.cssMode', this.mode);
        this.ruleKey = undefined;
        return this.refresh(0);
      case 'showSet':
        this.showSet = !!m.value;
        void this.memento.update('liveDesign.cssShowSet', this.showSet);
        return this.refresh(0);
      case 'selectSource':
        this.sourceKey = m.key;
        this.mediaKey = undefined;
        this.ruleKey = undefined;
        return this.refresh(0);
      case 'selectMedia':
        this.mediaKey = m.key === null ? undefined : m.key;
        this.ruleKey = undefined;
        return this.refresh(0);
      case 'selectRule': {
        const again = m.key === this.ruleKey;
        this.ruleKey = m.key;
        // All mode: show the rule's element on the page (click the rule again for the next match).
        if (this.mode === 'all' && m.key !== 'computed') {
          const hit = this.findRule(m.key);
          const sels = hit ? hit.rule.parts.map((p) => matchableSelector(p).selector).filter((x) => x !== '*') : [];
          const s = this.hub.active;
          if (s && sels.length) await s.selectBySelector(sels, again);
        }
        return this.refresh(0);
      }
      case 'setProp':
        return this.editRule(m.rule ?? this.ruleKey, (css, r) => setDeclaration(css, r.id, m.prop, m.value));
      case 'puppetDone':
        this.puppetWaiters.get(m.id)?.();
        this.puppetWaiters.delete(m.id);
        return;
      case 'testGroupsResult':
        this.groupWaiters.splice(0).forEach((w) => w(m));
        return;
      case 'setProps':
        // Quick Layout: several properties in one edit (one undo step).
        return this.editRule(m.rule ?? this.ruleKey, (css, r) => setDeclarations(css, r.id, m.props ?? {}));
      case 'removeProp':
        return this.editRule(m.rule ?? this.ruleKey, (css, r) => removeDeclaration(css, r.id, m.prop));
      case 'toggleProp':
        return this.editRule(m.rule ?? this.ruleKey, (css, r) => toggleDeclaration(css, r.id, m.prop, !!m.enable));
      case 'addRule':
        return this.addRule(String(m.selector ?? ''));
      case 'removeRule':
        return this.editRule(m.key ?? this.ruleKey, (css, r) => removeRule(css, r.id), true);
      case 'open':
        return vscode.commands.executeCommand(m.mode === 'split' ? 'liveDesign.splitView' : 'liveDesign.liveView');
      case 'moveRule':
        return this.moveRuleTo(m.key, m.targetKey, m.position === 'after' ? 'after' : 'before');
      case 'addMedia':
        return this.addMedia(String(m.condition ?? ''));
      case 'removeMedia':
        return this.removeMedia();
      case 'addSource':
        if (s) return this.addSource(s, m.kind);
        return;
      case 'removeSource':
        if (s) return this.removeSource(s, m.key ?? this.sourceKey);
        return;
      case 'gotoRule':
        return this.gotoRule(m.key ?? this.ruleKey);
      case 'undo':
        return this.undo();
    }
  }

  private notify(text: string) {
    void this.view?.webview.postMessage({ type: 'message', text });
  }

  /** Applies edits (in stylesheet coordinates) to a source, recording an undo entry. */
  private async applyToSource(src: Source, edits: TextEdit[]): Promise<boolean> {
    const s = this.hub.active;
    if (!edits.length) return false;
    if (src.kind === 'style') {
      if (!s) return false;
      const shifted = edits.map((e) => ({ start: e.start + src.base, end: e.end + src.base, text: e.text }));
      return this.applyToDocument(s.document, shifted, false);
    }
    const doc = await vscode.workspace.openTextDocument(src.uri!);
    const autoSave = vscode.workspace.getConfiguration('liveDesign').get<boolean>('css.autoSave', true);
    return this.applyToDocument(doc, edits, autoSave && !doc.isDirty);
  }

  private async applyToDocument(doc: vscode.TextDocument, edits: TextEdit[], save: boolean): Promise<boolean> {
    const before = doc.getText();
    const we = new vscode.WorkspaceEdit();
    for (const e of edits) we.replace(doc.uri, new vscode.Range(doc.positionAt(e.start), doc.positionAt(e.end)), e.text);
    if (!(await vscode.workspace.applyEdit(we))) {
      this.notify('The CSS edit could not be applied.');
      return false;
    }
    // Inverse edits, in the new text's coordinates, for the panel's own Undo.
    let delta = 0;
    const inverse = [...edits]
      .sort((a, b) => a.start - b.start)
      .map((e) => {
        const start = e.start + delta;
        delta += e.text.length - (e.end - e.start);
        return { start, end: start + e.text.length, text: before.slice(e.start, e.end) };
      });
    this.undoStack.push({ uri: doc.uri, version: doc.version, edits: inverse, save });
    if (this.undoStack.length > 100) this.undoStack.shift();
    if (save) await doc.save();
    this.refresh(0);
    return true;
  }

  private async undo() {
    const u = this.undoStack.pop();
    if (!u) return;
    const doc = await vscode.workspace.openTextDocument(u.uri);
    if (doc.version !== u.version && !(u.save && doc.version === u.version + 1)) {
      // The file changed since (e.g. typed in the editor): fall back to the editor's own undo.
      this.undoStack = [];
      this.notify('The stylesheet changed since that edit — use Undo in its editor instead.');
      return this.refresh(0);
    }
    const we = new vscode.WorkspaceEdit();
    for (const e of u.edits) we.replace(doc.uri, new vscode.Range(doc.positionAt(e.start), doc.positionAt(e.end)), e.text);
    await vscode.workspace.applyEdit(we);
    if (u.save) await doc.save();
    this.refresh(0);
  }

  private async editRule(key: string | undefined, fn: (css: CssModel, r: CssRule) => TextEdit[], clearSelection = false) {
    const s = this.hub.active;
    if (!s) return;
    this.sources = await this.loadSources(s);
    const hit = this.findRule(key);
    if (!hit) return this.notify('Select a selector first.');
    const edits = fn(hit.src.css, hit.rule);
    if (clearSelection) this.ruleKey = undefined;
    await this.applyToSource(hit.src, edits);
  }

  /** Source to add rules/media to: the selected one, else the first linked file, else the first <style>. */
  private targetSource(): Source | undefined {
    return (
      this.sources.find((x) => x.key === this.sourceKey) ??
      this.sources.find((x) => x.kind === 'file' && !x.missing) ??
      this.sources[0]
    );
  }

  private async addRule(selector: string) {
    const s = this.hub.active;
    if (!s) return;
    selector = selector.trim();
    if (!selector) return;
    this.sources = await this.loadSources(s);
    const src = this.targetSource();
    if (!src) return this.notify('Add a stylesheet first (+ in Stylesheets).');
    if (src.css.error) return this.notify(`Can't edit ${src.label}: ${src.css.error}`);
    const mediaId = this.mediaKey ? src.css.media.find((m) => m.params === this.mediaKey)?.id : undefined;
    const { edits } = addRule(src.css, selector, mediaId);
    if (await this.applyToSource(src, edits)) {
      const media = mediaId !== undefined ? src.css.media[mediaId].params : '';
      const n = src.css.rules.filter((r) => r.selector === selector && (r.media !== undefined ? src.css.media[r.media].params : '') === media).length;
      this.ruleKey = `${src.key}|${media}|${selector}|${n}`;
      if (this.mode === 'all' && this.sourceKey !== ALL && this.sourceKey !== src.key) this.sourceKey = src.key;
      this.refresh(0);
    }
  }

  /** Sources a new rule can be created in (for the Live chip's "create rule" prompt). */
  async ruleSources(): Promise<{ key: string; label: string }[]> {
    const s = this.hub.active;
    if (!s) return [];
    this.sources = await this.loadSources(s);
    return this.sources.filter((x) => !x.missing && !x.css.error).map((x) => ({ key: x.key, label: x.label }));
  }

  /**
   * The selection chip: a class / ID with no rule gets an empty rule in the chosen
   * source (in the selected @media, if any). The last new rule is selected in the Styles panel.
   */
  async createRules(selectors: string[], sourceKey: string): Promise<number> {
    const s = this.hub.active;
    if (!s || !selectors.length) return 0;
    if (sourceKey === 'page:new') {
      await this.addSource(s, 'page');
      this.sources = await this.loadSources(s);
      const styles = this.sources.filter((x) => x.kind === 'style');
      sourceKey = styles[styles.length - 1]?.key ?? '';
    }
    let made = 0;
    let lastKey: string | undefined;
    for (const sel of selectors) {
      this.sources = await this.loadSources(s);
      const src = this.sources.find((x) => x.key === sourceKey);
      if (!src || src.css.error) break;
      const mediaId = this.mediaKey ? src.css.media.find((m) => m.params === this.mediaKey)?.id : undefined;
      const media = mediaId !== undefined ? src.css.media[mediaId].params : '';
      if (src.css.rules.some((r) => r.selector === sel && (r.media !== undefined ? src.css.media[r.media].params : '') === media)) continue;
      if (!(await this.applyToSource(src, addRule(src.css, sel, mediaId).edits))) break;
      made++;
      lastKey = `${src.key}|${media}|${sel}|0`;
      if (this.sourceKey !== ALL && this.sourceKey !== src.key) this.sourceKey = src.key;
    }
    if (lastKey) {
      this.mode = 'all';
      this.ruleKey = lastKey;
      this.view?.show(true);
      this.notify(`Created ${made === 1 ? selectors[selectors.length - 1] : made + ' rules'} — style it in the Styles panel.`);
    }
    this.refresh(0);
    return made;
  }

  /** Reorders a rule within its stylesheet (drag in the Selectors list, or Alt+↑/↓). */
  private async moveRuleTo(key: string, targetKey: string, position: 'before' | 'after') {
    const s = this.hub.active;
    if (!s || !key || !targetKey || key === targetKey) return;
    this.sources = await this.loadSources(s);
    const a = this.findRule(key);
    const b = this.findRule(targetKey);
    if (!a || !b) return;
    if (a.src.key !== b.src.key) return this.notify('Rules can only be reordered within the same stylesheet.');
    const ruleText = a.src.css.text.slice(a.rule.open, a.rule.end);
    const selector = a.rule.selector;
    if (!(await this.applyToSource(a.src, moveRule(a.src.css, a.rule.id, b.rule.id, position)))) return;
    // Keep the moved rule selected (its key may change: media / occurrence).
    this.sources = await this.loadSources(s);
    const src = this.sources.find((x) => x.key === a.src.key);
    const moved = src?.css.rules.find((r) => r.selector === selector && src.css.text.slice(r.open, r.end).replace(/\s+/g, ' ') === ruleText.replace(/\s+/g, ' '));
    if (src && moved) this.ruleKey = this.ruleKeyOf(src, moved);
    this.refresh(0);
  }

  private async addMedia(condition: string) {
    const s = this.hub.active;
    if (!s || !condition.trim()) return;
    this.sources = await this.loadSources(s);
    const src = this.targetSource();
    if (!src) return this.notify('Add a stylesheet first (+ in Stylesheets).');
    const cond = /^\(|^(screen|print|all|only|not)\b/i.test(condition.trim()) ? condition.trim() : `(${condition.trim()})`;
    if (await this.applyToSource(src, addMedia(src.css, cond))) {
      this.mediaKey = cond;
      this.refresh(0);
    }
  }

  private async removeMedia() {
    const s = this.hub.active;
    if (!s || !this.mediaKey) return this.notify('Select a media query to remove.');
    this.sources = await this.loadSources(s);
    const src = this.targetSource();
    const m = src?.css.media.find((x) => x.params === this.mediaKey);
    if (!src || !m) return;
    const ok = await vscode.window.showWarningMessage(`Remove @media ${m.params} and all of its rules from ${src.label}?`, { modal: true }, 'Remove');
    if (ok !== 'Remove') return;
    this.mediaKey = undefined;
    await this.applyToSource(src, removeMedia(src.css, m.id));
  }

  private async addSource(s: LiveSession, kind: 'new' | 'attach' | 'page') {
    const pageDir = vscode.Uri.joinPath(s.document.uri, '..');
    const relTo = (uri: vscode.Uri) => path.posix.relative(pageDir.path, uri.path) || path.posix.basename(uri.path);
    if (kind === 'page') {
      await s.editPage((model) => ({ ok: true, edits: appendToHead(model, ['<style>', '</style>']) }));
      return this.refresh(0);
    }
    let uri: vscode.Uri | undefined;
    if (kind === 'new') {
      const name = await vscode.window.showInputBox({
        title: 'Create a New CSS File',
        prompt: 'Path relative to this page',
        value: 'css/styles.css',
        validateInput: (v) => (/\.css$/i.test(v.trim()) ? undefined : 'Use a .css file name'),
      });
      if (!name) return;
      uri = vscode.Uri.joinPath(pageDir, name.trim());
      let exists = true;
      try {
        await vscode.workspace.fs.stat(uri);
      } catch {
        exists = false;
      }
      if (!exists) await vscode.workspace.fs.writeFile(uri, new Uint8Array());
    } else {
      const picked = await vscode.window.showOpenDialog({
        title: 'Attach Existing CSS File',
        defaultUri: pageDir,
        canSelectMany: false,
        filters: { CSS: ['css'] },
      });
      uri = picked?.[0];
      if (!uri) return;
    }
    const href = relTo(uri);
    if (linkedStylesheets(s.model, s.document.uri).some((l) => l.uri.toString() === uri!.toString())) {
      return this.notify(`${href} is already linked.`);
    }
    await s.editPage((model) => ({ ok: true, edits: appendToHead(model, [`<link rel="stylesheet" href="${href}">`]) }));
    this.sourceKey = 'file:' + uri.toString();
    this.refresh(0);
  }

  private async removeSource(s: LiveSession, key: string) {
    const src = this.sources.find((x) => x.key === key);
    if (!src) return this.notify('Select a source to remove.');
    const what = src.kind === 'file' ? `the link to ${src.label} (the file itself is kept)` : 'this <style> block and its rules';
    const ok = await vscode.window.showWarningMessage(`Remove ${what}?`, { modal: true }, 'Remove');
    if (ok !== 'Remove') return;
    this.sourceKey = ALL;
    await s.deleteElement(src.node.id);
    this.refresh(0);
  }

  private async gotoRule(key: string | undefined) {
    const hit = this.findRule(key);
    const s = this.hub.active;
    if (!hit || !s) return;
    const doc = hit.src.kind === 'file' ? await vscode.workspace.openTextDocument(hit.src.uri!) : s.document;
    const start = doc.positionAt(hit.rule.start + hit.src.base);
    const end = doc.positionAt(hit.rule.end + hit.src.base);
    const editor = await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.One });
    editor.selection = new vscode.Selection(start, end);
    editor.revealRange(new vscode.Range(start, end), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  // ---------------------------------------------------------------------------
  // On-canvas editing (gap / margin / padding handles, grid tracks)
  // ---------------------------------------------------------------------------

  /**
   * Where an on-canvas edit for the selected element is written: the rule selected in the CSS
   * Designer if it applies to the element, else the element's own rule (one that targets it by
   * id or class, most specific first), else its inline style.
   */
  async resolveTarget(): Promise<
    | { kind: 'rule'; key: string; label: string; decls: Record<string, string> }
    | { kind: 'inline'; label: string; decls: Record<string, string> }
    | undefined
  > {
    const s = this.hub.active;
    const n = s?.selected;
    if (!s || !n?.located) return undefined;
    const inline = { kind: 'inline' as const, label: 'inline style', decls: Object.fromEntries(parseInlineStyle(n.attrs.find((a) => a.name === 'style')?.value ?? '')) };
    const viewId = s.viewId(s.selectedId);
    if (viewId === undefined) return inline;
    this.sources = await this.loadSources(s);
    const all: { src: Source; rule: CssRule; key: string; media: string }[] = [];
    for (const src of this.sources) {
      if (src.missing || src.css.error) continue;
      for (const rule of src.css.rules) all.push({ src, rule, key: this.ruleKeyOf(src, rule), media: rule.media !== undefined ? src.css.media[rule.media].params : '' });
    }
    const match = await s.query<{ found: boolean; matches?: { part: number; state: boolean; media: boolean }[] }>('cssMatch', {
      id: viewId,
      rules: all.map((x) => ({ media: x.media || null, parts: x.rule.parts.map((p) => ({ sel: matchableSelector(p).selector, state: matchableSelector(p).state })) })),
      props: [],
    });
    if (!match?.found) return inline;
    const id = n.attrs.find((a) => a.name === 'id')?.value;
    const classes = n.attrs.find((a) => a.name === 'class')?.value.split(/\s+/).filter(Boolean) ?? [];
    const own = (part: string) =>
      (!!id && part.includes('#' + id)) || classes.some((c) => new RegExp(`\\.${c.replace(/[-]/g, '\\-')}(?![-\\w])`).test(part));
    const cands = all
      .map((x, i) => ({ x, r: match.matches![i] }))
      .filter(({ r }) => r && r.part >= 0 && !r.state && r.media)
      .map(({ x, r }) => ({ x, part: x.rule.parts[r.part], spec: specificity(x.rule.parts[r.part]) }))
      .sort((a, b) => compareSpecificity(b.spec, a.spec) || b.x.rule.order - a.x.rule.order);
    const pick = cands.find((c) => c.x.key === this.ruleKey) ?? cands.find((c) => own(c.part));
    if (!pick) return inline;
    return {
      kind: 'rule',
      key: pick.x.key,
      label: `${pick.x.rule.selector} (${pick.x.src.label})`,
      decls: Object.fromEntries(pick.x.rule.decls.filter((d) => !d.disabled).map((d) => [d.prop, d.value])),
    };
  }

  /** Writes properties for the selected element (from a canvas handle). Returns where it went. */
  async applyCanvasEdit(props: Record<string, string>): Promise<string | undefined> {
    const s = this.hub.active;
    const target = await this.resolveTarget();
    if (!s || !target) return undefined;
    if (target.kind === 'rule') await this.setRuleProps(target.key, props);
    else await s.setInlineStyle(s.selectedId!, props);
    this.refresh(0);
    return target.label;
  }

  /** Edits one grid track (or adds / removes one) on the selected element's grid template. */
  async editGridTrack(axis: 'columns' | 'rows', op: 'set' | 'add' | 'remove', index: number, value: string | undefined, computed: string[]): Promise<string | undefined> {
    const target = await this.resolveTarget();
    if (!target) return undefined;
    const prop = axis === 'columns' ? 'grid-template-columns' : 'grid-template-rows';
    const authored = target.decls[prop];
    const tracks = authored ? expandTracks(authored) : computed.slice();
    if (!tracks) {
      this.notify(`${prop} uses auto-fill / auto-fit or named lines — edit it in the Styles panel.`);
      return undefined;
    }
    const next = editTracks(tracks, op, index, value);
    if (next.join(' ') === tracks.join(' ')) return undefined;
    return this.applyCanvasEdit({ [prop]: compressTracks(next) });
  }

  private async setRuleProps(key: string, props: Record<string, string>) {
    const s = this.hub.active;
    if (!s) return false;
    this.sources = await this.loadSources(s);
    const hit = this.findRule(key);
    if (!hit) return false;
    return this.applyToSource(hit.src, setDeclarations(hit.src.css, hit.rule.id, props));
  }

  dispose() {
    clearTimeout(this.timer);
    this.disposables.forEach((d) => d.dispose());
  }
}

/** Selector suggestions for the selected element, most specific last (↑/↓ in the panel cycles them). */
export function suggestSelectors(s: LiveSession, n: LdNode): string[] {
  const short = (x: LdNode) => {
    const id = x.attrs.find((a) => a.name === 'id')?.value.trim();
    if (id && /^[A-Za-z][-\w]*$/.test(id)) return '#' + id;
    const cls = x.attrs.find((a) => a.name === 'class')?.value.trim().split(/\s+/).filter((c) => /^[A-Za-z_-][-\w]*$/.test(c)) ?? [];
    if (cls.length) return '.' + cls[0];
    return x.tag;
  };
  const self = short(n);
  const out = new Set<string>();
  out.add(n.tag);
  const cls = n.attrs.find((a) => a.name === 'class')?.value.trim().split(/\s+/).filter(Boolean) ?? [];
  if (cls.length > 1) out.add('.' + cls.join('.'));
  out.add(self);
  let chain = self;
  let p = n.parent !== undefined ? s.model.nodes[n.parent] : undefined;
  while (p && !['html', 'body'].includes(p.tag) && !self.startsWith('#')) {
    chain = `${short(p)} ${chain}`;
    out.add(chain);
    if (short(p).startsWith('#')) break;
    p = p.parent !== undefined ? s.model.nodes[p.parent] : undefined;
    if (chain.split(' ').length >= 3) break;
  }
  return [...out];
}
