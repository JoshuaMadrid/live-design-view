import * as vscode from 'vscode';
import type { Hub } from '../hub';
import { registerSnippet, unregisterSnippets } from '../snippets';
import {
  STARTER_LIBRARY,
  type UserSnippet,
  parseSnippetFile,
  safeName,
  serializeSnippet,
} from '../snippetLibrary';

type Node = { kind: 'folder'; name: string; uri: vscode.Uri } | { kind: 'snippet'; snippet: UserSnippet; uri: vscode.Uri };

/**
 * Snippets panel (a snippets tab): folders of saved snippets on disk, each with an
 * optional trigger key. Click to place at the Live selection; type the trigger key in code to expand.
 */
export class SnippetsProvider implements vscode.TreeDataProvider<Node>, vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<Node | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  readonly view: vscode.TreeView<Node>;
  private folders: { name: string; uri: vscode.Uri; snippets: UserSnippet[] }[] = [];
  private readonly disposables: vscode.Disposable[] = [];
  private watcher: vscode.FileSystemWatcher | undefined;
  private reloadTimer: ReturnType<typeof setTimeout> | undefined;
  readonly ready: Promise<void>;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly hub: Hub,
  ) {
    this.view = vscode.window.createTreeView('liveDesign.snippets', { treeDataProvider: this, showCollapseAll: true });
    this.disposables.push(
      this.view,
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('liveDesign.snippetsFolder')) void this.init();
      }),
      vscode.languages.registerCompletionItemProvider(['html'], {
        provideCompletionItems: (doc, pos) => this.completions(doc, pos),
      }),
    );
    this.ready = this.init();
  }

  /** Library location: the liveDesign.snippetsFolder setting, else extension global storage. */
  get root(): vscode.Uri {
    const custom = vscode.workspace.getConfiguration('liveDesign').get<string>('snippetsFolder', '').trim();
    if (custom) {
      const expanded = custom.replace(/^~(?=$|[\\/])/, process.env.HOME ?? process.env.USERPROFILE ?? '~');
      return vscode.Uri.file(expanded);
    }
    return vscode.Uri.joinPath(this.context.globalStorageUri, 'snippets');
  }

  private async init() {
    const root = this.root;
    let exists = true;
    try {
      await vscode.workspace.fs.stat(root);
    } catch {
      exists = false;
    }
    if (!exists) {
      // First run: seed the starter pattern folders.
      for (const [folder, files] of Object.entries(STARTER_LIBRARY)) {
        for (const [file, text] of Object.entries(files)) {
          await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(root, folder, file), Buffer.from(text, 'utf8'));
        }
      }
    }
    this.watcher?.dispose();
    this.watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, '**/*'));
    const later = () => {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = setTimeout(() => void this.reload(), 200);
    };
    this.watcher.onDidCreate(later);
    this.watcher.onDidChange(later);
    this.watcher.onDidDelete(later);
    await this.reload();
  }

  async reload() {
    const root = this.root;
    const folders: typeof this.folders = [];
    let entries: [string, vscode.FileType][] = [];
    try {
      entries = await vscode.workspace.fs.readDirectory(root);
    } catch {
      entries = [];
    }
    for (const [name, type] of entries.sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: 'base' }))) {
      if (type !== vscode.FileType.Directory || name.startsWith('.')) continue;
      const uri = vscode.Uri.joinPath(root, name);
      const snippets: UserSnippet[] = [];
      for (const [file, ft] of (await vscode.workspace.fs.readDirectory(uri)).sort((a, b) => a[0].localeCompare(b[0]))) {
        if (ft !== vscode.FileType.File || !/\.html?$/i.test(file)) continue;
        const text = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(uri, file))).toString('utf8');
        snippets.push(parseSnippetFile(name, file, text));
      }
      folders.push({ name, uri, snippets });
    }
    this.folders = folders;
    unregisterSnippets('user:');
    for (const f of folders) for (const s of f.snippets) registerSnippet(s);
    this._onDidChange.fire();
  }

  get all(): UserSnippet[] {
    return this.folders.flatMap((f) => f.snippets);
  }

  // Tree --------------------------------------------------------------------

  getChildren(el?: Node): Node[] {
    if (!el) return this.folders.map((f) => ({ kind: 'folder', name: f.name, uri: f.uri }));
    if (el.kind === 'folder') {
      const f = this.folders.find((x) => x.name === el.name);
      return (f?.snippets ?? []).map((s) => ({ kind: 'snippet', snippet: s, uri: vscode.Uri.joinPath(f!.uri, s.file) }));
    }
    return [];
  }

  getTreeItem(el: Node): vscode.TreeItem {
    if (el.kind === 'folder') {
      const t = new vscode.TreeItem(el.name.replace(/_/g, ' '), vscode.TreeItemCollapsibleState.Collapsed);
      t.id = 'f:' + el.name;
      t.iconPath = vscode.ThemeIcon.Folder;
      t.resourceUri = el.uri;
      t.contextValue = 'snippetFolder';
      const count = this.folders.find((x) => x.name === el.name)?.snippets.length ?? 0;
      t.description = String(count);
      return t;
    }
    const s = el.snippet;
    const t = new vscode.TreeItem(s.name.replace(/_/g, ' '), vscode.TreeItemCollapsibleState.None);
    t.id = 's:' + s.key;
    t.iconPath = new vscode.ThemeIcon('symbol-snippet');
    t.description = s.meta.trigger ?? '';
    const md = new vscode.MarkdownString();
    if (s.meta.description) md.appendText(s.meta.description + '\n\n');
    if (s.meta.trigger) md.appendMarkdown(`Trigger key: \`${s.meta.trigger}\`\n\n`);
    if (s.requires?.length) md.appendMarkdown(`Adds to \`<head>\`: ${s.requires.join(', ')}\n\n`);
    md.appendCodeblock(s.body.length > 1200 ? s.body.slice(0, 1200) + '\n…' : s.body, 'html');
    t.tooltip = md;
    t.contextValue = 'snippet';
    t.command = { command: 'liveDesign.snippets.insert', title: 'Insert Snippet', arguments: [el] };
    return t;
  }

  // Commands ------------------------------------------------------------------

  insert(node?: Node) {
    if (!node || node.kind !== 'snippet') return;
    const s = this.hub.active;
    if (!s) {
      void vscode.window.showInformationMessage('Open an HTML file in Design or Split view to insert snippets.');
      return;
    }
    s.placeInsert(node.snippet.key);
  }

  async newFolder() {
    const name = await vscode.window.showInputBox({
      title: 'New Snippet Folder',
      prompt: 'Folder name (e.g. shadcn_Patterns, Hero_Sections)',
      validateInput: (v) => (safeName(v) ? undefined : 'Enter a name'),
    });
    if (!name) return;
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(this.root, safeName(name)));
    await this.reload();
  }

  /** Saves the code selection, or the element selected in Design view, as a snippet. */
  async saveSelection(target?: Node) {
    let body = '';
    const editor = vscode.window.activeTextEditor;
    if (editor && !editor.selection.isEmpty) body = editor.document.getText(editor.selection);
    else {
      const s = this.hub.active;
      const n = s?.selected;
      if (s && n?.located) body = s.model.text.slice(n.start, n.end);
    }
    if (!body.trim()) {
      void vscode.window.showInformationMessage('Select an element in the Design view (or some code) to save it as a snippet.');
      return;
    }

    let folder = target?.kind === 'folder' ? target.name : target?.kind === 'snippet' ? target.snippet.folder : undefined;
    if (!folder) {
      const NEW = '$(new-folder) New folder…';
      const pick = await vscode.window.showQuickPick(
        [...this.folders.map((f) => ({ label: f.name, description: `${f.snippets.length} snippets` })), { label: NEW }],
        { title: 'Save Snippet — choose a folder', placeHolder: 'Pattern folder' },
      );
      if (!pick) return;
      if (pick.label === NEW) {
        const n = await vscode.window.showInputBox({ title: 'New Snippet Folder', prompt: 'Folder name' });
        if (!n) return;
        folder = safeName(n);
      } else folder = pick.label;
    }
    const name = await vscode.window.showInputBox({
      title: `Save Snippet in ${folder}`,
      prompt: 'Snippet name',
      validateInput: (v) => (safeName(v) ? undefined : 'Enter a name'),
    });
    if (!name) return;
    const trigger = await vscode.window.showInputBox({
      title: 'Trigger Key (optional)',
      prompt: 'Type this in an HTML file to expand the snippet. Leave empty for none.',
      validateInput: (v) => (/^[\w-]*$/.test(v.trim()) ? undefined : 'Letters, numbers, - and _ only'),
    });
    if (trigger === undefined) return;
    const uri = vscode.Uri.joinPath(this.root, folder, safeName(name) + '.html');
    await vscode.workspace.fs.writeFile(uri, Buffer.from(serializeSnippet(body, { trigger: trigger.trim() || undefined }), 'utf8'));
    await this.reload();
    void vscode.window.showInformationMessage(`Saved snippet “${name}” in ${folder}.`);
  }

  async edit(node?: Node) {
    if (node?.kind === 'snippet') await vscode.window.showTextDocument(node.uri);
  }

  async remove(node?: Node) {
    if (!node) return;
    const what = node.kind === 'folder' ? `folder “${node.name}” and its snippets` : `snippet “${node.snippet.name}”`;
    const ok = await vscode.window.showWarningMessage(`Delete ${what}? It will be moved to the trash.`, { modal: true }, 'Delete');
    if (ok !== 'Delete') return;
    await vscode.workspace.fs.delete(node.uri, { recursive: true, useTrash: true });
    await this.reload();
  }

  reveal() {
    void vscode.commands.executeCommand('revealFileInOS', this.root);
  }

  // Trigger keys ----------------------------------------------------------------

  private completions(doc: vscode.TextDocument, pos: vscode.Position): vscode.CompletionItem[] {
    const word = doc.getWordRangeAtPosition(pos, /[\w-]+/);
    return this.all
      .filter((s) => s.meta.trigger)
      .map((s) => {
        const item = new vscode.CompletionItem(
          { label: s.meta.trigger!, description: `${s.folder.replace(/_/g, ' ')} › ${s.name.replace(/_/g, ' ')}` },
          vscode.CompletionItemKind.Snippet,
        );
        item.insertText = new vscode.SnippetString(s.body.replace(/[$}\\]/g, '\\$&'));
        item.documentation = new vscode.MarkdownString().appendCodeblock(s.body, 'html');
        item.detail = s.meta.description ?? 'Live Design snippet';
        if (word) item.range = word;
        return item;
      });
  }

  dispose() {
    this.watcher?.dispose();
    this.disposables.forEach((d) => d.dispose());
    this._onDidChange.dispose();
  }
}
