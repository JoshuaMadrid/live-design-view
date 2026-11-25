// Practice 10, the coffee home page (Forte), built with Live Design View: real Marketplace install,
// Canvas theme, structure from the Elements bar, classes from the selection chip, styling in Styles.
import * as vscode from 'vscode';
import type { LiveSession } from '../../src/liveEditorProvider';
import { setup, install, session, mark, sleep, file, editorFor, typeAt, replaceText, insertAfter, done } from './tourkit';

export async function run(): Promise<void> {
  const index = file('index.html');
  const css = file('css/styles.css');
  await setup();
  const api = await install('canvas');

  let s!: LiveSession;
  const P = (a: Record<string, unknown>) => s.puppet(a);
  const C = (a: Record<string, unknown>) => api.css.puppet(a);
  const pause = (ms = 900) => sleep(ms);
  const click = async (sel: string, extra: Record<string, unknown> = {}) => { await P({ op: 'click', page: true, sel, ...extra }); await pause(800); };
  const item = async (label: string) => { await P({ op: 'click', sel: `#ibItems .ib-item[aria-label="${label}"]` }); await pause(700); };
  const place = async (pos: string) => { await P({ op: 'click', sel: '#placeMenu button', text: pos }); await pause(1400); };
  const insert = async (label: string, pos: string) => { await item(label); await place(pos); };
  const tab = async (name: string) => { await P({ op: 'click', sel: '#ibTabs button', text: name }); await pause(500); };
  const edit = async (sel: string, text: string, cps = 24) => {
    await P({ op: 'dblclick', page: true, sel }); await pause(500);
    await P({ op: 'type', page: true, sel, selectAll: true, value: text, cps }); await pause(300);
    s.testAction({ kind: 'key', key: 'Enter' }); await pause(1300);
  };
  const addClass = async (name: string, rule: 'create' | 'skip' | 'none') => {
    await P({ op: 'click', sel: '#hudAdd' }); await pause(400);
    await P({ op: 'type', sel: '#hudInput', glide: false, value: name, enter: true, cps: 9 }); await pause(1500);
    if (rule === 'create') { await P({ op: 'click', sel: '#hudRuleCreate' }); await pause(1900); }
    if (rule === 'skip') { await P({ op: 'click', sel: '#hudRuleSkip' }); await pause(700); }
  };
  const id = (pred: (n: LiveSession['model']['nodes'][number]) => boolean) => s.model.nodes.find(pred)!.id;
  const hasClass = (c: string) => (n: LiveSession['model']['nodes'][number]) => n.attrs.some((a) => a.name === 'class' && a.value.split(/\s+/).includes(c));
  const pick = async (pageSel: string, nodeId: number) => { await P({ op: 'move', page: true, sel: pageSel }); s.select(nodeId, { scrollCanvas: true }); await pause(1000); };
  const attr = async (name: string, value: string) => { await s.setAttr(s.selectedId!, name, value); await pause(700); };
  const prop = async (key: string, value: string) => { await C({ op: 'type', sel: `input[data-focus-key="${key}"]`, replace: true, value, change: true, cps: 12 }); await pause(1100); };
  const addProp = async (name: string, value: string) => {
    await C({ op: 'type', sel: 'input[data-focus-key="new-prop"]', replace: true, value: name, cps: 16 }); await pause(200);
    await C({ op: 'type', sel: 'input[data-focus-key="new-val"]', replace: true, value, enter: true, cps: 16 }); await pause(1300);
  };
  const rule = async (selector: string) => { await C({ op: 'click', sel: '.cd-list .row .label', text: selector }); await pause(1200); };
  const cssTyping = async (anchor: string | null, text: string) => {
    const ed = await editorFor(css);
    await vscode.window.showTextDocument(ed.document, { viewColumn: vscode.ViewColumn.One, preview: false });
    const e2 = vscode.window.activeTextEditor!;
    if (anchor === null) await typeAt(e2, e2.document.getText().length, text, 160);
    else await insertAfter(e2, anchor, text, undefined, 160);
    await e2.document.save();
    await pause(1500);
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(index), { viewColumn: vscode.ViewColumn.One, preview: false });
    await pause(600);
  };

  // 1. New files: index.html and css/styles.css
  mark('files');
  await vscode.workspace.fs.writeFile(index, new Uint8Array());
  await vscode.workspace.fs.writeFile(css, new Uint8Array());
  await pause(1200);
  await vscode.commands.executeCommand('liveDesign.splitView', index);
  s = await session(api, index);
  await pause(2000);
  // More room for the page: hide the file list, narrow the code column.
  await vscode.commands.executeCommand('workbench.action.closeSidebar');
  await vscode.commands.executeCommand('vscode.setEditorLayout', { orientation: 0, groups: [{ size: 0.3 }, { size: 0.7 }] });
  await pause(1200);
  await vscode.commands.executeCommand('notifications.clearAll');
  await P({ op: 'show', x: 600, y: 300 });
  await P({ op: 'click', sel: '#scaffoldBtn' });
  await pause(2200);

  // 2. The head: title, description, favicon, fonts, stylesheet
  mark('head');
  await replaceText(await editorFor(index), 'Untitled Document', 'Forte Coffee &middot; Start on the right foot', undefined, 30);
  await insertAfter(await editorFor(index), '</title>', '\n  <meta name="description" content="Bright, bold beans for people who do their best thinking at a corner table. Three roasts, fresh every morning.">\n  <link rel="icon" href="images/favicon.svg">\n', undefined, 60);
  await insertAfter(await editorFor(index), '<link rel="icon" href="images/favicon.svg">\n', '\n  <link rel="preconnect" href="https://fonts.googleapis.com">\n  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n  <link href="https://fonts.googleapis.com/css2?family=League+Spartan:wght@800;900&display=swap" rel="stylesheet">\n\n  <link rel="stylesheet" href="css/styles.css">', undefined, 160);
  await pause(1200);

  // 3. Base CSS: colours, type, images
  mark('base-css');
  await cssTyping(null, `:root {
  --cream: #F1EFC5;
  --dark: #343131;
  --orange: #EB5E3A;
  --line: 3px solid #343131;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  background-color: var(--cream);
  color: var(--dark);
  font-family: 'League Spartan', sans-serif;
  font-weight: 800;
  font-size: 20px;
  line-height: 1.5;
}

h1, h2 {
  font-weight: 900;
  text-transform: uppercase;
  line-height: 1;
  text-wrap: balance;
}

h1 { font-size: 72px; }
h2 { font-size: 48px; margin-bottom: 32px; }

h3 {
  font-size: 30px;
  font-weight: 900;
  text-transform: uppercase;
  text-wrap: balance;
}

img {
  width: 100%;
  height: auto;
  display: block;
}

.pill {
  display: inline-block;
  padding: 4px 16px;
  border-radius: 999px;
  background-color: var(--dark);
  color: var(--cream);
  font-size: 16px;
}
`);

  // 4. The header and nav
  mark('header');
  await insertAfter(await editorFor(index), '<body>', `

<header class="site-header">
  <a class="logo" href="index.html">
    <img src="images/logo-light.svg" width="162" height="78" alt="Forte Coffee">
  </a>
  <nav>
    <ul>
      <li><a href="index.html" aria-current="page">Home</a></li>
      <li><a href="about.html">About</a></li>
      <li><a href="product.html">Shop</a></li>
    </ul>
  </nav>
</header>`, undefined, 160);
  await cssTyping(null, `
.site-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 48px;
  background-color: var(--orange);
}

.logo {
  width: 150px;
}

nav ul {
  display: flex;
  gap: 32px;
  list-style: none;
}

nav a {
  color: #FFFFFF;
  text-decoration: none;
}

nav a:hover,
nav a[aria-current="page"] {
  color: var(--dark);
}
`);
  s = await session(api, index);
  await pause(1200);
  await P({ op: 'show', x: 500, y: 200 });

  // 5. The hero, from the Elements bar
  mark('hero');
  await click('header.site-header', { fy: 0.1, fx: 0.4 });
  await insert('Section', 'After');
  await addClass('.hero', 'create');
  await click('section.hero h2');
  await insert('Div', 'Wrap');
  await addClass('.hero-text', 'skip');
  await vscode.commands.executeCommand('liveDesign.dom.changeTag', { id: id((n) => n.tag === 'h2' && !!n.parent && hasClass('hero-text')(s.model.nodes[n.parent])) }, 'h1');
  await pause(1200);
  await edit('.hero-text h1', 'The coffee that starts you on the right foot');
  await click('.hero-text h1');
  await insert('Paragraph', 'After');
  await edit('.hero-text p', 'Bright, bold beans for people who do their best thinking at a corner table. Pull up a chair, plug in, and stay a while.', 40);
  await click('.hero-text p');
  await insert('Hyperlink', 'After');
  await edit('.hero-text a', 'Find your roast');
  await addClass('.button', 'create');
  await attr('href', 'product.html');
  await pick('.hero-text', id(hasClass('hero-text')));
  await insert('Image', 'After');
  await attr('src', 'images/cups-tall.png');
  await attr('alt', 'Two blue Good Morning cups of Forte Coffee, with the lids popping off');
  // the two orange words
  await replaceText(await editorFor(index), 'right foot</h1>', '<span class="accent">right foot</span></h1>', undefined, 30);
  await pause(800);

  // 6. Style the hero and the button in the Styles panel
  mark('hero-styles');
  await C({ op: 'show', x: 120, y: 120 });
  await C({ op: 'click', sel: '.show-set input' });
  await pause(800);
  await rule('.hero');
  await C({ op: 'click', sel: '.ly-segbtn[aria-label="Grid"]' }); await pause(1300);
  await addProp('grid-template-columns', '1fr 1fr');
  await prop('ly-gap', '48');
  await addProp('align-items', 'center');
  await prop('u:padding-top', '48');
  await C({ op: 'click', sel: '[data-link="padding:all"]' }); await pause(1300);
  await rule('.button');
  await addProp('display', 'inline-block');
  await prop('u:padding-top', '14');
  await C({ op: 'click', sel: '[data-link="padding:y"]' }); await pause(1000);
  await prop('u:padding-left', '28');
  await C({ op: 'click', sel: '[data-link="padding:x"]' }); await pause(1000);
  await prop('u:border-radius', '16');
  await prop('p:background-color', 'var(--orange)');
  await prop('p:color', '#FFFFFF');
  await addProp('text-decoration', 'none');
  await C({ op: 'hide' });

  // 7. Our blends: three cards
  mark('beans');
  await pick('section.hero', id(hasClass('hero')));
  await insert('Section', 'After');
  await addClass('.beans', 'skip');
  await edit('section.beans h2', 'Our blends');
  await click('section.beans h2');
  await insert('Div', 'After');
  await addClass('.bean-row', 'create');
  await C({ op: 'click', sel: '.ly-segbtn[aria-label="Horizontal"]' }); await pause(1200);
  await prop('ly-gap', '32');
  await insert('Article', 'Inside');
  await addClass('.bean', 'create');
  await vscode.commands.executeCommand('liveDesign.dom.changeTag', { id: id((n) => n.tag === 'h2' && !!n.parent && hasClass('bean')(s.model.nodes[n.parent])) }, 'h3');
  await pause(1200);
  await edit('article.bean h3', 'Espresso Blend');
  await click('article.bean h3');
  await insert('Image', 'Before');
  await attr('src', 'images/espresso-blend.jpg');
  await attr('alt', 'A box of Espresso Blend K-Cups');
  await click('article.bean h3');
  await insert('Paragraph', 'After');
  await addClass('.pill', 'none');
  await edit('article.bean p.pill', 'Dark roast');
  await edit('article.bean p:last-child', 'Dark and strong, with a little cocoa at the end. For the deadline that will not wait.', 40);
  await addProp('flex', '1');
  await prop('u:padding-top', '24');
  await C({ op: 'click', sel: '[data-link="padding:all"]' }); await pause(1000);
  await prop('p:border', 'var(--line)');
  await prop('u:border-radius', '16');
  // two more cards
  await click('article.bean', { fy: 0.02 });
  await P({ op: 'click', sel: '#hudActions [data-op="duplicate"]' }); await pause(1500);
  await P({ op: 'click', sel: '#hudActions [data-op="duplicate"]' }); await pause(1500);
  await edit('article.bean:nth-child(2) h3', 'Premium Roast');
  await edit('article.bean:nth-child(2) p.pill', 'Medium roast');
  await edit('article.bean:nth-child(2) p:last-child', 'Chocolate and toasted nuts. The one you order without looking.', 40);
  await click('article.bean:nth-child(2) img');
  await attr('src', 'images/premium-roast.jpg');
  await attr('alt', 'A box of Premium Roast K-Cups');
  await edit('article.bean:nth-child(3) h3', 'French Vanilla');
  await edit('article.bean:nth-child(3) p.pill', 'Flavored');
  await edit('article.bean:nth-child(3) p:last-child', 'Smooth and a little sweet, for slow starts and big ideas.', 40);
  await click('article.bean:nth-child(3) img');
  await attr('src', 'images/french-vanilla.jpg');
  await attr('alt', 'A box of French Vanilla K-Cups');

  // 8. Hours and the footer
  mark('visit');
  await pick('section.beans', id(hasClass('beans')));
  await insert('Section', 'After');
  await addClass('.visit', 'skip');
  await edit('section.visit h2', 'Come in');
  await click('section.visit h2');
  await insert('Unordered List', 'After');
  await addClass('.hours', 'skip');
  await edit('ul.hours li:nth-child(1)', 'Monday to Friday, 7 to 3');
  await edit('ul.hours li:nth-child(2)', 'Saturday and Sunday, 8 to 3');
  await pick('ul.hours', id(hasClass('hours')));
  await insert('Paragraph', 'After');
  await edit('section.visit p', 'Plugs at every table. Bring your laptop.');
  await pick('section.visit', id(hasClass('visit')));
  await tab('HTML');
  await insert('Footer', 'After');
  await addClass('.site-footer', 'skip');
  await edit('footer p', 'Forte Coffee · Open every day, 7 to 3');
  await click('footer p');
  await insert('Paragraph', 'After');
  await edit('footer p:last-child', 'Forte is a concept brand for a class practice.');

  // 9. The rest of the CSS
  mark('more-css');
  await cssTyping(null, `
.hero h1 {
  margin: 24px 0;
}

.accent {
  color: var(--orange);
}

.hero p {
  max-width: 30em;
  margin-bottom: 32px;
}

.button:hover {
  background-color: var(--dark);
}

.beans {
  padding: 64px 48px;
}

.bean h3 {
  margin: 16px 0 8px;
}

.bean .pill {
  margin-bottom: 12px;
}

.visit {
  padding: 0 48px 64px;
}

.hours {
  list-style: none;
  font-size: 28px;
  margin-bottom: 16px;
}

.site-footer {
  display: flex;
  justify-content: space-between;
  padding: 24px 48px;
  background-color: var(--dark);
  color: var(--cream);
  font-size: 16px;
}

a:focus-visible,
button:focus-visible {
  outline: 3px solid var(--orange);
  outline-offset: 4px;
}
`);

  // 10. Look it over
  mark('check');
  await vscode.commands.executeCommand('workbench.action.files.saveAll');
  s = await session(api, index);
  await P({ op: 'click', sel: '#toggleBox' }); await pause(400);
  s.testAction({ kind: 'scroll', y: 0 }); await pause(2200);
  s.testAction({ kind: 'scroll', y: 700 }); await pause(2500);
  s.testAction({ kind: 'scroll', y: 1400 }); await pause(2500);
  s.testAction({ kind: 'scroll', y: 0 }); await pause(1500);
  await P({ op: 'click', sel: '#toggleInteract' }); await pause(500);
  await P({ op: 'move', page: true, sel: '.site-header nav a', text: 'About' }); await pause(1200);
  await P({ op: 'move', page: true, sel: 'a.button' }); await pause(2000);
  done();
  await sleep(3000);
}
