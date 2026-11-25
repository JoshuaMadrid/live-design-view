// Shared helpers for scripted, recorded walkthroughs (tour.ts, p10.ts, fp.ts).
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { LiveDesignApi } from '../../src/extension';
import type { LiveSession } from '../../src/liveEditorProvider';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const DIR = process.env.LD_TOUR_DIR!;
export const mark = (name: string) => fs.appendFileSync(path.join(DIR, 'markers.txt'), `${Date.now()} ${name}\n`);
export async function until<T>(fn: () => T | undefined | false | Promise<T | undefined | false>, ms = 30000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error('tour: timed out');
    await sleep(100);
  }
}
export const root = () => vscode.workspace.workspaceFolders![0].uri;
export const file = (rel: string) => vscode.Uri.joinPath(root(), rel);
export const ID = 'joshuamadrid.live-design-view';

/** Full screen, quiet window; then wait for the recorder ("go"). */
export async function setup(open?: vscode.Uri) {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  await vscode.commands.executeCommand('workbench.action.closePanel');
  await vscode.commands.executeCommand('workbench.action.toggleFullScreen');
  await sleep(2500);
  if (open) await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(open));
  await vscode.commands.executeCommand('workbench.view.explorer');
  await sleep(800);
  await vscode.commands.executeCommand('notifications.clearAll');
  fs.writeFileSync(path.join(DIR, 'ready'), '');
  await until(() => fs.existsSync(path.join(DIR, 'go')), 180000);
  await sleep(1200);
}

/** Real install from the Marketplace: search, install, wait for it, then the Canvas theme. */
export async function install(theme = 'canvas'): Promise<LiveDesignApi> {
  mark('install');
  await vscode.commands.executeCommand('workbench.view.extensions');
  await sleep(1400);
  await vscode.commands.executeCommand('workbench.extensions.search', 'Live Design View');
  await sleep(3800);
  await vscode.commands.executeCommand('extension.open', ID).then(undefined, () => undefined);
  await sleep(3200);
  // Dev runs (LD_TOUR_MARKET unset) load the local build instead of installing.
  if (process.env.LD_TOUR_MARKET) await vscode.commands.executeCommand('workbench.extensions.installExtension', ID);
  const ext = await until(() => vscode.extensions.getExtension(ID), 120000);
  await sleep(2500);
  const api = (await ext.activate()) as LiveDesignApi;
  await vscode.workspace.getConfiguration('liveDesign').update('uiTheme', theme, vscode.ConfigurationTarget.Global);
  const ct = { modern: 'Live Design Modern', canvas: 'Live Design Canvas', graphite: 'Live Design Graphite' }[theme];
  if (ct) await vscode.workspace.getConfiguration('workbench').update('colorTheme', ct, vscode.ConfigurationTarget.Global);
  await sleep(2500);
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  await vscode.commands.executeCommand('workbench.view.explorer');
  await vscode.commands.executeCommand('notifications.clearAll');
  await sleep(1000);
  return api;
}

export async function session(api: LiveDesignApi, uri: vscode.Uri): Promise<LiveSession> {
  const s = await until(() => api.provider.sessionsFor(uri)[0]);
  await s.waitForRender(1);
  return s;
}

/** The text editor showing a document (opening it in the first column if needed). */
export async function editorFor(uri: vscode.Uri, column = vscode.ViewColumn.One): Promise<vscode.TextEditor> {
  const open = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === uri.toString());
  if (open) return open;
  return vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri), { viewColumn: column, preview: false });
}

/** Types text into an editor at an offset, a few characters at a time (looks like typing). */
export async function typeAt(ed: vscode.TextEditor, offset: number, text: string, cps = 28) {
  let at = offset;
  const chunk = cps >= 150 ? 14 : cps >= 80 ? 6 : 2;
  for (let i = 0; i < text.length; i += chunk) {
    const part = text.slice(i, i + chunk);
    const pos = ed.document.positionAt(at);
    await ed.edit((e) => e.insert(pos, part), { undoStopBefore: false, undoStopAfter: false });
    at += part.length;
    const p2 = ed.document.positionAt(at);
    ed.selection = new vscode.Selection(p2, p2);
    ed.revealRange(new vscode.Range(p2, p2), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    await sleep((1000 / cps) * part.length);
  }
}

/** Selects the first occurrence of `find` (after `after`, if given), pauses, then types `replace` over it. */
export async function replaceText(ed: vscode.TextEditor, find: string, replace: string, after?: string, cps = 28) {
  const t = ed.document.getText();
  const from = after ? t.indexOf(after) : 0;
  const i = t.indexOf(find, Math.max(0, from));
  if (i < 0) throw new Error('tour: not found: ' + find);
  const a = ed.document.positionAt(i);
  const b = ed.document.positionAt(i + find.length);
  ed.selection = new vscode.Selection(a, b);
  ed.revealRange(new vscode.Range(a, b), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  await sleep(700);
  await ed.edit((e) => e.delete(new vscode.Range(a, b)));
  await typeAt(ed, i, replace, cps);
}

/** Inserts text right after the first occurrence of `anchor` (after `after`, if given). */
export async function insertAfter(ed: vscode.TextEditor, anchor: string, text: string, after?: string, cps = 28) {
  const t = ed.document.getText();
  const from = after ? t.indexOf(after) : 0;
  const i = t.indexOf(anchor, Math.max(0, from));
  if (i < 0) throw new Error('tour: not found: ' + anchor);
  const at = i + anchor.length;
  const p = ed.document.positionAt(at);
  ed.selection = new vscode.Selection(p, p);
  ed.revealRange(new vscode.Range(p, p), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  await sleep(500);
  await typeAt(ed, at, text, cps);
}

export function done() {
  mark('end');
  fs.writeFileSync(path.join(DIR, 'done'), '');
}
