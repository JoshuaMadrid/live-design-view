// Stages a realistic layout for screenshots (not part of the test suite): `npm run demo`.
import * as vscode from 'vscode';
import type { LiveDesignApi } from '../../src/extension';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function run(): Promise<void> {
  const ext = vscode.extensions.all.find((e) => e.packageJSON.name === 'live-design-view')!;
  const api = (await ext.activate()) as LiveDesignApi;
  const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'index.html');
  const theme = process.env.LD_THEME;
  if (theme) {
    await vscode.workspace.getConfiguration('liveDesign').update('uiTheme', theme, vscode.ConfigurationTarget.Global);
    const ct = { modern: 'Live Design Modern', canvas: 'Live Design Canvas', graphite: 'Live Design Graphite' }[theme];
    if (ct) await vscode.workspace.getConfiguration('workbench').update('colorTheme', ct, vscode.ConfigurationTarget.Global);
  }
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  await vscode.commands.executeCommand('liveDesign.splitView', uri);
  await vscode.commands.executeCommand('workbench.view.extension.liveDesign');
  await sleep(2500);
  const s = api.provider.sessionsFor(uri)[0];
  const stage = process.env.LD_DEMO_STAGE ?? 'popover';
  const h1 = s.model.nodes.find((n) => n.tag === 'section')!;
  s.select(h1.id, { scrollCanvas: true });
  await sleep(500);
  if (stage === 'popover') s.placeInsert('div');
  if (stage === 'code') await vscode.commands.executeCommand('liveDesign.codeView', uri);
  if (stage === 'inspector') {
    const img = s.model.nodes.find((n) => n.tag === 'input' && n.attrs.some((a) => a.value === 'email'))!;
    await vscode.commands.executeCommand('liveDesign.dom.focus');
    await vscode.commands.executeCommand('liveDesign.properties.focus');
    await sleep(800);
    s.select(img.id, { scrollCanvas: true });
  }
  if (stage === 'layout') {
    const nav = s.model.nodes.find((n) => n.tag === 'nav')!;
    await vscode.commands.executeCommand('liveDesign.properties.focus');
    await vscode.commands.executeCommand('workbench.action.toggleMaximizedPanel');
    await sleep(800);
    s.select(nav.id, { scrollCanvas: true });
  }
  if (stage === 'full') {
    const nav = s.model.nodes.find((n) => n.tag === 'nav')!;
    await sleep(1500);
    s.select(nav.id, { scrollCanvas: true });
    await sleep(800);
    await api.css.onMessage({ type: 'mode', mode: 'current' });
  }
  if (stage === 'hud') {
    const card = s.model.nodes.find((n) => n.attrs.some((a) => a.name === 'class' && a.value.split(' ').includes('card')))!;
    await sleep(1500);
    await vscode.commands.executeCommand('liveDesign.css.focus');
    s.select(card.id, { scrollCanvas: true });
    await sleep(800);
    await api.css.onMessage({ type: 'mode', mode: 'current' });
    await sleep(400);
    await api.css.testGroups('border');
    await api.css.testGroups('background');
    s.testAction({ kind: 'hudOpen', value: '.' });
  }
  if (stage === 'shot') {
    await vscode.commands.executeCommand('liveDesign.applyLayout');
    await sleep(800);
    const nav = s.model.nodes.find((n) => n.tag === 'nav')!;
    s.select(nav.id, { scrollCanvas: true });
    await sleep(600);
    await api.css.onMessage({ type: 'mode', mode: 'all' });
  }
  if (stage === 'rules') {
    await sleep(1500);
    await vscode.commands.executeCommand('workbench.action.closePanel');
    await vscode.commands.executeCommand('liveDesign.css.focus');
    const a = s.model.nodes.find((n) => n.tag === 'a' && n.attrs.some((x) => x.value === 'brand'))!;
    s.select(a.id, { scrollCanvas: true });
    await sleep(600);
    await api.css.onMessage({ type: 'mode', mode: 'all' });
  }
  if (stage === 'audit') {
    await sleep(1500);
    const contact = s.model.nodes.find((n) => n.attrs.some((a) => a.name === 'id' && a.value === 'contact'))!;
    s.select(contact.id, { scrollCanvas: true });
    await sleep(500);
    await vscode.commands.executeCommand('liveDesign.audit', s.document.uri);
  }
  if (stage === 'tips') {
    const nav = s.model.nodes.find((n) => n.tag === 'nav')!;
    await sleep(1500);
    await vscode.commands.executeCommand('workbench.action.closePanel');
    await vscode.commands.executeCommand('vscode.moveViews', { viewIds: ['liveDesign.dom'], destinationId: 'workbench.view.explorer' }).then(undefined, () => undefined);
    await vscode.commands.executeCommand('liveDesign.css.focus');
    s.select(nav.id, { scrollCanvas: true });
    await sleep(800);
    await api.css.onMessage({ type: 'mode', mode: 'current' });
    await api.css.onMessage({ type: 'showSet', value: false });
  }
  if (stage === 'grid') {
    await sleep(1500);
    const ul = s.model.nodes.find((n) => n.tag === 'ul')!;
    await s.setInlineStyle(ul.id, { display: 'grid', 'grid-template-columns': 'repeat(3, 1fr)', gap: '16px', padding: '12px', 'list-style': 'none' });
    await sleep(800);
    const ul2 = s.model.nodes.find((n) => n.tag === 'ul')!;
    s.select(ul2.id, { scrollCanvas: true });
  }
  if (stage === 'wide') {
    await sleep(1500);
    await vscode.commands.executeCommand('vscode.moveViews', { viewIds: ['liveDesign.css'], destinationId: 'workbench.view.extension.liveDesignPanel' }).then(undefined, () => undefined);
    await vscode.commands.executeCommand('vscode.moveViews', { viewIds: ['liveDesign.properties'], destinationId: 'workbench.view.explorer' }).then(undefined, () => undefined);
    await vscode.commands.executeCommand('liveDesign.css.focus');
    await vscode.commands.executeCommand('workbench.action.toggleMaximizedPanel');
    const p = s.model.nodes.find((n) => n.tag === 'p' && n.attrs.some((a) => a.value === 'lead'))!;
    s.select(p.id, { scrollCanvas: true });
    await sleep(800);
    await api.css.onMessage({ type: 'mode', mode: 'current' });
    await api.css.onMessage({ type: 'showSet', value: false });
  }
  if (stage === 'empty') {
    await sleep(1500);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.commands.executeCommand('liveDesign.css.focus');
  }
  if (stage === 'css') {
    const h1 = s.model.nodes.find((n) => n.tag === 'nav')!;
    s.select(h1.id, { scrollCanvas: true });
    await vscode.commands.executeCommand('liveDesign.css.focus');
    await vscode.commands.executeCommand('liveDesign.insert.removeView').then(undefined, () => undefined);
    await sleep(800);
    await api.css.onMessage({ type: 'mode', mode: 'current' });
    await sleep(800);
    await api.css.onMessage({ type: 'showSet', value: true });
    await vscode.commands.executeCommand('workbench.action.closePanel');
  }
  // Clean frame for screenshots: no toasts.
  await sleep(1500);
  await vscode.commands.executeCommand('notifications.clearAll').then(undefined, () => undefined);
  await sleep(Number(process.env.LD_DEMO_WAIT ?? 90000));
}
