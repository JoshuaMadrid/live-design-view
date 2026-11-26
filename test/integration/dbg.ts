// Debug: reproduce dropped Styles properties.
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { setup, install, session, sleep, file, done, DIR } from './tourkit';

export async function run(): Promise<void> {
  process.env.LD_DEBUG_CSS = path.join(DIR, 'css-msgs.txt');
  const index = file('index.html');
  await setup();
  const api = await install('canvas');
  await vscode.workspace.fs.writeFile(index, new TextEncoder().encode('<!DOCTYPE html>\n<html lang="en">\n<head>\n  <title>t</title>\n  <link rel="stylesheet" href="css/styles.css">\n</head>\n<body>\n  <ul class="strip"><li>a</li><li>b</li></ul>\n  <div class="hero-side"><div class="hero-cup"></div></div>\n</body>\n</html>\n'));
  await vscode.workspace.fs.writeFile(file('css/styles.css'), new TextEncoder().encode('.hero-side {\n  display: flex;\n  flex-direction: column;\n}\n'));
  await vscode.commands.executeCommand('liveDesign.splitView', index);
  const s = await session(api, index);
  await sleep(2000);
  const C = (a: Record<string, unknown>) => api.css.puppet(a);
  const log = (t: string) => fs.appendFileSync(path.join(DIR, 'css-msgs.txt'), `--- ${t}\n`);
  const props = async (list: [string, string][]) => {
    for (const [name, value] of list) {
      log(`type ${name}: ${value}`);
      await C({ op: 'type', sel: 'input[data-focus-key="new-prop"]', replace: true, value: name, cps: 40 }); await sleep(100);
      await C({ op: 'type', sel: 'input[data-focus-key="new-val"]', replace: true, value, enter: true, cps: 40 }); await sleep(300);
    }
  };
  await C({ op: 'click', sel: '.show-set input' }); await sleep(500);
  s.select(s.model.nodes.find((n) => n.tag === 'ul')!.id);
  await sleep(800);
  await C({ op: 'click', sel: 'button[aria-label^="Add a rule"]' }); await sleep(300);
  await C({ op: 'type', sel: 'input[data-focus-key="add-selector"]', replace: true, value: '.strip', enter: true, cps: 40 }); await sleep(1000);
  log('flow');
  await C({ op: 'click', sel: '.ly-segbtn[aria-label="Horizontal"]' }); await sleep(400);
  await props([['justify-content', 'space-around'], ['padding', '20px 40px']]);
  await sleep(1500);
  log('CSS1 ' + new TextDecoder().decode(await vscode.workspace.fs.readFile(file('css/styles.css'))));
  s.select(s.model.nodes.find((n) => n.attrs.some((a) => a.value === 'hero-cup'))!.id);
  await sleep(800);
  await C({ op: 'click', sel: 'button[aria-label^="Add a rule"]' }); await sleep(300);
  await C({ op: 'type', sel: 'input[data-focus-key="add-selector"]', replace: true, value: '.hero-cup', enter: true, cps: 40 }); await sleep(1000);
  await props([['flex-grow', '1'], ['min-height', '380px'], ['border-radius', '24px']]);
  await sleep(1500);
  log('CSS2 ' + new TextDecoder().decode(await vscode.workspace.fs.readFile(file('css/styles.css'))));
  done();
}
