// Practice 10, the Second Cup coffee shop home page, built only through Live Design View's UI:
// real Marketplace install, Canvas theme, then the Elements bar, the selection chip, Attributes and
// Styles. Nothing is typed into the code editor; the code side just follows along.
import * as vscode from 'vscode';
import type { LiveSession } from '../../src/liveEditorProvider';
import * as fs from 'fs';
import * as path from 'path';
import { setup, install, session, mark, sleep, file, done, DIR } from './tourkit';

type Props = [string, string][];

export async function run(): Promise<void> {
  const index = file('index.html');
  const fast = process.env.LD_TOUR_FAST ? 0.35 : 1;
  await setup();
  const api = await install('canvas');

  let s!: LiveSession;
  const P = (a: Record<string, unknown>) => s.puppet(a);
  const C = (a: Record<string, unknown>) => api.css.puppet(a);
  const A = (a: Record<string, unknown>) => api.properties.puppet(a);
  const pause = (ms = 900) => sleep(ms * fast);

  // --- the page and the chip --------------------------------------------------------------
  const click = async (sel: string, extra: Record<string, unknown> = {}) => { await P({ op: 'click', page: true, sel, ...extra }); await pause(700); };
  const item = async (label: string) => { await P({ op: 'click', sel: `#ibItems .ib-item[aria-label="${label}"]` }); await pause(600); };
  const insert = async (label: string, pos: 'Before' | 'After' | 'Inside' | 'Wrap') => {
    await item(label);
    await P({ op: 'click', sel: '#placeMenu button', text: pos });
    await pause(1300);
  };
  const edit = async (sel: string, text: string) => {
    await P({ op: 'dblclick', page: true, sel }); await pause(450);
    await P({ op: 'type', page: true, sel, selectAll: true, value: text, cps: 15 }); await pause(250);
    s.testAction({ kind: 'key', key: 'Enter' }); await pause(1100);
  };
  const addClass = async (name: string, rule: 'create' | 'skip' | 'none') => {
    await P({ op: 'click', sel: '#hudAdd' }); await pause(350);
    await P({ op: 'type', sel: '#hudInput', glide: false, value: name, enter: true, cps: 9 }); await pause(1300);
    if (rule === 'create') { await P({ op: 'click', sel: '#hudRuleCreate' }); await pause(1600); }
    if (rule === 'skip') { await P({ op: 'click', sel: '#hudRuleSkip' }); await pause(600); }
  };
  const dup = async (times = 1) => { for (let i = 0; i < times; i++) { await P({ op: 'click', sel: '#hudActions [data-op="duplicate"]' }); await pause(1300); } };

  // --- Attributes -------------------------------------------------------------------------
  const attr = async (key: string, value: string) => {
    await A({ op: 'type', sel: `input[data-key="${key}"]`, replace: true, value, change: true, cps: 14 });
    await pause(1000);
  };
  const parent = async (times = 1) => { for (let i = 0; i < times; i++) { await A({ op: 'click', sel: 'button[aria-label^="Select parent"]' }); await pause(900); } };
  const format = async (tag: string) => { await A({ op: 'click', sel: 'select[aria-label="Format"]', value: tag }); await pause(1300); };

  // --- Styles -----------------------------------------------------------------------------
  const props = async (list: Props) => {
    for (const [name, value] of list) {
      await C({ op: 'type', sel: 'input[data-focus-key="new-prop"]', replace: true, value: name, cps: 14 }); await pause(120);
      await C({ op: 'type', sel: 'input[data-focus-key="new-val"]', replace: true, value, enter: true, cps: 14 }); await pause(750);
      // Check the style sheet really got it (a dropped property is a bug worth knowing about).
      const want = `${name}: ${value};`;
      const css = async () => new TextDecoder().decode(await vscode.workspace.fs.readFile(file('css/styles.css'))).includes(want);
      const t0 = Date.now();
      while (!(await css()) && Date.now() - t0 < 4000) await sleep(200);
      if (!(await css())) fs.appendFileSync(path.join(DIR, 'misses.txt'), want + '\n');
    }
  };
  const newRule = async (selector: string, list: Props) => {
    await C({ op: 'click', sel: 'button[aria-label^="Add a rule"]' }); await pause(400);
    await C({ op: 'type', sel: 'input[data-focus-key="add-selector"]', replace: true, value: selector, enter: true, cps: 11 }); await pause(1200);
    await props(list);
  };
  const flow = async (dir: 'Horizontal' | 'Vertical') => { await C({ op: 'click', sel: `.ly-segbtn[aria-label="${dir}"]` }); await pause(1000); };

  // 1. A new page
  mark('files');
  await vscode.workspace.fs.writeFile(index, new Uint8Array());
  await pause(1000);
  await vscode.commands.executeCommand('liveDesign.splitView', index);
  s = await session(api, index);
  await pause(2000);
  await vscode.commands.executeCommand('workbench.action.closeSidebar');
  await vscode.commands.executeCommand('vscode.setEditorLayout', { orientation: 0, groups: [{ size: 0.3 }, { size: 0.7 }] });
  await pause(1200);
  await vscode.commands.executeCommand('notifications.clearAll');
  await P({ op: 'show', x: 600, y: 300 });

  // 2. Page setup: title, language, a new style sheet and the page's look (a body rule)
  mark('page-setup');
  await P({ op: 'click', sel: '#scaffoldBtn' });
  await pause(1400);
  const field = async (sel: string, value: string) => { await P({ op: 'type', sel, replace: true, value, cps: 12 }); await pause(500); };
  await field('#psTitle', 'Second Cup');
  await field('#psFont', 'Avenir, Helvetica, Arial, sans-serif');
  await field('#psSize', '18px');
  await field('#psColor', '#243A30');
  await field('#psBg', '#F7E1C3');
  await field('#psMargin', '0');
  await field('#psPadding', '24px');
  await pause(800);
  await P({ op: 'click', sel: '#psApply' });
  await pause(2600);
  await C({ op: 'show', x: 120, y: 120 });
  await C({ op: 'click', sel: '.show-set input' }); await pause(700);
  await C({ op: 'click', sel: '.cd-list .row .label', text: 'body' }); await pause(1000);
  await props([['box-sizing', 'border-box']]);
  await newRule('h1, h2, h3', [['margin', '0 0 16px'], ['line-height', '1.1']]);
  await newRule('p', [['margin', '0 0 16px'], ['line-height', '1.5']]);
  await newRule('ul, li', [['margin', '0'], ['padding', '0'], ['list-style', 'none']]);

  // 3. The nav: two links, the second wrapped in a list item and a list, then duplicated
  mark('nav');
  await click('body', { fx: 0.5, fy: 0.6 });
  await insert('Navigation', 'Inside');
  await newRule('nav', [['display', 'flex'], ['justify-content', 'space-between'], ['align-items', 'center'], ['padding', '10px 40px'],
    ['background-color', '#243A30'], ['border-radius', '24px'], ['margin-bottom', '16px']]);
  await edit('nav a:nth-of-type(1)', 'Second Cup');
  await click('nav a:nth-of-type(1)');
  await addClass('.logo', 'create');
  await props([['color', '#F7E1C3'], ['font-size', '30px'], ['font-weight', '900'], ['text-transform', 'uppercase'], ['letter-spacing', '2px'], ['text-decoration', 'none']]);
  await attr('href', 'index.html');
  await click('nav a:nth-of-type(2)');
  await insert('List Item', 'Wrap');
  await insert('Unordered List', 'Wrap');
  await addClass('.nav-links', 'create');
  await flow('Horizontal');
  await edit('.nav-links a', 'Home');
  await click('.nav-links a');
  await attr('href', 'index.html');
  await parent();
  await dup(2);
  await edit('.nav-links li:nth-child(2) a', 'About');
  await click('.nav-links li:nth-child(2) a');
  await attr('href', 'about.html');
  await edit('.nav-links li:nth-child(3) a', 'Shop');
  await click('.nav-links li:nth-child(3) a');
  await attr('href', 'product.html');
  await newRule('.nav-links li', [['margin-left', '40px']]);
  await newRule('.nav-links a', [['color', '#F7E1C3'], ['font-weight', '700'], ['text-transform', 'uppercase'], ['letter-spacing', '1px'], ['text-decoration', 'none']]);

  // 4. The hero: a text tile, and a column of photo and stat tiles
  mark('hero');
  await click('nav a.logo');
  await parent();
  await insert('Header', 'After');
  await addClass('.hero', 'create');
  await props([['display', 'flex'], ['justify-content', 'space-between'], ['margin-bottom', '16px']]);
  await click('.hero h1');
  await insert('Div', 'Wrap');
  await addClass('.hero-text', 'create');
  await props([['width', '50%'], ['box-sizing', 'border-box'], ['display', 'flex'], ['flex-direction', 'column'], ['justify-content', 'center'],
    ['padding', '64px'], ['background-color', '#243A30'], ['border-radius', '24px'], ['color', '#FFFFFF']]);
  await click('.hero h1');
  await insert('Paragraph', 'Before');
  await addClass('.hero-label', 'create');
  await props([['font-weight', '700'], ['text-transform', 'uppercase'], ['letter-spacing', '2px'], ['color', '#F7E1C3'], ['margin-bottom', '28px']]);
  await edit('.hero-label', 'Small batch, roasted in Kansas City');
  await edit('.hero h1', 'The coffee that starts you on the right foot');
  await newRule('.hero h1', [['font-size', '80px'], ['line-height', '1'], ['text-transform', 'uppercase'], ['margin-bottom', '28px']]);
  await click('.hero h1');
  await insert('Paragraph', 'After');
  await edit('.hero-text p:nth-of-type(2)', 'Warm, honest coffee for people who do their best thinking at a corner table. Pull up a chair, plug in, and stay a while.');
  await click('.hero-text p:nth-of-type(2)');
  await insert('Hyperlink', 'After');
  await insert('Paragraph', 'Wrap');
  await edit('.hero-text a', 'Find your roast');
  await click('.hero-text a');
  await attr('href', 'product.html');
  await addClass('.button', 'create');
  await props([['display', 'inline-block'], ['padding', '20px 44px'], ['background-color', '#DA4921'], ['color', '#FFFFFF'], ['font-weight', '900'],
    ['text-transform', 'uppercase'], ['text-decoration', 'none'], ['border-radius', '40px']]);
  await newRule('.button:hover', [['background-color', '#243A30']]);

  await click('.hero h1');
  await parent();
  await insert('Div', 'After');
  await addClass('.hero-side', 'create');
  await props([['width', '49%'], ['display', 'flex'], ['flex-direction', 'column']]);
  await insert('Div', 'Inside');
  await addClass('.hero-cup', 'create');
  await props([['flex-grow', '1'], ['min-height', '380px'], ['border-radius', '24px'], ['margin-bottom', '16px'],
    ['background-image', 'url(../images/hero-latte.png)'], ['background-size', 'cover'], ['background-position', 'center']]);
  await insert('Div', 'After');
  await addClass('.hero-small', 'create');
  await props([['display', 'flex'], ['justify-content', 'space-between']]);
  await insert('Div', 'Inside');
  await addClass('.hero-stat', 'create');
  await props([['width', '49%'], ['box-sizing', 'border-box'], ['padding', '40px 24px'], ['background-color', '#DA4921'], ['border-radius', '24px'],
    ['color', '#FFFFFF'], ['text-align', 'center']]);
  await insert('Paragraph', 'Inside');
  await edit('.hero-stat p', 'Roasted at');
  await click('.hero-stat p');
  await insert('Paragraph', 'After');
  await format('h2');
  await edit('.hero-stat h2', '7 AM');
  await click('.hero-stat h2');
  await insert('Paragraph', 'After');
  await edit('.hero-stat p:last-child', 'Small batches, every morning');
  await newRule('.hero-stat h2', [['font-size', '96px'], ['margin', '0']]);
  await newRule('.hero-stat p', [['margin', '0'], ['font-size', '16px'], ['font-weight', '700'], ['text-transform', 'uppercase'], ['letter-spacing', '2px']]);
  await click('.hero-stat h2');
  await parent();
  await insert('Div', 'After');
  await addClass('.hero-photo', 'create');
  await props([['width', '49%'], ['border-radius', '24px'], ['background-image', 'url(../images/croissant.png)'], ['background-size', 'cover'], ['background-position', 'center']]);

  // 5. The strip
  mark('strip');
  await click('.hero h1');
  await parent(2);
  await insert('Unordered List', 'After');
  await addClass('.strip', 'create');
  await flow('Horizontal');
  await props([['justify-content', 'space-around'], ['padding', '20px 40px'], ['background-color', '#E2C08D'], ['border-radius', '24px'], ['font-size', '20px'],
    ['font-weight', '900'], ['text-transform', 'uppercase'], ['letter-spacing', '2px'], ['margin-bottom', '16px']]);
  await click('.strip li:nth-child(2)');
  await dup(2);
  await edit('.strip li:nth-child(1)', 'Roasted daily');
  await edit('.strip li:nth-child(2)', 'Small batch');
  await edit('.strip li:nth-child(3)', 'Hand packed');
  await edit('.strip li:nth-child(4)', 'Good morning');

  // 6. Three blends: build one tile, duplicate it, change the copies' classes and text
  mark('blends');
  await parent();
  await insert('Section', 'After');
  await addClass('.blends', 'create');
  await flow('Horizontal');
  await props([['justify-content', 'space-between'], ['margin-bottom', '16px']]);
  await click('.blends h2');
  await insert('Div', 'Wrap');
  await addClass('.blend-green', 'skip');
  await edit('.blends h2', 'Espresso Blend');
  await click('.blends h2');
  await insert('Paragraph', 'After');
  await edit('.blend-green p', 'Dark and strong, with a little cocoa at the end. For the deadline that will not wait.');
  await click('.blend-green p');
  await insert('Hyperlink', 'After');
  await insert('Paragraph', 'Wrap');
  await edit('.blend-green a', 'Shop Espresso Blend');
  await click('.blend-green a');
  await attr('href', 'product.html');
  await click('.blend-green h2');
  await parent();
  await dup(2);
  await click('.blends > div:nth-child(2) h2');
  await parent();
  await attr('class', 'blend-rust');
  await click('.blends > div:nth-child(3) h2');
  await parent();
  await attr('class', 'blend-tan');
  await edit('.blend-rust h2', 'Premium Roast');
  await edit('.blend-rust p', 'Chocolate and toasted nuts. The one you order without looking.');
  await edit('.blend-rust a', 'Shop Premium Roast');
  await edit('.blend-tan h2', 'French Vanilla');
  await edit('.blend-tan p', 'Smooth and a little sweet, for slow starts and big ideas.');
  await edit('.blend-tan a', 'Shop French Vanilla');
  await newRule('.blend-green, .blend-rust, .blend-tan', [['width', '32.5%'], ['box-sizing', 'border-box'], ['padding', '32px'], ['border-radius', '24px']]);
  await newRule('.blend-green', [['background-color', '#243A30'], ['color', '#FFFFFF']]);
  await newRule('.blend-rust', [['background-color', '#DA4921'], ['color', '#FFFFFF']]);
  await newRule('.blend-tan', [['background-color', '#E2C08D']]);
  await newRule('.blends h2', [['font-size', '28px'], ['text-transform', 'uppercase'], ['margin-bottom', '12px']]);
  await newRule('.blends a', [['color', 'inherit'], ['font-weight', '700']]);

  // 7. Our story: an intro and three steps
  mark('story');
  await click('.blend-green h2');
  await parent(2);
  await insert('Section', 'After');
  await addClass('.story', 'create');
  await props([['display', 'flex'], ['justify-content', 'space-between'], ['align-items', 'flex-start'], ['padding', '96px 64px 40px'],
    ['background-color', '#243A30'], ['color', '#F7E1C3'], ['border-radius', '24px'], ['margin-bottom', '16px']]);
  await click('.story h2');
  await insert('Div', 'Wrap');
  await addClass('.story-intro', 'create');
  await props([['width', '34%']]);
  await click('.story h2');
  await insert('Paragraph', 'Before');
  await addClass('.story-label', 'create');
  await props([['font-size', '16px'], ['font-weight', '700'], ['letter-spacing', '3px'], ['text-transform', 'uppercase'], ['color', '#E2C08D']]);
  await edit('.story-label', 'Our story');
  await edit('.story h2', 'From bean to cup');
  await newRule('.story-intro h2', [['font-size', '96px'], ['line-height', '0.95'], ['text-transform', 'uppercase'], ['color', '#E2C08D']]);
  await click('.story h2');
  await insert('Paragraph', 'After');
  await edit('.story-intro p:last-child', 'Every cup at Second Cup starts with beans we roast in small batches every morning. We grind them fresh and brew every cup by hand.');
  await click('.story h2');
  await parent();
  await insert('Div', 'After');
  await addClass('.story-cards', 'create');
  await props([['width', '60%'], ['display', 'flex'], ['justify-content', 'space-between']]);
  await insert('Div', 'Inside');
  await addClass('.step', 'create');
  await props([['width', '31%'], ['margin-bottom', '56px']]);
  await insert('Image', 'Inside');
  await attr('src', 'images/beans-square.png');
  await attr('alt', 'Roasted coffee beans spilling out of a paper bag');
  await insert('Paragraph', 'After');
  await addClass('.step-number', 'create');
  await props([['font-size', '16px'], ['font-weight', '700'], ['letter-spacing', '3px'], ['color', '#E2C08D'], ['margin-bottom', '8px']]);
  await edit('.step-number', '01');
  await click('.step-number');
  await insert('Paragraph', 'After');
  await format('h3');
  await edit('.step h3', 'Beans');
  await click('.step h3');
  await insert('Paragraph', 'After');
  await edit('.step p:last-child', 'We roast in small batches every morning, so the beans are never more than a day old.');
  await newRule('.step img', [['display', 'block'], ['width', '100%'], ['height', 'auto'], ['border-radius', '16px'], ['margin-bottom', '20px']]);
  await newRule('.step h3', [['font-size', '32px'], ['color', '#FFFFFF'], ['margin-bottom', '8px']]);
  await click('.step h3');
  await parent();
  await dup(2);
  await click('.step:nth-child(2) img');
  await attr('src', 'images/grinder.png');
  await attr('alt', 'A hand grinder full of dark roasted beans');
  await edit('.step:nth-child(2) .step-number', '02');
  await edit('.step:nth-child(2) h3', 'Grinding');
  await edit('.step:nth-child(2) p:last-child', 'Every batch is ground fresh, right before it goes into the cup.');
  await click('.step:nth-child(3) img');
  await attr('src', 'images/brewed-coffee.png');
  await attr('alt', 'A fresh cup of coffee, still steaming, on a wooden table');
  await edit('.step:nth-child(3) .step-number', '03');
  await edit('.step:nth-child(3) h3', 'Brewing');
  await edit('.step:nth-child(3) p:last-child', 'Brewed by hand and poured the way you like it. The last step is yours.');

  // 8. The split band
  mark('split');
  await click('.story-intro h2');
  await parent(2);
  await insert('Section', 'After');
  await addClass('.split', 'create');
  await props([['display', 'flex'], ['border-radius', '24px'], ['overflow', 'hidden'], ['margin-bottom', '16px']]);
  await click('.split h2');
  await insert('Div', 'Wrap');
  await addClass('.half-tan', 'skip');
  await click('.split h2');
  await insert('Paragraph', 'Before');
  await addClass('.split-label', 'create');
  await props([['font-size', '14px'], ['font-weight', '700'], ['text-transform', 'uppercase'], ['letter-spacing', '2px'], ['margin-bottom', '8px']]);
  await edit('.split-label', 'From the journal');
  await edit('.split h2', 'Better mornings');
  await click('.split h2');
  await insert('Paragraph', 'After');
  await edit('.half-tan p:nth-of-type(2)', 'Five small habits that make the first cup of the day the best one.');
  await click('.half-tan p:nth-of-type(2)');
  await insert('Hyperlink', 'After');
  await insert('Paragraph', 'Wrap');
  await edit('.half-tan a', 'Read the journal');
  await click('.half-tan a');
  await addClass('.button', 'none');
  await click('.split h2');
  await parent();
  await dup();
  await click('.split > div:nth-child(2) h2');
  await parent();
  await attr('class', 'half-rust');
  await edit('.half-rust .split-label', 'Come say hi');
  await edit('.half-rust h2', 'Where to find us');
  await edit('.half-rust p:nth-of-type(2)', 'Our corner shop is on Main Street in Kansas City, open every day from 7 to 4.');
  await edit('.half-rust a', 'See the map');
  await newRule('.half-tan, .half-rust', [['width', '50%'], ['box-sizing', 'border-box'], ['padding', '64px 48px']]);
  await newRule('.half-tan', [['background-color', '#E2C08D']]);
  await newRule('.half-rust', [['background-color', '#DA4921'], ['color', '#FFFFFF']]);
  await newRule('.split h2', [['font-size', '48px'], ['text-transform', 'uppercase']]);
  await newRule('.half-rust .button', [['background-color', '#243A30']]);

  // 9. The footer: a brand block and three columns of links
  mark('footer');
  await click('.half-tan h2');
  await parent(2);
  await insert('Footer', 'After');
  await addClass('.site-footer', 'create');
  await props([['background-color', '#243A30'], ['color', '#F7E1C3'], ['padding', '56px 40px 24px'], ['border-radius', '24px']]);
  await edit('footer p', 'Small batch coffee, roasted in Kansas City.');
  await click('footer p');
  await insert('Div', 'Wrap');
  await addClass('.brand', 'create');
  await props([['width', '28%']]);
  await insert('Div', 'Wrap');
  await addClass('.footer-top', 'create');
  await props([['display', 'flex'], ['justify-content', 'space-between']]);
  await click('.brand p');
  await insert('Paragraph', 'Before');
  await format('h3');
  await edit('.brand h3', 'Second Cup');
  await click('.brand h3');
  await parent();
  await insert('Div', 'After');
  await addClass('.footer-col', 'create');
  await props([['width', '16%']]);
  await insert('Paragraph', 'Inside');
  await format('h4');
  await edit('.footer-col h4', 'Shop');
  await click('.footer-col h4');
  await insert('Hyperlink', 'After');
  await insert('Paragraph', 'Wrap');
  await edit('.footer-col a', 'Espresso Blend');
  await click('.footer-col a');
  await attr('href', 'product.html');
  await parent();
  await dup(2);
  await edit('.footer-col p:nth-of-type(2) a', 'French Vanilla');
  await edit('.footer-col p:nth-of-type(3) a', 'Premium Roast');
  await click('.footer-col h4');
  await parent();
  await dup(2);
  await edit('.footer-col:nth-child(3) h4', 'Company');
  await edit('.footer-col:nth-child(3) p:nth-of-type(1) a', 'About us');
  await edit('.footer-col:nth-child(3) p:nth-of-type(2) a', 'Journal');
  await edit('.footer-col:nth-child(3) p:nth-of-type(3) a', 'Visit us');
  await edit('.footer-col:nth-child(4) h4', 'Help');
  await edit('.footer-col:nth-child(4) p:nth-of-type(1) a', 'Shipping');
  await edit('.footer-col:nth-child(4) p:nth-of-type(2) a', 'Returns');
  await edit('.footer-col:nth-child(4) p:nth-of-type(3) a', 'Contact');
  for (const [col, n, href] of [[3, 1, 'about.html'], [3, 2, 'index.html'], [3, 3, 'about.html'], [4, 1, '#'], [4, 2, '#'], [4, 3, '#']] as const) {
    await click(`.footer-col:nth-child(${col}) p:nth-of-type(${n}) a`);
    await attr('href', href);
  }
  await click('.brand h3');
  await parent(2);
  await insert('Paragraph', 'After');
  await addClass('.legal', 'create');
  await props([['margin-top', '40px'], ['padding-top', '16px'], ['border-top', '1px solid #F7E1C3'], ['font-size', '12px']]);
  await edit('.legal', 'Copyright 2026 Second Cup. All rights reserved.');
  await newRule('.site-footer a', [['color', '#F7E1C3'], ['text-decoration', 'none']]);
  await newRule('.footer-col p', [['margin', '0 0 8px']]);

  // 10. Look it over
  mark('check');
  await vscode.commands.executeCommand('workbench.action.files.saveAll');
  await C({ op: 'hide' });
  s.testAction({ kind: 'scroll', y: 0 }); await pause(2200);
  for (const y of [600, 1200, 1800, 2600]) { s.testAction({ kind: 'scroll', y }); await pause(2200); }
  s.testAction({ kind: 'scroll', y: 0 }); await pause(1500);
  await P({ op: 'click', sel: '#toggleInteract' }); await pause(500);
  await P({ op: 'move', page: true, sel: 'a.button' }); await pause(2000);
  done();
  await sleep(3000);
}
