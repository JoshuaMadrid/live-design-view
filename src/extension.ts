import { registerAudit } from './auditRunner';
import { registerLinkChecker } from './links';
import * as vscode from 'vscode';
import { LiveDesignProvider } from './liveEditorProvider';
import { type Mode, ModeController, VIEW_TYPE, targetUri } from './modes';
import { Hub } from './hub';
import { DomTreeProvider, type DomItem } from './views/domTree';
import { InsertViewProvider, PropertiesViewProvider } from './views/panels';
import { SnippetsProvider } from './views/snippetsView';
import { CssDesignerProvider } from './views/cssDesigner';
import { applyDesignerLayout, registerThemeSync } from './theme';

export interface LiveDesignApi {
  provider: LiveDesignProvider;
  modes: ModeController;
  hub: Hub;
  dom: DomTreeProvider;
  snippets: SnippetsProvider;
  css: CssDesignerProvider;
  properties: PropertiesViewProvider;
  links: ReturnType<typeof registerLinkChecker>;
  audit: ReturnType<typeof registerAudit>;
}

export function activate(context: vscode.ExtensionContext): LiveDesignApi {
  registerThemeSync(context);
  const hub = new Hub();
  const modes = new ModeController(context.workspaceState);
  const provider = new LiveDesignProvider(context, modes, hub);
  const dom = new DomTreeProvider(hub);
  const snippets = new SnippetsProvider(context, hub);
  const properties = new PropertiesViewProvider(context.extensionUri, hub);
  const css = new CssDesignerProvider(context.extensionUri, hub, context.workspaceState);
  hub.ruleSources = () => css.ruleSources();
  hub.createRules = (sels, key) => css.createRules(sels, key);
  hub.canvasEdit = (e) => (e.kind === 'props' ? css.applyCanvasEdit(e.props) : css.editGridTrack(e.axis, e.op, e.index, e.value, e.computed));
  void vscode.commands.executeCommand('setContext', 'liveDesign.hasSession', false);

  context.subscriptions.push(
    hub,
    dom,
    snippets,
    css,
    vscode.window.registerWebviewViewProvider(CssDesignerProvider.id, css, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.commands.registerCommand('liveDesign.snippets.insert', (n) => snippets.insert(n)),
    vscode.commands.registerCommand('liveDesign.snippets.saveSelection', (n) => snippets.saveSelection(n)),
    vscode.commands.registerCommand('liveDesign.snippets.newFolder', () => snippets.newFolder()),
    vscode.commands.registerCommand('liveDesign.snippets.edit', (n) => snippets.edit(n)),
    vscode.commands.registerCommand('liveDesign.snippets.delete', (n) => snippets.remove(n)),
    vscode.commands.registerCommand('liveDesign.snippets.refresh', () => snippets.reload()),
    vscode.commands.registerCommand('liveDesign.snippets.reveal', () => snippets.reveal()),
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: true,
    }),
    vscode.window.registerWebviewViewProvider(
      InsertViewProvider.id,
      new InsertViewProvider(context.extensionUri, hub, context.globalState),
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    vscode.window.registerWebviewViewProvider(
      PropertiesViewProvider.id,
      properties,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  const register = (mode: Mode) =>
    vscode.commands.registerCommand(`liveDesign.${mode}View`, async (arg?: unknown) => {
      let uri = targetUri(arg);
      if (!uri || !/\.html?$/i.test(uri.path)) {
        // No HTML file in focus: offer the workspace's HTML files.
        uri = await pickHtmlFile(mode);
        if (!uri) return;
      }
      await modes.apply(uri, mode);
    });
  context.subscriptions.push(register('code'), register('split'), register('live'));

  // Structure panel context-menu commands.
  const onItem = (fn: (id: number) => unknown) => (item?: DomItem) => {
    const s = hub.active;
    const id = item?.id ?? s?.selectedId;
    if (s && id !== undefined) fn.call(null, id);
  };
  context.subscriptions.push(
    vscode.commands.registerCommand('liveDesign.dom.delete', onItem((id) => hub.active?.deleteElement(id))),
    vscode.commands.registerCommand('liveDesign.dom.moveUp', onItem((id) => hub.active?.move(id, 'up'))),
    vscode.commands.registerCommand('liveDesign.dom.moveDown', onItem((id) => hub.active?.move(id, 'down'))),
    vscode.commands.registerCommand('liveDesign.dom.editText', onItem((id) => hub.active?.startTextEdit(id))),
    vscode.commands.registerCommand('liveDesign.applyLayout', () => applyDesignerLayout()),
    vscode.commands.registerCommand('liveDesign.showProperties', () => vscode.commands.executeCommand('liveDesign.properties.focus')),
    vscode.commands.registerCommand('liveDesign.dom.copy', onItem((id) => hub.active?.copyElement(id))),
    vscode.commands.registerCommand('liveDesign.dom.cut', onItem((id) => hub.active?.cutElement(id))),
    vscode.commands.registerCommand('liveDesign.dom.paste', onItem((id) => hub.active?.pasteAt(id, false))),
    vscode.commands.registerCommand('liveDesign.dom.pasteAsChild', onItem((id) => hub.active?.pasteAt(id, true))),
    vscode.commands.registerCommand('liveDesign.dom.duplicate', onItem((id) => hub.active?.duplicateElement(id))),
    vscode.commands.registerCommand('liveDesign.dom.click', (item: DomItem) => dom.click(item)),
    vscode.commands.registerCommand('liveDesign.dom.editSelectors', (item?: DomItem) => dom.editSelectors(item)),
    vscode.commands.registerCommand('liveDesign.dom.changeTag', (item?: DomItem, tag?: string) => dom.changeTag(item, tag)),
    vscode.commands.registerCommand('liveDesign.dom.revealSource', onItem((id) => hub.active?.select(id))),
  );

  // Code | Split | Design switcher in the status bar — visible in every mode, unlike the
  // toolbar inside the Design view (which closes in Code mode).
  const modeItems = (['code', 'split', 'live'] as Mode[]).map((mode, i) => {
    const item = vscode.window.createStatusBarItem('liveDesign.mode.' + mode, vscode.StatusBarAlignment.Left, 1000 - i);
    item.name = `Live Design: ${mode[0].toUpperCase()}${mode.slice(1)} View`;
    item.command = `liveDesign.${mode}View`;
    context.subscriptions.push(item);
    return { mode, item };
  });
  const LABEL: Record<Mode, string> = { code: '$(code) Code', split: '$(split-horizontal) Split', live: '$(eye) Design' };
  const updateStatus = () => {
    const uri = targetUri();
    if (!uri || !/\.html?$/i.test(uri.path)) {
      modeItems.forEach(({ item }) => item.hide());
      return;
    }
    const current = modes.currentMode(uri);
    for (const { mode, item } of modeItems) {
      const on = mode === current;
      item.text = on ? `$(check) ${LABEL[mode].replace(/^\$\([^)]+\) /, '')}` : LABEL[mode];
      item.tooltip = on ? `Current mode: ${mode}` : `Switch this file to ${mode[0].toUpperCase()}${mode.slice(1)} view`;
      item.backgroundColor = undefined;
      item.show();
    }
  };
  context.subscriptions.push(
    vscode.window.tabGroups.onDidChangeTabs(updateStatus),
    vscode.window.tabGroups.onDidChangeTabGroups(updateStatus),
    vscode.window.onDidChangeActiveTextEditor(updateStatus),
    modes.onDidChangeMode(updateStatus),
  );
  updateStatus();

  // Restore the remembered mode when an HTML file is opened in a normal editor.
  context.subscriptions.push(
    vscode.window.tabGroups.onDidChangeTabs((e) => {
      for (const tab of e.opened) {
        const input = tab.input;
        if (input instanceof vscode.TabInputText && /\.html?$/i.test(input.uri.path)) {
          void modes.maybeRestore(input.uri);
        } else if (input instanceof vscode.TabInputCustom && input.viewType === VIEW_TYPE) {
          modes.markTouched(input.uri);
        }
      }
    }),
  );

  const links = registerLinkChecker(context);
  const audit = registerAudit(context, hub);
  return { provider, modes, hub, dom, snippets, css, properties, links, audit };
}

/** Quick pick of the workspace's .html files (most recently opened first). */
async function pickHtmlFile(mode: Mode): Promise<vscode.Uri | undefined> {
  const files = await vscode.workspace.findFiles('**/*.{html,htm}', '**/{node_modules,.git,dist,out,build}/**', 500);
  if (!files.length) {
    void vscode.window.showInformationMessage('No .html files in this workspace. Open a folder with an HTML page (or create index.html) to start designing.');
    return undefined;
  }
  const open = new Set(vscode.workspace.textDocuments.map((d) => d.uri.toString()));
  files.sort((a, b) => Number(open.has(b.toString())) - Number(open.has(a.toString())) || a.path.localeCompare(b.path));
  if (files.length === 1) return files[0];
  const pick = await vscode.window.showQuickPick(
    files.map((f) => ({ label: vscode.workspace.asRelativePath(f), description: open.has(f.toString()) ? 'open' : '', uri: f })),
    { title: `Open in ${mode === 'split' ? 'Split' : 'Design'} View`, placeHolder: 'Choose an HTML file' },
  );
  return pick?.uri;
}

export function deactivate() {}
