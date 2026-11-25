// Scripted walkthrough of the extension in real desktop VS Code, for a wordless screen recording.
// A drawn pointer (media/puppet.js) glides to each target before acting. Scene boundaries are
// written to LD_TOUR_DIR/markers.txt (epoch ms + name) so the recording can be cut per scene.
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { LiveDesignApi } from '../../src/extension';
import type { LiveSession } from '../../src/liveEditorProvider';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DIR = process.env.LD_TOUR_DIR!;
const mark = (name: string) => fs.appendFileSync(path.join(DIR, 'markers.txt'), `${Date.now()} ${name}\n`);
async function until<T>(fn: () => T | undefined | false, ms = 20000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error('tour: timed out');
    await sleep(100);
  }
}

export async function run(): Promise<void> {
  const ext = vscode.extensions.all.find((e) => e.packageJSON.name === 'live-design-view')!;
  const api = (await ext.activate()) as LiveDesignApi;
  const root = vscode.workspace.workspaceFolders![0].uri;
  const index = vscode.Uri.joinPath(root, 'index.html');
  const about = vscode.Uri.joinPath(root, 'about.html');

  // ---- setup (not recorded) ----
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  await vscode.commands.executeCommand('workbench.action.closePanel');
  await vscode.commands.executeCommand('workbench.action.toggleFullScreen');
  await sleep(2500);
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(index));
  await vscode.commands.executeCommand('workbench.view.explorer');
  await sleep(1000);
  await vscode.commands.executeCommand('notifications.clearAll');
  fs.writeFileSync(path.join(DIR, 'ready'), '');
  await until(() => fs.existsSync(path.join(DIR, 'go')), 120000);
  await sleep(1500);

  let s!: LiveSession;
  const P = (a: Record<string, unknown>) => s.puppet(a);
  const C = (a: Record<string, unknown>) => api.css.puppet(a);
  const session = async (uri: vscode.Uri) => {
    const x = await until(() => api.provider.sessionsFor(uri)[0]);
    await x.waitForRender(1);
    return x;
  };
  const step = (ms = 1100) => sleep(ms);

  // 0. Find it: Extensions view, search "Live Design View", open its Marketplace page
  mark('install');
  await vscode.commands.executeCommand('workbench.view.extensions');
  await sleep(1500);
  await vscode.commands.executeCommand('workbench.extensions.search', 'Live Design View');
  await sleep(4500);
  await vscode.commands.executeCommand('extension.open', 'joshuamadrid.live-design-view').then(undefined, () => undefined);
  await sleep(5000);
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  await vscode.commands.executeCommand('workbench.view.explorer');
  await sleep(1200);

  // 1. Open in Design view (workspace layout appears)
  mark('design');
  await vscode.commands.executeCommand('liveDesign.liveView', index);
  s = await session(index);
  await sleep(2600);
  await vscode.commands.executeCommand('notifications.clearAll');
  await P({ op: 'show', x: 700, y: 420 });
  await step(600);

  // 0. Hover around the page (also used as the teaser)
  mark('hover');
  for (const sel of ['h1', 'p.lead', 'img', '.btn', '.nav a']) {
    await P({ op: 'move', page: true, sel });
    await step(1000);
  }

  // 2. Split view: code and page side by side
  mark('split');
  await vscode.commands.executeCommand('liveDesign.splitView', index);
  s = await session(index);
  await sleep(1800);
  await P({ op: 'show', x: 300, y: 300 });

  // 3. Select: page ↔ code ↔ Structure
  mark('select');
  for (const sel of ['h1', 'p.lead', 'img']) {
    await P({ op: 'click', page: true, sel });
    await step(1500);
  }

  // 4. Insert a paragraph after the intro
  mark('insert');
  await P({ op: 'click', page: true, sel: 'p.lead' });
  await step(1200);
  await P({ op: 'click', sel: '#ibItems .ib-item[aria-label="Paragraph"]' });
  await step(1300);
  await P({ op: 'click', sel: '#placeMenu button', text: 'After' });
  await step(1800);

  // 5. Edit its text inline
  mark('text');
  await P({ op: 'dblclick', page: true, sel: 'p.lead + p' });
  await step(900);
  await P({ op: 'type', page: true, sel: 'p.lead + p', selectAll: true, value: 'Made by hand, one lantern at a time.', cps: 14 });
  await step(3500);
  await P({ op: 'click', page: true, sel: 'h1' });
  await step(1400);

  // 6. Add a class on the selection chip; create its CSS rule
  mark('classes');
  await P({ op: 'click', page: true, sel: 'p.lead + p' });
  await step(1200);
  await P({ op: 'click', sel: '#hudAdd' });
  await step(700);
  await P({ op: 'type', sel: '#hudInput', glide: false, value: '.note', enter: true, cps: 8 });
  await step(2200);
  await P({ op: 'click', sel: '#hudRuleCreate' });
  await step(2200);

  // 7. Style it in the Styles panel
  mark('styles');
  await C({ op: 'show', x: 120, y: 120 });
  await C({ op: 'type', sel: 'input[data-focus-key="p:background-color"]', replace: true, value: '#f6e7cf', change: true, cps: 10 });
  await step(2400);
  await C({ op: 'type', sel: 'input[data-focus-key="u:padding-top"]', replace: true, value: '18', change: true, cps: 6 });
  await step(1800);
  await C({ op: 'click', sel: '[data-link="padding:all"]' });
  await step(1800);
  await C({ op: 'type', sel: 'input[data-focus-key="u:border-radius"]', replace: true, value: '12', change: true, cps: 6 });
  await step(1800);
  await C({ op: 'type', sel: 'input[data-focus-key="u:font-size"]', replace: true, value: '20', change: true, cps: 6 });
  await step(1800);
  await C({ op: 'hide' });

  // 8. Drag a padding handle on the page
  mark('handles');
  await P({ op: 'click', page: true, sel: 'p.note' });
  await step(1000);
  await P({ op: 'drag', sel: '#boxModel .bm-padding.editable', nth: 2, dy: 18, dur: 900 });
  await step(1800);

  // 9. Layout: flex row for the list, then Show all grid & flex, then the grid inspector
  mark('layout');
  await vscode.commands.executeCommand('liveDesign.liveView', index);
  s = await session(index);
  await sleep(1500);
  await P({ op: 'show', x: 600, y: 300 });
  await P({ op: 'click', page: true, sel: 'section.features ul' });
  await step(1200);
  await C({ op: 'show', x: 120, y: 200 });
  await C({ op: 'click', sel: '.seg button', text: 'Selection' });
  await step(1400);
  await C({ op: 'click', sel: '.ly-segbtn[aria-label="Horizontal"]' });
  await step(1200);
  await C({ op: 'click', sel: '.seg button', text: 'Page' });
  await step(2000);
  await C({ op: 'hide' });
  await P({ op: 'click', sel: '#toggleAllLayouts' });
  await step(2200);
  await P({ op: 'pointer', sel: '#layoutAll .la-badge', text: 'grid' });
  await step(2600);

  // 10. Components: shadcn/ui card, jQuery UI tabs (Interact to click a tab)
  mark('components');
  await P({ op: 'click', sel: '#ibTabs button', text: 'shadcn/ui' });
  await step(900);
  await P({ op: 'click', sel: '#ibSub button', text: 'Layout' });
  await step(900);
  await P({ op: 'click', sel: '#ibItems .ib-item[aria-label="Card"]' });
  await step(1100);
  await P({ op: 'click', sel: '#placeMenu button', text: 'After' });
  await step(2600);
  await P({ op: 'click', sel: '#ibTabs button', text: 'jQuery UI' });
  await step(900);
  await P({ op: 'click', sel: '#ibItems .ib-item[aria-label="Tabs"]' });
  await step(1100);
  await P({ op: 'click', sel: '#placeMenu button', text: 'After' });
  await step(3500);
  await P({ op: 'click', sel: '#toggleAllLayouts' });
  await step(600);
  await P({ op: 'click', sel: '#toggleInteract' });
  await step(900);
  await P({ op: 'click', page: true, sel: '[id^="Tabs"] a[href$="-2"]' });
  await step(1800);
  await P({ op: 'click', page: true, sel: '[id^="Tabs"] a[href$="-3"]' });
  await step(1800);

  // 11. Links: About opens in Design view; its Features link comes back
  mark('links');
  await P({ op: 'click', page: true, sel: '.nav a', text: 'About' });
  const a = await session(about);
  await sleep(1800);
  a.testAction({ kind: 'clickButton', selector: '#toggleInteract' });
  await a.puppet({ op: 'show', x: 500, y: 200 });
  await step(600);
  await a.puppet({ op: 'click', page: true, sel: '.nav a', text: 'Features' });
  await sleep(2600);
  s = await session(index);

  // 12. Test the contact form
  mark('form');
  await P({ op: 'show', x: 600, y: 300 });
  await P({ op: 'click', page: true, sel: '#email' });
  await step(600);
  await P({ op: 'type', page: true, sel: '#email', value: 'not-an-email', cps: 12 });
  await step(800);
  await P({ op: 'click', page: true, sel: '.contact button[type="submit"]' });
  await step(2600);
  await P({ op: 'type', page: true, sel: '#email', selectAll: true, value: 'jo@example.com', cps: 12 });
  await step(800);
  await P({ op: 'click', page: true, sel: '.contact button[type="submit"]' });
  await step(3200);
  await vscode.commands.executeCommand('notifications.clearAll');
  await P({ op: 'click', sel: '#toggleInteract' });
  await step(800);

  // 13. Audit: scores + markers
  mark('audit');
  await P({ op: 'click', sel: '#runAudit' });
  await step(4500);
  await P({ op: 'click', sel: '#auditMarks .audit-mark' });
  await step(2600);
  await P({ op: 'click', sel: '#auditClose' });
  await step(800);

  // 14. Code ↔ Design, save
  mark('wrap');
  await vscode.commands.executeCommand('liveDesign.codeView', index);
  await sleep(2200);
  await vscode.commands.executeCommand('liveDesign.liveView', index);
  s = await session(index);
  await sleep(1200);
  await vscode.commands.executeCommand('workbench.action.files.saveAll');
  await sleep(4000);
  mark('end');
  fs.writeFileSync(path.join(DIR, 'done'), '');
  await sleep(4000);
}
