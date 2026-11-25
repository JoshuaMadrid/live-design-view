import * as vscode from 'vscode';

export type UiTheme = 'vscode' | 'canvas' | 'graphite' | 'modern';

export const UI_THEMES: { id: UiTheme; label: string; detail: string; colorTheme?: string }[] = [
  { id: 'modern', label: 'Modern', detail: 'Custom: deep slate, violet accent, rounded cards', colorTheme: 'Live Design Modern' },
  { id: 'canvas', label: 'Canvas', detail: 'Dark design-tool panels, blue accent, compact type', colorTheme: 'Live Design Canvas' },
  { id: 'graphite', label: 'Graphite', detail: 'Gray panels, boxed headers, blue accent, dense', colorTheme: 'Live Design Graphite' },
  { id: 'vscode', label: 'VS Code', detail: 'Follow your current VS Code color theme' },
];

export function uiTheme(): UiTheme {
  let t = vscode.workspace.getConfiguration('liveDesign').get<string>('uiTheme', 'modern');
  // Settings saved by older versions used other names for these two looks.
  t = ({ figma: 'canvas', dreamweaver: 'graphite', classic: 'graphite' } as Record<string, string>)[t] ?? t;
  return (UI_THEMES.some((x) => x.id === t) ? t : 'modern') as UiTheme;
}

/** Webviews that should restyle when the UI theme setting changes. */
const targets = new Set<vscode.Webview>();
export function trackThemedWebview(w: vscode.Webview): vscode.Disposable {
  targets.add(w);
  return new vscode.Disposable(() => targets.delete(w));
}

export function registerThemeSync(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('liveDesign.uiTheme')) return;
      const theme = uiTheme();
      for (const w of targets) void w.postMessage({ type: 'ldTheme', theme });
    }),
    vscode.commands.registerCommand('liveDesign.chooseTheme', async () => {
      const current = uiTheme();
      const pick = await vscode.window.showQuickPick(
        UI_THEMES.map((t) => ({ label: (t.id === current ? '$(check) ' : '') + t.label, description: t.detail, id: t.id, colorTheme: t.colorTheme })),
        { title: 'Live Design: Choose UI Theme', placeHolder: 'Pick a look for the Design view and its panels' },
      );
      if (!pick) return;
      await vscode.workspace.getConfiguration('liveDesign').update('uiTheme', pick.id, vscode.ConfigurationTarget.Global);
      const wb = vscode.workspace.getConfiguration('workbench');
      if (pick.colorTheme && wb.get('colorTheme') !== pick.colorTheme) {
        const yes = await vscode.window.showInformationMessage(
          `Also switch VS Code to the "${pick.colorTheme}" color theme so the sidebars, tabs and Structure tree match?`,
          'Switch',
          'Not now',
        );
        if (yes === 'Switch') await wb.update('colorTheme', pick.colorTheme, vscode.ConfigurationTarget.Global);
      }
    }),
  );
}

/**
 * The workspace layout: files (Explorer) on the left, Styles panel + DOM in the right sidebar,
 * Attributes in the bottom panel, Elements bar at the top of the Design view.
 * Views the user dragged elsewhere are moved back first.
 */
export async function applyDesignerLayout(refocus?: () => void) {
  const move = async (viewIds: string[], destinationId: string) => {
    try {
      await vscode.commands.executeCommand('vscode.moveViews', { viewIds, destinationId });
    } catch {
      /* older VS Code: leave views where they are */
    }
  };
  await move(['liveDesign.dom', 'liveDesign.css'], 'workbench.view.extension.liveDesignRight');
  await move(['liveDesign.properties'], 'workbench.view.extension.liveDesignPanel');
  await vscode.commands.executeCommand('workbench.view.explorer');
  await vscode.commands.executeCommand('liveDesign.css.focus');
  await vscode.commands.executeCommand('liveDesign.properties.focus');
  refocus?.();
}
