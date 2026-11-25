import * as vscode from 'vscode';
import type { Hub } from '../hub';
import type { LdNode } from '../htmlModel';

/**
 * A node in the Structure panel. Identified by its element path + tag (stable across re-parses);
 * the numeric id is looked up from the current model whenever it's needed.
 */
export interface DomItem {
  key: string;
  readonly id: number;
}

const HIDDEN = new Set(['script', 'style', 'meta', 'link', 'base']);

/**
 * Native tree view of the active Live document's elements (a Structure panel).
 * Selecting a node selects it in Design view and in the code editor; selections elsewhere reveal it here.
 */
const DOM_MIME = 'application/vnd.code.tree.livedesign.dom';
/** Elements that typically hold other blocks — dropping onto them nests. */
const CONTAINERS = new Set(['body', 'div', 'section', 'header', 'footer', 'main', 'nav', 'article', 'aside', 'form', 'fieldset', 'ul', 'ol', 'li', 'figure', 'blockquote', 'details', 'td', 'th', 'dialog', 'picture']);
const NO_CHILDREN_DROP = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr', 'textarea', 'script', 'style', 'title', 'iframe', 'select', 'option', 'head', 'html']);

export class DomTreeProvider implements vscode.TreeDataProvider<DomItem>, vscode.TreeDragAndDropController<DomItem>, vscode.Disposable {
  readonly dragMimeTypes = [DOM_MIME];
  readonly dropMimeTypes = [DOM_MIME];
  private lastClick: { key: string; at: number } | undefined;
  private readonly _onDidChange = new vscode.EventEmitter<DomItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  readonly view: vscode.TreeView<DomItem>;
  private readonly disposables: vscode.Disposable[] = [];
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private items = new Map<string, DomItem>();
  /** Key of the item we are revealing programmatically (its selection event is an echo). */
  private revealingKey: string | undefined;
  /** Selection events right after a refresh/reveal are VS Code restoring state, not the user. */
  private quietUntil = 0;

  constructor(private readonly hub: Hub) {
    this.view = vscode.window.createTreeView('liveDesign.dom', {
      treeDataProvider: this,
      showCollapseAll: true,
      dragAndDropController: this,
    });
    this.disposables.push(
      this.view,
      this.view.onDidChangeSelection((e) => {
        const item = e.selection[0];
        if (item && item.key === this.revealingKey) {
          this.revealingKey = undefined;
          return;
        }
        if (Date.now() < this.quietUntil) return;
        const s = this.hub.active;
        if (item && s && item.id >= 0 && item.id !== s.selectedId) s.select(item.id, { scrollCanvas: true });
      }),
      hub.onDidChangeActive(() => this.refresh(true)),
      hub.onDidChangeModel(() => this.refresh(false)),
      hub.onDidChangeSelection(() => this.revealSelection()),
      this.view.onDidChangeVisibility((e) => e.visible && this.revealSelection()),
    );
  }

  private get nodes(): LdNode[] {
    return this.hub.active?.model.nodes ?? [];
  }

  private refresh(now: boolean) {
    clearTimeout(this.refreshTimer);
    const run = () => {
      this.quietUntil = Date.now() + 400;
      this._onDidChange.fire();
      setTimeout(() => this.revealSelection(), 50);
    };
    if (now) run();
    else this.refreshTimer = setTimeout(run, 150);
  }

  private item(n: LdNode): DomItem {
    const key = n.path.join('.') + ':' + n.tag;
    let it = this.items.get(key);
    if (!it) {
      const hub = this.hub;
      const path = n.path;
      const tag = n.tag;
      it = {
        key,
        get id() {
          const nodes = hub.active?.model.nodes ?? [];
          const found = nodes.find((x) => x.tag === tag && x.path.length === path.length && x.path.every((v, i) => v === path[i]));
          return found ? found.id : -1;
        },
      };
      this.items.set(key, it);
    }
    return it;
  }

  private visibleChildren(n: LdNode | undefined): LdNode[] {
    const ids = n ? n.children : this.nodes.filter((x) => x.parent === undefined).map((x) => x.id);
    return ids.map((i) => this.nodes[i]).filter((c) => c && !HIDDEN.has(c.tag));
  }

  getChildren(el?: DomItem): DomItem[] {
    const n = el ? this.nodes[el.id] : undefined;
    if (el && !n) return [];
    return this.visibleChildren(n).map((c) => this.item(c));
  }

  getParent(el: DomItem): DomItem | undefined {
    const n = this.nodes[el.id];
    return n && n.parent !== undefined && this.nodes[n.parent] !== undefined ? this.item(this.nodes[n.parent]) : undefined;
  }

  getTreeItem(el: DomItem): vscode.TreeItem {
    const n = this.nodes[el.id];
    if (!n) return new vscode.TreeItem('');
    const kids = this.visibleChildren(n).length;
    const depth = n.path.length;
    const t = new vscode.TreeItem(
      n.tag,
      kids === 0
        ? vscode.TreeItemCollapsibleState.None
        : depth <= 3 || n.tag === 'body' || n.tag === 'main'
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed,
    );
    t.id = el.key;
    const id = n.attrs.find((a) => a.name === 'id')?.value;
    const cls = n.attrs.find((a) => a.name === 'class')?.value.trim().split(/\s+/).filter(Boolean) ?? [];
    const text = n.texts.map((x) => x.value).join('').replace(/\s+/g, ' ').trim();
    t.description = [(id ? '#' + id : '') + cls.map((c) => '.' + c).join(''), text && kids === 0 ? `“${text.slice(0, 40)}”` : '']
      .filter(Boolean)
      .join('  ');
    t.tooltip = new vscode.MarkdownString(`\`<${n.tag}>\`${n.located ? '' : ' (implied by the parser)'}`);
    t.iconPath = new vscode.ThemeIcon(iconFor(n.tag));
    t.contextValue = n.located && !['html', 'head', 'body'].includes(n.tag) ? 'element' : 'fixed';
    t.command = { command: 'liveDesign.dom.click', title: 'Select', arguments: [el] };
    return t;
  }

  /** The tree item for an element id (used by tests and commands). */
  itemFor(id: number): DomItem | undefined {
    const n = this.nodes[id];
    return n ? this.item(n) : undefined;
  }

  /** Item click: a second click on the same item within 450ms counts as a double-click. */
  async click(el: DomItem) {
    const now = Date.now();
    const dbl = this.lastClick && this.lastClick.key === el.key && now - this.lastClick.at < 450;
    this.lastClick = dbl ? undefined : { key: el.key, at: now };
    if (dbl) await this.editSelectors(el);
  }

  /** DOM double-click: type ".class #id" names for the element. */
  async editSelectors(el?: DomItem) {
    const s = this.hub.active;
    const id = el?.id ?? s?.selectedId;
    if (!s || id === undefined || id < 0) return;
    const n = s.model.nodes[id];
    if (!n?.located) return void vscode.window.showInformationMessage(`<${n?.tag ?? 'element'}> isn't written in the source.`);
    const cur = [
      ...(n.attrs.find((a) => a.name === 'id')?.value ? ['#' + n.attrs.find((a) => a.name === 'id')!.value] : []),
      ...(n.attrs.find((a) => a.name === 'class')?.value.trim().split(/\s+/).filter(Boolean).map((c) => '.' + c) ?? []),
    ].join(' ');
    const value = await vscode.window.showInputBox({
      title: `Class / ID for <${n.tag}>`,
      prompt: 'Type .class and #id names separated by spaces (e.g. ".card .featured #promo"). Clear to remove.',
      value: cur,
      valueSelection: [cur.length, cur.length],
      placeHolder: '.name #id',
    });
    if (value === undefined) return;
    await s.setSelectors(id, value);
  }

  /** Change the element's tag (div → section, p → h2 …); attributes and content are kept. */
  async changeTag(el?: DomItem, pick?: string) {
    const s = this.hub.active;
    const id = el?.id ?? s?.selectedId;
    if (!s || id === undefined || id < 0) return;
    const n = s.model.nodes[id];
    if (!n?.located) return void vscode.window.showInformationMessage(`<${n?.tag ?? 'element'}> isn't written in the source.`);
    let tag = pick;
    if (!tag) {
      const groups: [string, string[]][] = [
        ['Structure', ['div', 'section', 'article', 'aside', 'header', 'footer', 'main', 'nav', 'figure']],
        ['Text', ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'blockquote', 'strong', 'em']],
        ['Lists', ['ul', 'ol', 'li']],
        ['Interactive', ['a', 'button', 'label', 'details', 'summary']],
      ];
      const items: vscode.QuickPickItem[] = [];
      for (const [g, tags] of groups) {
        items.push({ label: g, kind: vscode.QuickPickItemKind.Separator });
        for (const t of tags) items.push({ label: t, description: t === n.tag ? 'current' : undefined });
      }
      const qp = vscode.window.createQuickPick();
      qp.title = `Change <${n.tag}> to…`;
      qp.placeholder = 'Pick a tag or type any tag name';
      qp.items = items;
      qp.onDidChangeValue((v) => {
        const t = v.trim().toLowerCase();
        const custom = /^[a-z][a-z0-9-]*$/.test(t) && !items.some((i) => i.label === t) ? [{ label: t, description: 'custom tag' }] : [];
        qp.items = [...custom, ...items];
      });
      tag = await new Promise<string | undefined>((resolve) => {
        qp.onDidAccept(() => { resolve(qp.selectedItems[0]?.label); qp.hide(); });
        qp.onDidHide(() => { resolve(undefined); qp.dispose(); });
        qp.show();
      });
    }
    if (!tag || tag === n.tag) return;
    await s.renameTag(id, tag);
  }

  // Drag & drop -----------------------------------------------------------------

  handleDrag(source: readonly DomItem[], dt: vscode.DataTransfer) {
    const keys = source.map((x) => x.key);
    dt.set(DOM_MIME, new vscode.DataTransferItem(keys));
  }

  /**
   * Drop rules (VS Code trees only report the item you dropped on):
   * - onto a container (div, section, ul, form, …): nest inside it as the first child;
   * - onto anything else (h1, p, img, a, …): take its place — before it when dragging up, after it when dragging down;
   * - onto empty space: end of <body>.
   * Reorder containers with Move Up / Move Down, or by dragging on the page.
   */
  async handleDrop(target: DomItem | undefined, dt: vscode.DataTransfer) {
    const s = this.hub.active;
    const keys = dt.get(DOM_MIME)?.value as string[] | undefined;
    if (!s || !keys?.length) return;
    const dragged = this.items.get(keys[0]);
    const id = dragged?.id ?? -1;
    if (id < 0) return;
    const nodes = s.model.nodes;
    const n = nodes[id];
    let targetId: number;
    let position: 'before' | 'after' | 'inside-first' | 'inside-last';
    if (!target || target.id < 0) {
      const body = nodes.find((x) => x.tag === 'body');
      if (!body) return;
      targetId = body.id;
      position = 'inside-last';
    } else {
      const t = nodes[target.id];
      if (t.id === n.id) return;
      targetId = t.id;
      if (CONTAINERS.has(t.tag)) position = 'inside-first';
      else position = n.start < t.start ? 'after' : 'before';
    }
    await s.moveTo(id, targetId, position);
  }

  private revealSelection() {
    const s = this.hub.active;
    if (!s || !this.view.visible || s.selectedId === undefined) return;
    const n = s.model.nodes[s.selectedId];
    if (!n || HIDDEN.has(n.tag)) return;
    const it = this.item(n);
    const cur = this.view.selection[0];
    if (cur && cur.key === it.key) return;
    this.revealingKey = it.key;
    this.quietUntil = Date.now() + 250;
    Promise.resolve(this.view.reveal(it, { select: true, focus: false, expand: false })).catch(() => {
      this.revealingKey = undefined;
    });
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose());
    this._onDidChange.dispose();
  }
}

function iconFor(tag: string): string {
  if (/^h[1-6]$/.test(tag)) return 'symbol-text';
  switch (tag) {
    case 'html': return 'code';
    case 'head': return 'settings';
    case 'body': return 'symbol-namespace';
    case 'img': case 'picture': case 'svg': case 'figure': return 'file-media';
    case 'a': return 'link';
    case 'ul': return 'list-unordered';
    case 'ol': return 'list-ordered';
    case 'table': case 'thead': case 'tbody': case 'tr': case 'td': case 'th': return 'table';
    case 'form': return 'checklist';
    case 'input': case 'textarea': case 'select': return 'symbol-string';
    case 'button': return 'record-small';
    case 'p': case 'span': case 'strong': case 'em': case 'b': case 'i': case 'li': case 'label': return 'symbol-text';
    case 'video': case 'audio': case 'iframe': return 'device-camera-video';
    case 'nav': return 'compass';
    default: return 'symbol-structure';
  }
}
