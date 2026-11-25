import * as vscode from 'vscode';

export const VIEW_TYPE = 'liveDesign.editor';
export type Mode = 'code' | 'split' | 'live';

const sameUri = (a: vscode.Uri, b: vscode.Uri) => a.toString() === b.toString();

function allTabs(): vscode.Tab[] {
  return vscode.window.tabGroups.all.flatMap((g) => g.tabs);
}

export function textTabs(uri: vscode.Uri): vscode.Tab[] {
  return allTabs().filter((t) => t.input instanceof vscode.TabInputText && sameUri(t.input.uri, uri));
}

export function liveTabs(uri: vscode.Uri): vscode.Tab[] {
  return allTabs().filter(
    (t) => t.input instanceof vscode.TabInputCustom && t.input.viewType === VIEW_TYPE && sameUri(t.input.uri, uri),
  );
}

/** Resolves the file a mode command should act on: explicit arg, else the active tab. */
export function targetUri(arg?: unknown): vscode.Uri | undefined {
  if (arg instanceof vscode.Uri) return arg;
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  if (input instanceof vscode.TabInputText || input instanceof vscode.TabInputCustom) return input.uri;
  return vscode.window.activeTextEditor?.document.uri;
}

export class ModeController {
  /** URIs whose mode we are currently changing — suppresses restore logic re-entering. */
  private applying = new Set<string>();
  /** URIs we already restored (or explicitly switched) this session. */
  private touched = new Set<string>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly state: vscode.Memento) {}

  onDidChangeMode(fn: () => void): vscode.Disposable {
    this.listeners.add(fn);
    return new vscode.Disposable(() => this.listeners.delete(fn));
  }

  lastMode(uri: vscode.Uri): Mode | undefined {
    return this.state.get<Mode>(`liveDesign.mode:${uri.toString()}`);
  }

  isApplying(uri: vscode.Uri): boolean {
    return this.applying.has(uri.toString());
  }

  /** Current layout for a file, inferred from open tabs. */
  currentMode(uri: vscode.Uri): Mode {
    const live = liveTabs(uri).length > 0;
    const text = textTabs(uri).length > 0;
    if (live && text) return 'split';
    if (live) return 'live';
    return 'code';
  }

  async apply(uri: vscode.Uri, mode: Mode): Promise<void> {
    const key = uri.toString();
    this.applying.add(key);
    this.touched.add(key);
    try {
      await this.state.update(`liveDesign.mode:${key}`, mode);
      if (mode === 'code') await this.toCode(uri);
      else if (mode === 'live') await this.toLive(uri);
      else await this.toSplit(uri);
    } finally {
      this.applying.delete(key);
      this.listeners.forEach((l) => l());
    }
  }

  // Switching never closes the last editor of a dirty document: closing would trigger VS Code's
  // "Save changes?" prompt. Instead an editor is swapped in place with `reopenActiveEditorWith`
  // (what "Reopen Editor With…" uses), and only duplicates of the same editor type are closed.

  private async toCode(uri: vscode.Uri) {
    const live = liveTabs(uri);
    if (live.length === 0) {
      await vscode.commands.executeCommand('vscode.openWith', uri, 'default');
      return;
    }
    const keepColumn = live[0].group.viewColumn;
    for (const t of live) await reopenAs(uri, t, 'default');
    await closeDuplicates(textTabs(uri), keepColumn);
  }

  private async toLive(uri: vscode.Uri) {
    const text = textTabs(uri);
    if (text.length === 0) {
      if (liveTabs(uri).length === 0) await vscode.commands.executeCommand('vscode.openWith', uri, VIEW_TYPE);
      await closeDuplicates(liveTabs(uri), liveTabs(uri)[0]?.group.viewColumn);
      return;
    }
    const keepColumn = liveTabs(uri)[0]?.group.viewColumn ?? text[0].group.viewColumn;
    for (const t of text) await reopenAs(uri, t, VIEW_TYPE);
    await closeDuplicates(liveTabs(uri), keepColumn);
  }

  private async toSplit(uri: vscode.Uri) {
    // Code on the left (column One).
    const liveInOne = liveTabs(uri).find((t) => t.group.viewColumn === vscode.ViewColumn.One);
    if (!textTabs(uri).some((t) => t.group.viewColumn === vscode.ViewColumn.One)) {
      if (liveInOne) await reopenAs(uri, liveInOne, 'default');
      else await vscode.commands.executeCommand('vscode.openWith', uri, 'default', vscode.ViewColumn.One);
    }
    // Live beside it.
    if (!liveTabs(uri).some((t) => t.group.viewColumn !== vscode.ViewColumn.One)) {
      const text = textTabs(uri).find((t) => t.group.viewColumn === vscode.ViewColumn.One);
      if (text) await activate(uri, text);
      await vscode.commands.executeCommand('vscode.openWith', uri, VIEW_TYPE, {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: false,
      });
    }
    await closeDuplicates(textTabs(uri), vscode.ViewColumn.One);
    const liveCol = liveTabs(uri).find((t) => t.group.viewColumn !== vscode.ViewColumn.One)?.group.viewColumn;
    await closeDuplicates(liveTabs(uri), liveCol);
    // Any text editor still sitting in the live column (or vice versa) is a duplicate too.
  }

  /** Called when a tab for an HTML file opens: restore its remembered Split/Design mode once per session. */
  async maybeRestore(uri: vscode.Uri): Promise<void> {
    const key = uri.toString();
    if (this.touched.has(key) || this.applying.has(key)) return;
    this.touched.add(key);
    if (!vscode.workspace.getConfiguration('liveDesign').get<boolean>('restoreLastMode', true)) return;
    const mode = this.lastMode(uri);
    if (mode === 'split' || mode === 'live') {
      if (this.currentMode(uri) !== mode) await this.apply(uri, mode);
    }
  }

  markTouched(uri: vscode.Uri) {
    this.touched.add(uri.toString());
  }
}

/** Focuses an existing tab so editor commands act on it. */
async function activate(uri: vscode.Uri, tab: vscode.Tab) {
  const viewType = tab.input instanceof vscode.TabInputCustom ? tab.input.viewType : 'default';
  await vscode.commands.executeCommand('vscode.openWith', uri, viewType, {
    viewColumn: tab.group.viewColumn,
    preserveFocus: false,
  });
}

/** Replaces a tab in place with another editor type, keeping unsaved changes without prompting. */
async function reopenAs(uri: vscode.Uri, tab: vscode.Tab, viewType: string) {
  await activate(uri, tab);
  await vscode.commands.executeCommand('reopenActiveEditorWith', viewType);
}

/** Closes all but one tab (preferring keepColumn). Safe for dirty docs: an equal editor stays open. */
async function closeDuplicates(tabs: vscode.Tab[], keepColumn?: vscode.ViewColumn) {
  if (tabs.length < 2) return;
  const keep = tabs.find((t) => t.group.viewColumn === keepColumn) ?? tabs[0];
  await vscode.window.tabGroups.close(
    tabs.filter((t) => t !== keep),
    true,
  );
}
