// Practice 10, the Second Cup coffee shop home page, built with Live Design View: real Marketplace install,
// Canvas theme, structure from the Elements bar, classes from the selection chip, styling in Styles.
import * as vscode from 'vscode';
import type { LiveSession } from '../../src/liveEditorProvider';
import { setup, install, session, mark, sleep, file, editorFor, typeAt, replaceText, insertAfter, done } from './tourkit';

export async function run(): Promise<void> {
  const index = file('index.html');
  const css = file('styles.css');
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

  // 1. New files: index.html and styles.css
  mark('files');
  await vscode.workspace.fs.writeFile(index, new Uint8Array());
  await vscode.workspace.fs.writeFile(css, new Uint8Array());
  await pause(1200);
  await vscode.commands.executeCommand('liveDesign.splitView', index);
  s = await session(api, index);
  await pause(2000);
  await vscode.commands.executeCommand('workbench.action.closeSidebar');
  await vscode.commands.executeCommand('vscode.setEditorLayout', { orientation: 0, groups: [{ size: 0.3 }, { size: 0.7 }] });
  await pause(1200);
  await vscode.commands.executeCommand('notifications.clearAll');
  await P({ op: 'show', x: 600, y: 300 });
  await P({ op: 'click', sel: '#scaffoldBtn' });
  await pause(2200);

  // 2. Title and the style sheet link
  mark('head');
  await replaceText(await editorFor(index), 'Untitled Document', 'Second Cup', undefined, 20);
  await insertAfter(await editorFor(index), '</title>', '\n  <link href="styles.css" rel="stylesheet">', undefined, 40);
  await (await editorFor(index)).document.save();
  await pause(1000);

  // 3. Base styles and the nav
  mark('base-css');
  await cssTyping(null, `body {
  margin: 0;
  padding: 24px;
  box-sizing: border-box;
  font-size: 18px;
  font-family: Avenir, Helvetica, Arial, sans-serif;
  background-color: #F7E1C3;
  color: #243A30;
}
h1, h2, h3 {
  margin: 0 0 16px;
  line-height: 1.1;
}
p {
  margin: 0 0 16px;
  line-height: 1.5;
}
ul, li {
  margin: 0;
  padding: 0;
  list-style: none;
}
nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 40px;
  background-color: #243A30;
  border-radius: 24px;
  margin-bottom: 16px;
}
.logo {
  color: #F7E1C3;
  font-size: 30px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 2px;
  text-decoration: none;
}
.nav-links {
  display: flex;
}
.nav-links li {
  margin-left: 40px;
}
.nav-links a {
  color: #F7E1C3;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  text-decoration: none;
}
`);
  mark('nav-hero');
  await insertAfter(await editorFor(index), '<body>', `
<nav>
  <a href="index.html" class="logo">Second Cup</a>
  <ul class="nav-links">
    <li><a href="index.html">Home</a></li>
    <li><a href="about.html">About</a></li>
    <li><a href="product.html">Shop</a></li>
  </ul>
</nav>
<header class="hero">
  <div class="hero-text">
    <p class="hero-label">Small batch, roasted in Kansas City</p>
    <h1>Heading</h1>
    <p>Warm, honest coffee for people who do their best thinking at a corner table. Pull up a chair, plug in, and stay a while.</p>
    <p><a href="product.html" class="button">Find your roast</a></p>
  </div>
  <div class="hero-side">
    <div class="hero-cup"></div>
    <div class="hero-small">
      <div class="hero-stat">
        <p>Roasted at</p>
        <h2>7 AM</h2>
        <p>Small batches, every morning</p>
      </div>
      <div class="hero-photo"></div>
    </div>
  </div>
</header>`, undefined, 160);
  await (await editorFor(index)).document.save();
  await cssTyping(null, `.hero {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16px;
}
.hero-text {
  width: 50%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 64px;
  background-color: #243A30;
  border-radius: 24px;
  color: #FFFFFF;
}
.hero-label {
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: #F7E1C3;
  margin-bottom: 28px;
}
.hero h1 {
  font-size: 80px;
  line-height: 1;
  text-transform: uppercase;
  margin-bottom: 28px;
}
.button {
  display: inline-block;
  padding: 20px 44px;
  background-color: #DA4921;
  color: #FFFFFF;
  font-weight: 900;
  text-transform: uppercase;
  text-decoration: none;
  border-radius: 40px;
}
.button:visited {
  color: #FFFFFF;
}
.button:hover {
  background-color: #243A30;
}
.button:focus {
  outline: 3px solid #243A30;
}
.button:active {
  background-color: #000000;
}
.hero-side {
  width: 49%;
  display: flex;
  flex-direction: column;
}
.hero-cup {
  flex-grow: 1;
  min-height: 380px;
  border-radius: 24px;
  margin-bottom: 16px;
  background-image: url(images/hero-latte.png);
  background-size: cover;
  background-position: center;
}
.hero-small {
  display: flex;
  justify-content: space-between;
}
.hero-stat {
  width: 49%;
  box-sizing: border-box;
  padding: 40px 24px;
  background-color: #DA4921;
  border-radius: 24px;
  color: #FFFFFF;
  text-align: center;
}
.hero-stat h2 {
  font-size: 96px;
  margin: 0;
}
.hero-stat p {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 2px;
}
.hero-photo {
  width: 49%;
  border-radius: 24px;
  background-image: url(images/croissant.png);
  background-size: cover;
  background-position: center;
}
`);
  s = await session(api, index);
  await P({ op: 'show', x: 700, y: 300 });
  // the headline, typed on the page
  await edit('.hero h1', 'The coffee that starts you on the right foot');

  // 4. The strip, from the Elements bar
  mark('strip');
  await pick('header.hero', id(hasClass('hero')));
  await insert('Unordered List', 'After');
  await addClass('.strip', 'create');
  await edit('ul.strip li:nth-child(1)', 'Roasted daily');
  await edit('ul.strip li:nth-child(2)', 'Small batch');
  await click('ul.strip li:nth-child(2)');
  await P({ op: 'click', sel: '#hudActions [data-op="duplicate"]' }); await pause(1400);
  await P({ op: 'click', sel: '#hudActions [data-op="duplicate"]' }); await pause(1400);
  await edit('ul.strip li:nth-child(3)', 'Hand packed');
  await edit('ul.strip li:nth-child(4)', 'Good morning');
  await pick('ul.strip', id(hasClass('strip')));
  await C({ op: 'show', x: 120, y: 120 });
  await C({ op: 'click', sel: '.show-set input' }); await pause(800);
  await rule('.strip');
  await C({ op: 'click', sel: '.ly-segbtn[aria-label="Horizontal"]' }); await pause(1200);
  await addProp('justify-content', 'space-around');
  await prop('u:padding-top', '20');
  await C({ op: 'click', sel: '[data-link="padding:y"]' }); await pause(900);
  await prop('u:padding-left', '40');
  await C({ op: 'click', sel: '[data-link="padding:x"]' }); await pause(900);
  await prop('p:background-color', '#E2C08D');
  await prop('u:border-radius', '24');
  await addProp('font-size', '20px');
  await addProp('font-weight', '900');
  await addProp('text-transform', 'uppercase');
  await addProp('letter-spacing', '2px');
  await addProp('margin-bottom', '16px');

  // 5. The blends: a section from the Elements bar, three tiles
  mark('blends');
  await insert('Section', 'After');
  await addClass('.blends', 'create');
  await rule('.blends');
  await C({ op: 'click', sel: '.ly-segbtn[aria-label="Horizontal"]' }); await pause(1200);
  await addProp('justify-content', 'space-between');
  await addProp('margin-bottom', '16px');
  await C({ op: 'hide' });
  await replaceText(await editorFor(index), '<h2>Section heading</h2>', `<div class="blend-green"><h2>Espresso Blend</h2><p>Dark and strong, with a little cocoa at the end. For the deadline that will not wait.</p><p><a href="product.html">Shop Espresso Blend</a></p></div>
  <div class="blend-rust"><h2>Premium Roast</h2><p>Chocolate and toasted nuts. The one you order without looking.</p><p><a href="product.html">Shop Premium Roast</a></p></div>
  <div class="blend-tan"><h2>French Vanilla</h2><p>Smooth and a little sweet, for slow starts and big ideas.</p><p><a href="product.html">Shop French Vanilla</a></p></div>`, 'class="blends"', 160);
  await (await editorFor(index)).document.save();
  await cssTyping(null, `.blend-green, .blend-rust, .blend-tan {
  width: 32.5%;
  box-sizing: border-box;
  padding: 32px;
  border-radius: 24px;
}
.blend-green {
  background-color: #243A30;
  color: #FFFFFF;
}
.blend-rust {
  background-color: #DA4921;
  color: #FFFFFF;
}
.blend-tan {
  background-color: #E2C08D;
}
.blends h2 {
  font-size: 28px;
  text-transform: uppercase;
  margin-bottom: 12px;
}
.blends a {
  color: inherit;
  font-weight: 700;
}
`);

  // 6. Our story, the split band and the footer
  mark('story');
  await insertAfter(await editorFor(index), '</section>', `
<section class="story">
  <div class="story-intro">
    <p class="story-label">Our story</p>
    <h2>From bean<br>to cup</h2>
    <p>Every cup at Second Cup starts with beans we roast in small batches every morning. We grind them fresh and brew every cup by hand.</p>
  </div>
  <div class="story-cards">
    <div class="step"><img src="images/beans-square.png" alt="Roasted coffee beans spilling out of a paper bag"><p class="step-number">01</p><h3>Beans</h3><p>We roast in small batches every morning, so the beans are never more than a day old.</p></div>
    <div class="step"><img src="images/grinder.png" alt="A hand grinder full of dark roasted beans"><p class="step-number">02</p><h3>Grinding</h3><p>Every batch is ground fresh, right before it goes into the cup.</p></div>
    <div class="step"><img src="images/brewed-coffee.png" alt="A fresh cup of coffee, still steaming, on a wooden table"><p class="step-number">03</p><h3>Brewing</h3><p>Brewed by hand and poured the way you like it. The last step is yours.</p></div>
  </div>
</section>
<section class="split">
  <div class="half-tan"><p class="split-label">From the journal</p><h2>Better mornings</h2><p>Five small habits that make the first cup of the day the best one.</p><p><a href="#" class="button">Read the journal</a></p></div>
  <div class="half-rust"><p class="split-label">Come say hi</p><h2>Where to find us</h2><p>Our corner shop is on Main Street in Kansas City, open every day from 7 to 4.</p><p><a href="#" class="button">See the map</a></p></div>
</section>
<footer class="site-footer">
  <div class="footer-top">
    <div class="brand"><h3>Second Cup</h3><p>Small batch coffee, roasted in Kansas City.</p></div>
    <div class="footer-col"><h4>Shop</h4><p><a href="product.html">Espresso Blend</a></p><p><a href="product.html">French Vanilla</a></p><p><a href="product.html">Premium Roast</a></p></div>
    <div class="footer-col"><h4>Company</h4><p><a href="about.html">About us</a></p><p><a href="index.html">Journal</a></p><p><a href="about.html">Visit us</a></p></div>
    <div class="footer-col"><h4>Help</h4><p><a href="#">Shipping</a></p><p><a href="#">Returns</a></p><p><a href="#">Contact</a></p></div>
  </div>
  <div class="legal">Copyright 2026 Second Cup. All rights reserved.</div>
</footer>`, 'class="blends"', 200);
  await (await editorFor(index)).document.save();
  await cssTyping(null, `.story {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 96px 64px 40px;
  background-color: #243A30;
  color: #F7E1C3;
  border-radius: 24px;
  margin-bottom: 16px;
}
.story-intro {
  width: 34%;
}
.story-label {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: #E2C08D;
}
.story-intro h2 {
  font-size: 96px;
  line-height: 0.95;
  text-transform: uppercase;
  color: #E2C08D;
}
.story-cards {
  width: 60%;
  display: flex;
  justify-content: space-between;
}
.step {
  width: 31%;
  margin-bottom: 56px;
}
.step img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 16px;
  margin-bottom: 20px;
}
.step-number {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 3px;
  color: #E2C08D;
  margin-bottom: 8px;
}
.step h3 {
  font-size: 32px;
  color: #FFFFFF;
  margin-bottom: 8px;
}
.split {
  display: flex;
  border-radius: 24px;
  overflow: hidden;
  margin-bottom: 16px;
}
.half-tan, .half-rust {
  width: 50%;
  box-sizing: border-box;
  padding: 64px 48px;
}
.half-tan {
  background-color: #E2C08D;
}
.half-rust {
  background-color: #DA4921;
  color: #FFFFFF;
}
.split h2 {
  font-size: 48px;
  text-transform: uppercase;
}
.split-label {
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-bottom: 8px;
}
.half-rust .button {
  background-color: #243A30;
}
.site-footer {
  background-color: #243A30;
  color: #F7E1C3;
  padding: 56px 40px 24px;
  border-radius: 24px;
}
.footer-top {
  display: flex;
  justify-content: space-between;
}
.brand {
  width: 28%;
}
.footer-col {
  width: 16%;
}
.site-footer a {
  color: #F7E1C3;
  text-decoration: none;
}
.footer-col p {
  margin: 0 0 8px;
}
.legal {
  margin-top: 40px;
  padding-top: 16px;
  border-top: 1px solid #F7E1C3;
  font-size: 12px;
}
`);

  // 7. Look it over
  mark('check');
  await vscode.commands.executeCommand('workbench.action.files.saveAll');
  s = await session(api, index);
  await P({ op: 'show', x: 700, y: 300 });
  s.testAction({ kind: 'scroll', y: 0 }); await pause(2200);
  for (const y of [600, 1200, 1800, 2600]) { s.testAction({ kind: 'scroll', y }); await pause(2200); }
  s.testAction({ kind: 'scroll', y: 0 }); await pause(1500);
  await P({ op: 'click', sel: '#toggleInteract' }); await pause(500);
  await P({ op: 'move', page: true, sel: 'a.button' }); await pause(2000);
  done();
  await sleep(3000);
}
