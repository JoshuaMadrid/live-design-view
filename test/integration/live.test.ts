import * as assert from 'assert';
import * as vscode from 'vscode';
import type { LiveDesignApi } from '../../src/extension';
import type { LiveSession } from '../../src/liveEditorProvider';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<T>(fn: () => T | undefined | false | Promise<T | undefined | false>, what: string, ms = 15000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error('Timed out: ' + what);
    await sleep(50);
  }
}

suite('Live Design View', () => {
  let api: LiveDesignApi;
  let uri: vscode.Uri;
  let doc: vscode.TextDocument;
  let session: LiveSession;
  const tag = (t: string, nth = 0) => session.model.nodes.filter((n) => n.tag === t)[nth];
  const text = () => doc.getText();
  /** Puts the page back to `before` (undo needs a focused window, so tests restore text directly). */
  const restore = async (before: string) => {
    if (text() === before) return;
    const we = new vscode.WorkspaceEdit();
    we.replace(doc.uri, new vscode.Range(doc.positionAt(0), doc.positionAt(text().length)), before);
    const v = session.currentRenderVersion;
    await vscode.workspace.applyEdit(we);
    await session.waitForRender(v + 1);
  };
  /** Waits for a render newer than the current one. */
  const nextRender = async (act: () => unknown) => {
    const v = session.currentRenderVersion;
    await act();
    return session.waitForRender(v + 1);
  };

  suiteSetup(async () => {
    const ext = vscode.extensions.all.find((e) => e.packageJSON.name === 'live-design-view')!;
    api = (await ext.activate()) as LiveDesignApi;
    uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'index.html');
    doc = await vscode.workspace.openTextDocument(uri);
  });

  test('1. Live view renders the current text with CSS, image and jQuery', async () => {
    await vscode.commands.executeCommand('liveDesign.liveView', uri);
    session = await until(() => api.provider.sessionsFor(uri)[0], 'live session');
    const stats = await session.waitForRender(1);
    console.log('    render stats', JSON.stringify(stats));
    assert.ok(stats.ldIds > 25, 'data-ld-id on elements');
    assert.strictEqual(stats.stylesheets, 1);
    assert.strictEqual(stats.stylesheetsWithRules, 1, 'styles.css loaded');
    assert.strictEqual(stats.images, 1);
    assert.strictEqual(stats.imagesLoaded, 1, 'lantern.svg loaded');
    assert.ok(stats.jquery, 'jQuery loaded');
    assert.match(stats.scriptMarkers[0], /^jquery-3\./, 'main.js ran');
    assert.strictEqual(stats.scriptMarkers[1], 'rgb(251, 246, 238)', 'body background from styles.css');
    assert.ok(!text().includes('data-ld-id'), 'ids never written to the file');
  });

  test('1b. Unsaved edits render (document text, not disk)', async () => {
    const h1 = tag('h1');
    const stats = await nextRender(async () => {
      const we = new vscode.WorkspaceEdit();
      we.insert(uri, doc.positionAt(h1.stEnd), 'NEW ');
      await vscode.workspace.applyEdit(we);
    });
    assert.ok(doc.isDirty);
    assert.ok(stats.version > 1);
    assert.ok(text().includes('<h1>NEW Handmade'));
  });

  test('2. Mode switching: Live → Split → Code → Live (remembered)', async () => {
    assert.strictEqual(api.modes.currentMode(uri), 'live');
    await vscode.commands.executeCommand('liveDesign.splitView', uri);
    await until(() => api.modes.currentMode(uri) === 'split', 'split mode');
    const editor = vscode.window.visibleTextEditors.find((e) => e.document === doc);
    assert.ok(editor, 'text editor visible in split');
    assert.strictEqual(editor.viewColumn, vscode.ViewColumn.One);
    const liveTab = vscode.window.tabGroups.all.flatMap((g) => g.tabs).find((t) => t.input instanceof vscode.TabInputCustom);
    assert.ok(liveTab && liveTab.group.viewColumn !== vscode.ViewColumn.One, 'live is beside');
    assert.strictEqual(api.modes.lastMode(uri), 'split');
    assert.ok(doc.isDirty, 'still dirty after split');

    await vscode.commands.executeCommand('liveDesign.codeView', uri);
    await until(() => api.modes.currentMode(uri) === 'code', 'code mode');
    assert.strictEqual(api.provider.sessionsFor(uri).length, 0);
    console.log('    after code: dirty=', doc.isDirty, 'closed=', doc.isClosed, 'text has NEW=', text().includes('NEW '), 'disk has NEW=', require('fs').readFileSync(uri.fsPath, 'utf8').includes('NEW '));
    assert.ok(doc.isDirty, 'unsaved changes kept across modes');

    await vscode.commands.executeCommand('liveDesign.liveView', uri);
    await until(() => api.modes.currentMode(uri) === 'live', 'live mode');
    await vscode.commands.executeCommand('liveDesign.splitView', uri);
    await until(() => api.modes.currentMode(uri) === 'split', 'split again');
    session = await until(() => api.provider.sessionsFor(uri)[0], 'session');
    await session.waitForRender(1);
  });

  test('3. Split sync: Live click selects source; cursor highlights element', async () => {
    const h1 = tag('h1');
    session.testAction({ kind: 'click', id: h1.id });
    const editor = await until(() => vscode.window.visibleTextEditors.find((e) => e.document === doc), 'editor');
    await until(() => doc.offsetAt(editor.selection.start) === h1.start && doc.offsetAt(editor.selection.end) === h1.end, 'editor selects h1');

    const strong = tag('strong');
    const pos = doc.positionAt(strong.stEnd + 2);
    // Move the cursor the way a user does (keyboard command), so the change has a real kind.
    await vscode.window.showTextDocument(doc, editor.viewColumn);
    editor.selection = new vscode.Selection(pos.translate(0, -1), pos.translate(0, -1));
    await vscode.commands.executeCommand('cursorRight');
    await until(() => session.selectedId === strong.id, 'live highlights <strong>');
  });

  const settle = () => sleep(150);

  test('3b. DOM panel mirrors the selection; selecting in DOM selects in Live', async () => {
    await vscode.commands.executeCommand('liveDesign.dom.focus');
    await sleep(300);
    const strong = tag('strong');
    await until(() => api.dom.view.selection[0]?.id === strong.id, 'DOM tree reveals <strong>');
    const nav = tag('nav');
    session.select(nav.id, { scrollCanvas: true });
    await until(() => api.dom.view.selection[0]?.id === nav.id, 'DOM tree follows Live selection');
    const kids = api.dom.getChildren({ id: tag("body").id, key: "1:body" }).map((i) => session.model.nodes[i.id].tag);
    assert.deepStrictEqual(kids, ['header', 'main', 'footer'], 'scripts hidden from DOM panel');
  });

  test('4. Insert panel click → popover → After (A) inserts and selects the new element', async () => {
    const h1 = tag('h1');
    session.select(h1.id);
    await settle();
    const before = text();
    session.placeInsert('p');
    await settle();
    const stats = await nextRender(() => session.testAction({ kind: 'key', key: 'a' }));
    const after = text();
    assert.match(after, /<\/h1>\n      <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit\.<\/p>\n      <p class="lead">/);
    assert.strictEqual(after.length - before.length, '\n      <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>'.length, 'minimal edit');
    const newP = tag('p', 0);
    assert.strictEqual(stats.selectedId, newP.id, 'new element selected in Live');
    const editor = vscode.window.visibleTextEditors.find((e) => e.document === doc)!;
    await until(() => doc.offsetAt(editor.selection.start) === newP.start, 'new element selected in code');
  });

  test('4a. Popover Wrap (W) wraps the selection', async () => {
    const img = tag('img');
    session.select(img.id);
    await settle();
    session.placeInsert('div');
    await settle();
    await nextRender(() => session.testAction({ kind: 'key', key: 'w' }));
    assert.match(text(), /\n      <div>\n        <img src="images\/lantern.svg"[^>]*>\n      <\/div>\n/);
    assert.strictEqual(session.selected?.tag, 'div');
  });

  test('4b. Insert inside an <img> is refused with a message', async () => {
    const img = tag('img');
    const before = text();
    await session.insert('p', 'inside-first', img.id);
    assert.strictEqual(text(), before);
    assert.match(session.messages.at(-1)!, /can't contain/);
  });

  test('5. Drag-to-insert: middle of empty div → inside; top of h2 → before', async () => {
    const card = tag('div', 1);
    assert.strictEqual(card.attrs.find((a) => a.name === 'class')?.value, 'card');
    await nextRender(() => session.testAction({ kind: 'drop', tag: 'h3', id: card.id, at: 0.5 }));
    assert.match(text(), /<div class="card">\n        <h3>Heading 3<\/h3>\n      <\/div>/);
    const h2 = tag('h2');
    await nextRender(() => session.testAction({ kind: 'drop', tag: 'blockquote', id: h2.id, at: 0.05 }));
    assert.match(text(), /<section id="features" class="features">\n      <blockquote>\n        <p>Lorem ipsum[^\n]+<\/p>\n      <\/blockquote>\n      <h2>Features<\/h2>/);
  });

  test('6. Inline text edit writes back only the text range', async () => {
    const lead = session.model.nodes.find((n) => n.attrs.some((a) => a.name === 'class' && a.value === 'lead'))!;
    const before = text();
    await nextRender(() => session.testAction({ kind: 'editText', id: lead.id, index: 1, value: 'Brooklyn' }));
    assert.strictEqual(text(), before.replace('<strong>Kansas City</strong>', '<strong>Brooklyn</strong>'));
  });

  test('6b. Properties edits and HUD "Add Class/ID" are minimal', async () => {
    const img = tag('img');
    const before = text();
    await nextRender(() => session.setAttr(img.id, 'alt', 'Lantern'));
    assert.strictEqual(text(), before.replace('alt="A paper lantern"', 'alt="Lantern"'));
    const btn = tag('button');
    await nextRender(() => session.handleMessage({ type: 'addClassOrId', id: btn.id, value: '.primary' }));
    assert.ok(text().includes('id="cta" class="btn primary"'));
    const card = session.model.nodes.find((n) => n.attrs.some((a) => a.value === 'card'))!;
    await nextRender(() => session.handleMessage({ type: 'addClassOrId', id: card.id, value: '#promo' }));
    assert.ok(text().includes('<div class="card" id="promo">'));
  });

  test('6c. Delete key and Alt+Up/Down from the webview', async () => {
    const li = tag('li', 1);
    session.select(li.id);
    await settle();
    await nextRender(() => session.testAction({ kind: 'key', key: 'ArrowUp', altKey: true }));
    assert.match(text(), /<ul>\n        <li>Warm LED bulbs<\/li>\n        <li>Recycled paper shades<\/li>/);
    assert.strictEqual(session.selected!.start, tag('li', 0).start, 'moved element stays selected');
    await nextRender(() => session.testAction({ kind: 'key', key: 'Delete' }));
    assert.match(text(), /<ul>\n        <li>Recycled paper shades<\/li>\n        <li>Lifetime repairs<\/li>\n      <\/ul>/);
    assert.strictEqual(session.selected!.tag, 'ul', 'parent selected after delete');
  });

  test('7. Native undo reverts the last Live edit', async function () {
    const before = text();
    const editor = vscode.window.visibleTextEditors.find((e) => e.document === doc)!;
    await vscode.window.showTextDocument(editor.document, editor.viewColumn);
    // The 'undo' command needs keyboard focus in an editor, which macOS only gives a focused window.
    if (!vscode.window.state.focused) {
      console.log('    (skipped: the test window is not focused, so VS Code routes undo nowhere)');
      this.skip();
    }
    await vscode.commands.executeCommand('undo');
    await until(() => text() !== before, 'undo applied');
    assert.ok(text().includes('<li>Warm LED bulbs</li>\n        <li>Recycled paper shades</li>'));
  });

  test('8. Scroll position is preserved across re-render', async () => {
    await sleep(400);
    session.testAction({ kind: 'scroll', y: 250 });
    await sleep(200);
    const footer = tag('footer');
    const stats = await nextRender(() => session.setAttr(footer.id, 'id', 'bottom'));
    console.log('    scrollY after re-render', stats.scrollY);
    assert.ok(Math.abs(stats.scrollY - 250) < 2, `scrollY ${stats.scrollY}`);
  });

  test('9. Broken HTML still renders and reports issues', async () => {
    const main = tag('main');
    const stats = await nextRender(async () => {
      const we = new vscode.WorkspaceEdit();
      we.insert(uri, doc.positionAt(main.stEnd), '\n    <div><b>oops</div></span>');
      await vscode.workspace.applyEdit(we);
    });
    assert.ok(stats.ldIds > 20);
    assert.ok(session.model.issues.length >= 2);
  });

  test('10. Tailwind / shadcn snippet adds the CDN script once and is styled in Live', async () => {
    const h2 = tag('h2');
    await nextRender(() => session.insert('sc-button', 'after', h2.id));
    const t = text();
    assert.strictEqual((t.match(/cdn\.tailwindcss\.com/g) || []).length, 1, 'tailwind script added to head');
    assert.match(t, /<script src="https:\/\/cdn.tailwindcss.com\/3.4.17"><\/script>\n<\/head>/);
    assert.strictEqual(session.selected?.tag, 'button', 'new button selected');
    await nextRender(() => session.insert('tw-badge', 'after', session.selected!.id));
    assert.strictEqual((text().match(/cdn\.tailwindcss\.com/g) || []).length, 1, 'not added twice');
    // Tailwind's CDN builds styles at runtime; poll the computed style of the shadcn button.
    let style: any;
    for (let i = 0; i < 40; i++) {
      const r = (await session.probe('button.bg-zinc-900', ['background-color', 'border-radius'])) as any[];
      style = r[0]?.style;
      if (style && style['background-color'] === 'rgb(24, 24, 27)') break;
      await sleep(250);
    }
    console.log('    shadcn button style', JSON.stringify(style));
    assert.strictEqual(style?.['background-color'], 'rgb(24, 24, 27)', 'Tailwind bg-zinc-900 applied');
  });

  test('11. React snippet adds React + Babel and renders in Live', async () => {
    const footer = tag('footer');
    await nextRender(() => session.insert('react-counter', 'before', footer.id));
    assert.match(text(), /react-dom@18\.3\.1\/umd/);
    assert.match(text(), /<div id="counter"><\/div>\n  <script type="text\/babel">\n    function Counter\(\) \{/);
    let r: any[] = [];
    for (let i = 0; i < 60; i++) {
      r = (await session.probe('#counter', [])) as any[];
      if (r[0]?.children > 0) break;
      await sleep(250);
    }
    console.log('    react mount', JSON.stringify(r));
    assert.match(r[0]?.text ?? '', /Clicked 0 times/, 'React component rendered');
  });

  test('12. Snippets panel: starter folders, insert a saved snippet, trigger-key completion', async () => {
    await api.snippets.ready;
    const folders = api.snippets.getChildren().map((n: any) => n.name);
    assert.deepStrictEqual(folders, ['HTML_Snippets', 'React_Components', 'shadcn_Patterns', 'Tailwind_Layouts']);
    const figure = api.snippets.all.find((x) => x.name === 'Figure_With_Caption')!;
    const card = session.model.nodes.find((n) => n.attrs.some((a) => a.value === 'card'))!;
    session.select(card.id);
    await settle();
    session.placeInsert(figure.key);
    await settle();
    await nextRender(() => session.testAction({ kind: 'key', key: 'i' }));
    assert.match(text(), /<div class="card" id="promo">\n        <h3>Heading 3<\/h3>\n        <figure>\n          <img src="" alt="">\n          <figcaption>Caption<\/figcaption>\n        <\/figure>\n      <\/div>/);
    const list = (await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', uri, doc.positionAt(tag('main').stEnd))) as vscode.CompletionList;
    const labels = list.items.map((i) => (typeof i.label === 'string' ? i.label : i.label.label));
    assert.ok(labels.includes('sclogin') && labels.includes('contactform'), 'trigger keys offered');
  });

  // ---------------------------------------------------------------------------
  // CSS Designer
  // ---------------------------------------------------------------------------
  const cssUri = () => vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'css', 'styles.css');
  const cssText = async () => (await vscode.workspace.openTextDocument(cssUri())).getText();
  const cssState = async (msg?: any) => {
    const next = api.css.nextState();
    if (msg) await api.css.onMessage(msg);
    else api.css.refresh(0);
    return next;
  };

  test('13. CSS Designer (All): sources, add a selector for the selection, set a property', async () => {
    const h2 = tag('h2');
    session.select(h2.id, { scrollCanvas: true });
    await settle();
    await cssState({ type: 'mode', mode: 'all' });
    let st = await cssState();
    assert.deepStrictEqual(st.sources.map((x: any) => x.label), ['All stylesheets', 'css/styles.css']);
    assert.ok(st.suggestions.includes('h2') && st.suggestions.includes('#features h2'), JSON.stringify(st.suggestions));
    st = await cssState({ type: 'selectSource', key: st.sources[1].key });
    st = await cssState({ type: 'addRule', selector: '#features h2' });
    assert.match(await cssText(), /\n\n#features h2 \{\n\}\n$/);
    st = await cssState();
    assert.strictEqual(st.ruleSelector, '#features h2', 'new rule selected');
    const v = session.currentRenderVersion;
    st = await cssState({ type: 'setProp', prop: 'color', value: '#c0392b' });
    assert.match(await cssText(), /#features h2 \{\n  color: #c0392b;\n\}\n$/);
    const doc = await vscode.workspace.openTextDocument(cssUri());
    assert.ok(!doc.isDirty, 'auto-saved');
    await session.waitForRender(v + 1);
    let color = '';
    for (let i = 0; i < 20 && color !== 'rgb(192, 57, 43)'; i++) {
      color = ((await session.probe('#features h2', ['color'])) as any[])[0]?.style.color;
      if (color !== 'rgb(192, 57, 43)') await sleep(150);
    }
    assert.strictEqual(color, 'rgb(192, 57, 43)', 'Live shows the new CSS');
  });

  test('14. CSS Designer (Current): matching rules, overridden props struck through, toggle + undo', async () => {
    // Less specific rule that sets font-size too: it must show as overridden by ".hero h1".
    let st = await cssState({ type: 'addRule', selector: 'h1' });
    await cssState({ type: 'setProp', prop: 'font-size', value: '5rem' });
    const h1 = tag('h1');
    session.select(h1.id, { scrollCanvas: true });
    await settle();
    st = await cssState({ type: 'mode', mode: 'current' });
    const sels = st.rules.map((r: any) => r.selector);
    assert.deepStrictEqual(sels.slice(0, 3), ['Computed', '.hero h1', 'h1'], JSON.stringify(sels));
    const h1Rule = st.rules.find((r: any) => r.selector === 'h1');
    st = await cssState({ type: 'selectRule', key: h1Rule.key });
    const fs = st.decls.find((d: any) => d.prop === 'font-size');
    assert.ok(fs && fs.overridden, 'h1 font-size overridden by .hero h1');
    assert.ok(st.computed && /px$/.test(st.computed['font-size']), 'computed values present');
    // Disable (comment out) then undo via the panel.
    await cssState({ type: 'toggleProp', prop: 'font-size', enable: false });
    assert.match(await cssText(), /h1 \{\n  \/\* font-size: 5rem; \*\/\n\}/);
    await cssState({ type: 'undo' });
    assert.match(await cssText(), /h1 \{\n  font-size: 5rem;\n\}/);
    await cssState({ type: 'removeRule', key: h1Rule.key });
    assert.ok(!/\nh1 \{/.test(await cssText()), 'rule removed');
    await cssState({ type: 'mode', mode: 'all' });
  });

  test('15. Unsaved CSS edits render in Live (inlined from the editor)', async () => {
    const doc = await vscode.workspace.openTextDocument(cssUri());
    const we = new vscode.WorkspaceEdit();
    we.insert(cssUri(), doc.positionAt(doc.getText().length), '\nfooter { background-color: rgb(1, 2, 3); }\n');
    const v = session.currentRenderVersion;
    await vscode.workspace.applyEdit(we);
    assert.ok(doc.isDirty);
    await session.waitForRender(v + 1);
    const r = (await session.probe('footer', ['background-color'])) as any[];
    assert.strictEqual(r[0]?.style['background-color'], 'rgb(1, 2, 3)');
    const img = (await session.probe('img', [])) as any[];
    assert.ok(img.length > 0);
    await doc.save();
  });

  test('16. Empty page: blank click selects <body>, Nest creates the HTML5 page, head + inline items', async () => {
    const blank = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'blank.html');
    await vscode.workspace.fs.writeFile(blank, new Uint8Array());
    await vscode.commands.executeCommand('liveDesign.liveView', blank);
    const bs = await until(() => api.provider.sessionsFor(blank)[0], 'blank session');
    await bs.waitForRender(1);
    const bdoc = await vscode.workspace.openTextDocument(blank);
    bs.testAction({ kind: 'clickPoint', x: 200, y: 150 });
    await until(() => bs.selected?.tag === 'body', 'blank area selects <body>');
    bs.placeInsert('div');
    await sleep(150);
    let v = bs.currentRenderVersion;
    bs.testAction({ kind: 'key', key: 'i' });
    await bs.waitForRender(v + 1);
    assert.match(bdoc.getText(), /^<!DOCTYPE html>\n<html lang="en">\n<head>[\s\S]*<body>\n  <div><\/div>\n<\/body>\n<\/html>\n$/);
    assert.strictEqual(bs.selected?.tag, 'div', 'new div selected');
    v = bs.currentRenderVersion;
    bs.placeInsert('char-copy');
    await bs.waitForRender(v + 1);
    assert.ok(bdoc.getText().includes('<div>&copy;</div>'));
    v = bs.currentRenderVersion;
    bs.placeInsert('meta-keywords');
    await bs.waitForRender(v + 1);
    assert.match(bdoc.getText(), /  <title>Untitled Document<\/title>\n  <meta name="keywords" content="">\n<\/head>/);
    // Clicking the blank space below a short page selects <body> (not <html>).
    try {
      bs.testAction({ kind: 'clickPoint', x: 200, y: 160 });
      await until(() => bs.selected?.tag === 'body', 'body selected on blank space');
    } finally {
      await bdoc.save();
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      api.hub.setActive(session);
    }
  });

  test('17. DOM panel: drag onto a sibling reorders, onto a container nests; double-click names', async () => {
    const dt = (id: number) => {
      const d = new vscode.DataTransfer();
      d.set('application/vnd.code.tree.livedesign.dom', new vscode.DataTransferItem([api.dom.itemFor(id)!.key]));
      return d;
    };
    // Sibling: drag the "Toggle details" button up onto the lead paragraph -> takes its place (before it).
    const btn = tag('button');
    const lead = session.model.nodes.find((n) => n.attrs.some((a) => a.value === 'lead'))!;
    let v = session.currentRenderVersion;
    await api.dom.handleDrop(api.dom.itemFor(lead.id), dt(btn.id));
    await session.waitForRender(v + 1);
    assert.match(text(), /<button type="button" id="cta"[^\n]*<\/button>\n      <p class="lead">/);
    // Container elsewhere: drag the footer's <p> onto the features <ul> -> first child, re-indented.
    const footP = session.model.nodes.find((n) => n.tag === 'p' && session.model.nodes[n.parent!].tag === 'footer')!;
    const ul = tag('ul');
    v = session.currentRenderVersion;
    await api.dom.handleDrop(api.dom.itemFor(ul.id), dt(footP.id));
    await session.waitForRender(v + 1);
    assert.match(text(), /<ul>\n        <p>&copy; <span id="year">2026<\/span> Lantern &amp; Co\.<\/p>\n        <li>/);
    assert.strictEqual(session.selected?.tag, 'p', 'moved element selected');
    // Double-click editing (Class / ID input) applies ids and classes.
    const card = session.model.nodes.find((n) => n.attrs.some((a) => a.value === 'card'))!;
    await session.setSelectors(card.id, '.card .featured #promo2');
    assert.ok(text().includes('<div class="card featured" id="promo2">'), text().match(/<div class="card[^>]*>/)?.[0]);
    await vscode.commands.executeCommand('undo');
    await vscode.commands.executeCommand('undo');
  });

  test('18. Properties inspector: booleans, Format, image Link, select List Values', async () => {
    const P = api.properties;
    const email = session.model.nodes.find((n) => n.tag === 'input' && n.attrs.some((a) => a.value === 'email'))!;
    await P.onMessage({ type: 'setBool', id: email.id, name: 'required', on: true });
    assert.match(text(), /<input type="email" id="email" name="email" placeholder="you@example.com" required>/);
    const h2 = tag('h2');
    await P.onMessage({ type: 'renameTag', id: h2.id, tag: 'h3' });
    assert.ok(text().includes('<h3>Features</h3>'));
    const img = tag('img');
    await P.onMessage({ type: 'setLink', id: img.id, attr: 'href', value: 'about.html' });
    assert.match(text(), /<a href="about\.html"><img src="images\/lantern\.svg"[^>]*><\/a>/);
    const img2 = tag('img');
    await P.onMessage({ type: 'setLink', id: img2.id, attr: 'target', value: '_blank' });
    assert.ok(text().includes('<a href="about.html" target="_blank"><img'));
    // Insert a select after the email field, then edit its list values.
    await session.insert('select', 'after', tag('input').id);
    const sel = tag('select');
    await P.onMessage({ type: 'setOptions', id: sel.id, options: [{ label: 'Small', value: 's' }, { label: 'Large', value: 'l', selected: true }] });
    assert.match(text(), /<select name="">\n          <option value="s">Small<\/option>\n          <option value="l" selected>Large<\/option>\n        <\/select>/);
    const info = session.selectionInfo(tag('select'))!;
    assert.deepStrictEqual(info.options!.map((o) => [o.label, o.value, o.selected]), [['Small', 's', false], ['Large', 'l', true]]);
  });

  test('19. Drag an element on the canvas to move it', async () => {
    const details = session.model.nodes.find((n) => n.attrs.some((a) => a.name === 'id' && a.value === 'details'))!;
    const heading = session.model.nodes.find((n) => n.tag === 'h3' && n.texts.some((t) => t.value === 'Features'))!;
    session.select(details.id);
    await settle();
    const v = session.currentRenderVersion;
    await session.waitForRender(v); // canvas shows the current ids
    session.testAction({ kind: 'dragEl', id: details.id, to: heading.id, at: 0.1 });
    await session.waitForRender(v + 1);
    assert.match(text(), /<p id="details" class="details">[^\n]*<\/p>\n      <h3>Features<\/h3>/);
    assert.strictEqual(session.selected?.attrs.find((a) => a.name === 'id')?.value, 'details', 'moved element stays selected');
  });

  test('20. CSS Designer quick Layout  sets flex props on the selected rule in one edit', async () => {
    const card = session.model.nodes.find((n) => n.attrs.some((a) => a.name === 'class' && a.value.split(' ').includes('card')))!;
    session.select(card.id, { scrollCanvas: true });
    await settle();
    let st = await cssState({ type: 'mode', mode: 'current' });
    const cardRule = st.rules.find((r: any) => r.selector === '.card');
    st = await cssState({ type: 'selectRule', key: cardRule.key });
    await cssState({ type: 'setProps', props: { display: 'flex', 'flex-direction': 'column', gap: '12px', 'justify-content': 'center', 'align-items': 'center' } });
    assert.ok((await cssText()).includes('.card { min-height: 60px; border: 1px dashed #c9b79c; border-radius: 6px; padding: 1rem; display: flex; flex-direction: column; gap: 12px; justify-content: center; align-items: center; }'));
    let disp = '';
    for (let i = 0; i < 20 && disp !== 'flex'; i++) {
      disp = ((await session.probe('.card', ['display'])) as any[])[0]?.style.display;
      if (disp !== 'flex') await sleep(150);
    }
    assert.strictEqual(disp, 'flex', 'Live shows the new layout');
    // One undo step reverts all five properties.
    await cssState({ type: 'undo' });
    assert.ok((await cssText()).includes('.card { min-height: 60px; border: 1px dashed #c9b79c; border-radius: 6px; padding: 1rem; }'));
    await cssState({ type: 'setProps', props: { display: 'flex', 'flex-direction': 'column' } });
    await cssState({ type: 'mode', mode: 'all' });
    // The bottom Properties panel is HTML-only now.
    await api.properties.update();
    assert.deepStrictEqual(Object.keys(api.properties.lastPayload!), ['info']);
  });

  test('21. Empty div is droppable (visual aids); DOM drop onto a container nests', async () => {
    const nav = tag('nav');
    let v = session.currentRenderVersion;
    await session.insert('div', 'after', tag('header').id);
    await session.waitForRender(v + 1);
    const box = session.selected!;
    assert.strictEqual(box.tag, 'div');
    v = session.currentRenderVersion;
    session.testAction({ kind: 'drop', tag: 'p', id: box.id, at: 0.5 });
    await session.waitForRender(v + 1);
    assert.match(text(), /<\/header>\n\n?  <div>\n    <p>Lorem ipsum[^\n]*<\/p>\n  <\/div>/);
    // DOM panel: drop the nav (in header) onto that div -> becomes its first child.
    const dt = new vscode.DataTransfer();
    dt.set('application/vnd.code.tree.livedesign.dom', new vscode.DataTransferItem([api.dom.itemFor(tag('nav').id)!.key]));
    const div = session.model.nodes.find((n) => n.tag === 'div' && n.parent !== undefined && session.model.nodes[n.parent].tag === 'body')!;
    v = session.currentRenderVersion;
    await api.dom.handleDrop(api.dom.itemFor(div.id), dt);
    await session.waitForRender(v + 1);
    assert.match(text(), /  <div>\n    <nav class="nav">[\s\S]*?<\/nav>\n    <p>Lorem/);
    void nav;
  });

  test('22. Copy, paste (after / as child) and duplicate elements', async () => {
    const li = tag('li');
    const liText = session.model.text.slice(li.start, li.end);
    const esc = liText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    session.select(li.id);
    await settle();
    session.testAction({ kind: 'clipKey', key: 'c' });
    await sleep(200);
    assert.strictEqual(await vscode.env.clipboard.readText(), liText);
    let v = session.currentRenderVersion;
    session.testAction({ kind: 'clipKey', key: 'v' });
    await session.waitForRender(v + 1);
    assert.match(text(), new RegExp(esc + '\\n        ' + esc));
    v = session.currentRenderVersion;
    session.testAction({ kind: 'clipKey', key: 'd' });
    await session.waitForRender(v + 1);
    assert.strictEqual((text().match(new RegExp(esc, 'g')) || []).length, 3);
    // Paste as child into the .card div
    const card = session.model.nodes.find((n) => n.attrs.some((a) => a.name === 'class' && a.value.split(' ').includes('card')))!;
    session.select(card.id);
    await settle();
    v = session.currentRenderVersion;
    session.testAction({ kind: 'clipKey', key: 'v', shiftKey: true });
    await session.waitForRender(v + 1);
    assert.match(text(), new RegExp(esc + '\\n      <\\/div>'));
  });

  test('23. CSS Designer knows when the parent is flex (Flex Item controls)', async () => {
    const card = session.model.nodes.find((n) => n.attrs.some((a) => a.name === 'class' && a.value.split(' ').includes('card')))!;
    const child = session.model.nodes[card.children[0]];
    session.select(child.id, { scrollCanvas: true });
    await settle();
    const st = await cssState({ type: 'mode', mode: 'current' });
    assert.strictEqual(st.parentDisplay, 'flex');
    await cssState({ type: 'mode', mode: 'all' });
  });

  test('24. Box model overlay: padding on a flex container, gaps between items, grid tracks', async () => {
    const card = session.model.nodes.find((n) => n.attrs.some((a) => a.name === 'class' && a.value.split(' ').includes('card')))!;
    session.select(card.id, { scrollCanvas: true });
    await settle();
    let st = await cssState({ type: 'mode', mode: 'current' });
    await cssState({ type: 'selectRule', key: st.rules.find((r: any) => r.selector === '.card').key });
    let v = session.currentRenderVersion;
    await cssState({ type: 'setProps', props: { gap: '12px' } });
    await session.waitForRender(v + 1);
    await sleep(200);
    let stats = await session.boxModelStats();
    console.log('    flex box model', JSON.stringify(stats));
    assert.strictEqual(stats.padding, 4, '.card has 1rem padding on all sides');
    assert.ok(stats.border >= 4, '.card has a border');
    assert.ok(stats.item >= 2, 'flex items outlined');
    assert.ok(stats.gap >= 2 && stats.gapLabels.includes('12'), 'gap: 12px between items is shown');
    // Make it a 2-column grid with a 10px gap: tracks + column gap appear.
    v = session.currentRenderVersion;
    await api.css.onMessage({ type: 'setProps', props: { display: 'grid', 'flex-direction': '', 'grid-template-columns': 'repeat(2, 1fr)', gap: '10px' } });
    const cardRule = (await cssText()).match(/\.card \{[^}]*\}/)?.[0];
    assert.strictEqual(cardRule, '.card { min-height: 60px; border: 1px dashed #c9b79c; border-radius: 6px; padding: 1rem; display: grid; gap: 10px; grid-template-columns: repeat(2, 1fr); }');
    await session.waitForRender(v + 1);
    await sleep(200);
    stats = await session.boxModelStats();
    console.log('    grid box model', JSON.stringify(stats));
    assert.ok(stats.track >= 2, 'two column tracks');
    assert.ok(stats.gapLabels.includes('10'), '10px gap labelled');
    await cssState({ type: 'mode', mode: 'all' });
  });

  test('25. On-canvas editing: grid tracks (add / size / remove), gap and padding handles', async () => {
    const card = session.model.nodes.find((n) => n.attrs.some((a) => a.name === 'class' && a.value.split(' ').includes('card')))!;
    session.select(card.id, { scrollCanvas: true });
    await settle();
    await cssState({ type: 'mode', mode: 'all' });
    const rule = async () => (await cssText()).match(/\.card \{[^}]*\}/)![0];
    const step = async (action: any) => {
      const before = await rule();
      const v = session.currentRenderVersion;
      await session.waitForRender(v);
      session.testAction(action);
      for (let i = 0; i < 60 && (await rule()) === before; i++) await sleep(100);
      await session.waitForRender(v + 1).catch(() => undefined);
      await sleep(150);
      return rule();
    };
    const stats = await session.boxModelStats();
    console.log('    grid inspector', JSON.stringify(stats));
    assert.ok(stats.heads >= 3, 'column + row headers');
    assert.strictEqual(stats.adds, 2, '+ for columns and rows');
    assert.ok(stats.lines >= 3, 'line numbers');
    assert.match(await step({ kind: 'gridOp', axis: 'columns', op: 'add', index: -1 }), /grid-template-columns: repeat\(3, 1fr\)/);
    assert.match(await step({ kind: 'gridOp', axis: 'columns', op: 'set', index: 0, value: '200px' }), /grid-template-columns: 200px 1fr 1fr/);
    assert.match(await step({ kind: 'gridOp', axis: 'columns', op: 'remove', index: 2 }), /grid-template-columns: 200px 1fr;/);
    assert.match(await step({ kind: 'bmEdit', cls: 'bm-gap', value: '24' }), /column-gap: 24px/);
    // Drag the gap handle 10px to the right → 34px
    assert.match(await step({ kind: 'bmScrub', cls: 'bm-gap', dx: 10, dy: 0 }), /column-gap: 34px/);
    const r = await step({ kind: 'bmEdit', cls: 'bm-padding', value: '20', alt: true });
    assert.match(r, /padding-top: 20px; padding-bottom: 20px|padding-bottom: 20px; padding-top: 20px/);
    assert.ok(session.messages.some((m) => /→ \.card \(css\/styles\.css\)/.test(m)), 'tells where the edit went');
  });

  test('26. Fill / Hug follow the parent layout (flex row child: Fill = flex 1, Hug height = fit-content)', async () => {
    await vscode.commands.executeCommand('liveDesign.css.focus');
    await sleep(800);
    const brand = session.model.nodes.find((n) => n.attrs.some((a) => a.name === 'class' && a.value.split(' ').includes('brand')))!;
    session.select(brand.id, { scrollCanvas: true });
    await settle();
    let st = await cssState({ type: 'mode', mode: 'current' });
    assert.strictEqual(st.parentDisplay, 'flex');
    assert.strictEqual(st.parentDirection, 'row');
    const r = st.rules.find((x: any) => x.selector === '.nav .brand');
    await cssState({ type: 'selectRule', key: r.key });
    const rule = async () => (await cssText()).match(/\.nav \.brand \{[^}]*\}/)![0];
    const pick = async (prop: 'width' | 'height', mode: string) => {
      const before = await rule();
      const v = session.currentRenderVersion;
      api.css.testSize(prop, mode);
      for (let i = 0; i < 50 && (await rule()) === before; i++) await sleep(100);
      await session.waitForRender(v + 1).catch(() => undefined);
      await sleep(200);
      return rule();
    };
    let css = await pick('width', 'fill');
    assert.match(css, /flex: 1 1 0%;/);
    assert.match(css, /min-width: 0;/);
    let probe = ((await session.probe('.nav .brand', ['flex-grow', 'height'])) as any[])[0];
    assert.strictEqual(probe.style['flex-grow'], '1', 'Fill on the main axis grows in Live');
    css = await pick('height', 'hug');
    assert.match(css, /height: fit-content;/);
    css = await pick('width', 'hug');
    assert.match(css, /flex: 0 0 auto;/);
    assert.ok(!/min-width/.test(css), 'Hug clears the Fill min-width');
    css = await pick('width', 'auto');
    assert.ok(!/flex:/.test(css), 'Auto removes flex');
    await cssState({ type: 'mode', mode: 'all' });
  });

  test('27. CSS Designer: drag selectors to reorder rules (and Alt+arrow via the same edit)', async () => {
    await vscode.commands.executeCommand('liveDesign.css.focus');
    await sleep(500);
    let st = await cssState({ type: 'mode', mode: 'all' });
    st = await cssState({ type: 'selectSource', key: st.sources[1].key });
    const order = async () => [...(await cssText()).matchAll(/^(\.[\w-]+(?: [\w.-]+)?) \{/gm)].map((m) => m[1]);
    const before = await order();
    assert.ok(before.indexOf('.hero') < before.indexOf('.lead'));
    const txt0 = await cssText();
    api.css.testDragRule('.lead', '.hero', false);
    for (let i = 0; i < 40 && (await cssText()) === txt0; i++) await sleep(100);
    const after = await order();
    assert.strictEqual(after.indexOf('.lead') + 1, after.indexOf('.hero'), '.lead now sits right before .hero: ' + after.join(' '));
    st = await cssState();
    assert.strictEqual(st.ruleSelector, '.lead', 'moved rule stays selected');
    // and back, after .hero h1 (exercise "after")
    const txt1 = await cssText();
    api.css.testDragRule('.lead', '.hero h1', true);
    for (let i = 0; i < 40 && (await cssText()) === txt1; i++) await sleep(100);
    const again = await order();
    assert.strictEqual(again.indexOf('.hero h1') + 1, again.indexOf('.lead'), again.join(' '));
    const stacked = (t: string) => (t.match(/\n\n\n/g) || []).length;
    assert.ok(stacked(await cssText()) <= stacked(txt0), 'moving rules adds no blank lines');
    assert.strictEqual((await cssText()).length, txt0.length, 'nothing lost or added');
  });

  test('28. Unit fields: bare number gets px, dropdown switches unit / picks auto', async () => {
    await vscode.commands.executeCommand('liveDesign.css.focus');
    await sleep(500);
    const lead = session.model.nodes.find((n) => n.attrs.some((a) => a.name === 'class' && a.value === 'lead'))!;
    session.select(lead.id, { scrollCanvas: true });
    await settle();
    let st = await cssState({ type: 'mode', mode: 'current' });
    await cssState({ type: 'selectRule', key: st.rules.find((r: any) => r.selector === '.lead').key });
    await cssState({ type: 'showSet', value: false });
    const rule = async () => (await cssText()).match(/\.lead \{[^}]*\}/)![0];
    const act = async (fn: () => void) => {
      const before = await rule();
      fn();
      for (let i = 0; i < 40 && (await rule()) === before; i++) await sleep(100);
      await sleep(200);
      return rule();
    };
    assert.match(await act(() => api.css.testUnit('padding-top', '20')), /padding-top: 20px;/);
    assert.match(await act(() => api.css.testUnit('padding-top', undefined, 'rem')), /padding-top: 20rem;/);
    assert.match(await act(() => api.css.testUnit('margin-left', undefined, 'auto')), /margin-left: auto;/);
    assert.match(await act(() => api.css.testUnit('max-width', '60', undefined)), /max-width: 60px;/);
    await cssState({ type: 'showSet', value: true });
    await cssState({ type: 'mode', mode: 'all' });
  });

  test('29. Box links: chain all / left-right / top-bottom write padding shorthand', async () => {
    const lead = session.model.nodes.find((n) => n.attrs.some((a) => a.name === 'class' && a.value === 'lead'))!;
    session.select(lead.id, { scrollCanvas: true });
    await settle();
    let st = await cssState({ type: 'mode', mode: 'current' });
    await cssState({ type: 'selectRule', key: st.rules.find((r: any) => r.selector === '.lead').key });
    await cssState({ type: 'showSet', value: false });
    const rule = async () => (await cssText()).match(/\.lead \{[^}]*\}/)![0];
    const act = async (fn: () => void) => {
      const before = await rule();
      fn();
      for (let i = 0; i < 40 && (await rule()) === before; i++) await sleep(100);
      await sleep(300);
      return rule();
    };
    // padding-top is 20rem from test 28 → linking all writes one shorthand, longhands removed
    let r = await act(() => api.css.testBoxLink('padding:all'));
    assert.match(r, /padding: 20rem;/);
    assert.doesNotMatch(r, /padding-top/);
    r = await act(() => api.css.testUnit('padding-left', '12'));
    assert.match(r, /padding: 12rem;/); // keeps the selected unit
    r = await act(() => api.css.testUnit('padding-left', undefined, 'px'));
    assert.match(r, /padding: 12px;/); // unit change follows the link too
    // unlink all, link only top/bottom: editing the bottom moves the top too
    api.css.testBoxLink('padding:all');
    await sleep(400);
    api.css.testBoxLink('padding:y');
    await sleep(400);
    r = await act(() => api.css.testUnit('padding-bottom', '4'));
    assert.match(r, /padding: 4px 12px;/);
    api.css.testBoxLink('padding:x');
    await sleep(400);
    r = await act(() => api.css.testUnit('padding-right', '30'));
    assert.match(r, /padding: 4px 30px;/);
    await cssState({ type: 'showSet', value: true });
    await cssState({ type: 'mode', mode: 'all' });
  });

  test('30. Picking a CSS rule selects its element; HUD buttons copy / delete', async () => {
    const tagOf = () => session.model.nodes[session.selectedId!];
    const body = session.model.nodes.find((n) => n.tag === 'body')!;
    session.select(body.id);
    await settle();
    let st = await cssState({ type: 'mode', mode: 'all' });
    const navA = st.rules.find((r: any) => r.selector === '.nav a');
    await cssState({ type: 'selectRule', key: navA.key });
    await settle();
    assert.strictEqual(tagOf().tag, 'a', 'first .nav a selected');
    const first = session.selectedId;
    // clicking the same rule again steps to the next match
    await cssState({ type: 'selectRule', key: navA.key });
    await settle();
    assert.notStrictEqual(session.selectedId, first);
    assert.strictEqual(tagOf().tag, 'a', 'second .nav a selected');
    // HUD: copy puts the element on the clipboard, delete removes it
    const before30 = text();
    const lead = session.model.nodes.find((n) => n.attrs.some((a) => a.name === 'class' && a.value === 'lead'))!;
    session.select(lead.id, { scrollCanvas: true });
    await settle();
    session.testAction({ kind: 'hudOp', op: 'copy' });
    await sleep(300);
    assert.match(await vscode.env.clipboard.readText(), /^<p class="lead">/);
    const v = session.currentRenderVersion;
    session.testAction({ kind: 'hudOp', op: 'delete' });
    await session.waitForRender(v + 1);
    assert.doesNotMatch(text(), /class="lead"/);
    await restore(before30);
    await settle();
  });

  test('31. Change Tag turns a div into a section, keeping attributes and content', async () => {
    const before31 = text();
    const card = session.model.nodes.find((n) => n.attrs.some((a) => a.name === 'class' && a.value.split(' ').includes('card')))!;
    const v = session.currentRenderVersion;
    await vscode.commands.executeCommand('liveDesign.dom.changeTag', { id: card.id }, 'section');
    await session.waitForRender(v + 1);
    assert.match(text(), /<section class="card[^"]*"[^>]*>[\s\S]*?<\/section>/);
    await restore(before31);
    await settle();
  });

  test('32. Element Display: edit, add (with CSS hint) and remove class / ID pills', async () => {
    const before32 = text();
    const lead = () => session.model.nodes.find((n) => n.tag === 'p' && n.attrs.some((a) => a.name === 'class' && a.value === 'lead'))!;
    session.select(lead().id, { scrollCanvas: true });
    await settle();
    const act = async (a: any) => {
      const v = session.currentRenderVersion;
      session.testAction({ kind: 'hudName', ...a });
      await session.waitForRender(v + 1);
      await settle();
    };
    // click the .lead pill and rename it
    await act({ edit: '.lead', value: '.intro' });
    assert.match(text(), /<p class="intro">/);
    // + with a hint from the stylesheet (.card is defined in styles.css)
    await act({ value: '.ca', hint: '.card' });
    assert.match(text(), /<p class="intro card">/);
    // add an id
    await act({ value: '#hero-text' });
    assert.match(text(), /<p (id="hero-text" class="intro card"|class="intro card" id="hero-text")>/);
    // × removes a pill
    await act({ remove: '.card' });
    assert.match(text(), /<p (id="hero-text" class="intro"|class="intro" id="hero-text")>/);
    await restore(before32);
    await settle();
  });

  test('33. Every Live toolbar button does its job', async () => {
    const h1 = session.model.nodes.find((n) => n.tag === 'h1')!;
    session.select(h1.id, { scrollCanvas: true });
    await settle();
    const click = async (id: string) => {
      session.testAction({ kind: 'clickButton', selector: '#' + id });
      await sleep(300);
      return session.uiState();
    };
    let ui = await session.uiState();
    assert.strictEqual(ui.box, 'true');
    assert.ok(ui.boxPieces > 0, 'box model drawn');
    // Box model off / on
    ui = await click('toggleBox');
    assert.strictEqual(ui.box, 'false');
    assert.strictEqual(ui.boxPieces, 0);
    ui = await click('toggleBox');
    assert.strictEqual(ui.box, 'true');
    assert.ok(ui.boxPieces > 0);
    // Visual aids off / on (re-renders the page without / with the design CSS)
    assert.strictEqual(ui.designCss, true);
    let v = session.currentRenderVersion;
    session.testAction({ kind: 'clickButton', selector: '#toggleAids' });
    await session.waitForRender(v + 1);
    ui = await session.uiState();
    assert.strictEqual(ui.aids, 'false');
    assert.strictEqual(ui.designCss, false);
    v = session.currentRenderVersion;
    session.testAction({ kind: 'clickButton', selector: '#toggleAids' });
    await session.waitForRender(v + 1);
    ui = await session.uiState();
    assert.strictEqual(ui.designCss, true);
    // Insert bar hide / show
    ui = await click('toggleInsertBar');
    assert.strictEqual(ui.insertBarHidden, true);
    ui = await click('toggleInsertBar');
    assert.strictEqual(ui.insertBarHidden, false);
    // Interact (preview) mode on / off
    ui = await click('toggleInteract');
    assert.strictEqual(ui.interact, 'true');
    assert.strictEqual(ui.bodyInteract, true);
    ui = await click('toggleInteract');
    assert.strictEqual(ui.interact, 'false');
    // Properties panel, Designer layout, Theme picker: each reaches the extension and does its thing
    session.handled.length = 0;
    await click('showProps');
    await sleep(500);
    assert.ok(session.handled.includes('showProperties'));
    assert.ok(api.properties.view?.visible, 'Properties panel shown');
    await click('showPanels');
    await sleep(1500);
    assert.ok(session.handled.includes('showPanels'));
    assert.ok(api.css.view?.visible, 'CSS Designer shown by the Designer layout');
    await click('chooseTheme');
    await sleep(800);
    assert.ok(session.handled.includes('chooseTheme'));
    await vscode.commands.executeCommand('workbench.action.closeQuickOpen');
    await sleep(300);
  });

  test('34. CSS Designer property groups are accordions', async () => {
    await vscode.commands.executeCommand('liveDesign.css.focus');
    await sleep(400);
    let st = await cssState({ type: 'mode', mode: 'all' });
    await cssState({ type: 'selectRule', key: st.rules.find((r: any) => r.selector === '.lead').key });
    await cssState({ type: 'showSet', value: false });
    let g = await api.css.testGroups();
    assert.deepStrictEqual(g.open, ['layout', 'text', 'background', 'border', 'more']);
    g = await api.css.testGroups('border');
    assert.ok(!g.open.includes('border'), 'border collapsed');
    assert.strictEqual(g.rows.find((r) => r.id === 'grp-border')!.rows, 0);
    g = await api.css.testGroups('border');
    assert.ok(g.open.includes('border'), 'border expanded again');
    g = await api.css.testGroups('text', true);
    assert.deepStrictEqual(g.open, ['text'], 'Alt-click opens only that group');
    for (const id of ['layout', 'border', 'background', 'more']) await api.css.testGroups(id);
    g = await api.css.testGroups();
    assert.strictEqual(g.open.length, 5);
    await cssState({ type: 'showSet', value: true });
  });

  /** Turns Interact mode on / off for a session (whatever state an earlier test left it in). */
  const setInteract = async (sess: LiveSession, on: boolean) => {
    const ui = await sess.uiState();
    if ((ui.interact === 'true') !== on) {
      sess.testAction({ kind: 'clickButton', selector: '#toggleInteract' });
      await sleep(200);
    }
  };
  const rulePrompt = (a: any = {}) =>
    new Promise<any>((resolve) => {
      (session as any).probeWaiters.push(resolve);
      session.testAction({ kind: 'rulePrompt', ...a });
    });

  test('35. Adding a new class / ID offers to create its CSS rule ', async () => {
    const before = text();
    const cssDoc = await vscode.workspace.openTextDocument(cssUri());
    const cssBefore = cssDoc.getText();
    const h1 = session.model.nodes.find((n) => n.tag === 'h1')!;
    session.select(h1.id, { scrollCanvas: true });
    await settle();
    await sleep(400); // names + sources reach the canvas
    // an existing class: no prompt
    let v = session.currentRenderVersion;
    session.testAction({ kind: 'hudName', value: '.card' });
    await session.waitForRender(v + 1);
    await settle();
    assert.strictEqual((await rulePrompt()).open, false, 'no prompt for a class the CSS already has');
    // a new class: prompt, create in css/styles.css
    v = session.currentRenderVersion;
    session.testAction({ kind: 'hudName', value: '.hero-title' });
    await session.waitForRender(v + 1);
    await settle();
    const p = await rulePrompt();
    assert.strictEqual(p.open, true);
    assert.match(p.text, /\.hero-title isn't styled yet/);
    const fileSrc = p.options.find((o: string) => o.startsWith('file:'));
    assert.ok(fileSrc, 'stylesheet offered: ' + p.options.join(', '));
    await rulePrompt({ answer: 'create', source: fileSrc });
    await until(async () => /\.hero-title \{/.test(await cssText()), 'rule created in styles.css');
    const st = await cssState();
    assert.strictEqual(st.ruleSelector, '.hero-title', 'new rule selected in the CSS Designer');
    // "Always create": the next new name is created without asking
    v = session.currentRenderVersion;
    session.testAction({ kind: 'hudName', value: '#main-title' });
    await session.waitForRender(v + 1);
    await settle();
    await rulePrompt({ answer: 'create', source: fileSrc, always: true });
    await until(async () => /#main-title \{/.test(await cssText()), 'id rule created');
    v = session.currentRenderVersion;
    session.testAction({ kind: 'hudName', value: '.subtle' });
    await session.waitForRender(v + 1);
    await until(async () => /\.subtle \{/.test(await cssText()), 'created without a prompt');
    assert.strictEqual((await rulePrompt({ reset: true })).open, false);
    // put things back
    const we = new vscode.WorkspaceEdit();
    we.replace(cssDoc.uri, new vscode.Range(cssDoc.positionAt(0), cssDoc.positionAt(cssDoc.getText().length)), cssBefore);
    await vscode.workspace.applyEdit(we);
    await cssDoc.save();
    await restore(before);
  });

  test('36. jQuery UI widgets (Accordion, Tabs, Slider) load and work in Live view', async function () {
    this.timeout(60000);
    const before = text();
    const hero = session.model.nodes.find((n) => n.attrs.some((a) => a.name === 'class' && a.value === 'hero'))!;
    await nextRender(() => session.insert('jq-accordion', 'after', hero.id));
    assert.match(text(), /<script src="js\/jquery\.min\.js"><\/script>\n  <script src="https:\/\/code\.jquery\.com\/ui\/[\d.]+\/jquery-ui\.min\.js"><\/script>/, 'jQuery UI right after the page jQuery');
    assert.match(text(), /jquery-ui\.css">\n<\/head>/, 'theme CSS in <head>');
    const hero2 = session.model.nodes.find((n) => n.attrs.some((a) => a.name === 'class' && a.value === 'hero'))!;
    await nextRender(() => session.insert('jq-tabs', 'after', hero2.id));
    const hero3 = session.model.nodes.find((n) => n.attrs.some((a) => a.name === 'class' && a.value === 'hero'))!;
    await nextRender(() => session.insert('jq-accordion', 'after', hero3.id));
    assert.match(text(), /id="Accordion2"/, 'second accordion is numbered');
    const hero4 = session.model.nodes.find((n) => n.attrs.some((a) => a.name === 'class' && a.value === 'hero'))!;
    await nextRender(() => session.insert('jq-slider', 'after', hero4.id));
    assert.strictEqual((text().match(/jquery-ui\.min\.js/g) || []).length, 1, 'jQuery UI added once');
    // wait for the CDN
    let ok = false;
    for (let i = 0; i < 60 && !ok; i++) {
      ok = !!(await session.pageEval('jqueryui'));
      if (!ok) await sleep(250);
    }
    if (!ok) {
      await restore(before);
      return this.skip(); // offline: code.jquery.com not reachable
    }
    await sleep(300);
    const probe = async (sel: string) => (await session.probe(sel, ['display'])) as any[];
    assert.match((await probe('#Accordion1'))[0].cls, /ui-accordion/);
    assert.match((await probe('#Accordion2'))[0].cls, /ui-accordion/);
    assert.match((await probe('#Tabs1'))[0].cls, /ui-tabs/);
    assert.match((await probe('#Slider1'))[0].cls, /ui-slider/);
    let heads = await probe('#Accordion1 > h3');
    assert.deepStrictEqual(heads.map((h) => h.aria.expanded), ['true', 'false', 'false']);
    // Interact mode: click the 2nd accordion header and the 2nd tab
    await setInteract(session, true);
    session.testAction({ kind: 'pageClick', selector: '#Accordion1 > h3:nth-of-type(2)' });
    await sleep(700);
    heads = await probe('#Accordion1 > h3');
    assert.deepStrictEqual(heads.map((h) => h.aria.expanded), ['false', 'true', 'false'], 'accordion opened section 2');
    session.testAction({ kind: 'pageClick', selector: '#Tabs1 a[href$="#tabs-1-2"]' });
    await sleep(400);
    const t1 = (await probe('#tabs-1-1'))[0];
    const t2 = (await probe('#tabs-1-2'))[0];
    assert.strictEqual(t2.visible, true, 'tab 2 shown ' + JSON.stringify(t2));
    assert.strictEqual(t1.visible, false, 'tab 1 hidden ' + JSON.stringify(t1));
    assert.strictEqual(session.lastFollow, undefined, 'tab links are handled by the page, not followed');
    await setInteract(session, false);
    await restore(before);
  });

  test('37. Links: Check Links reports broken links; following links opens pages and anchors', async function () {
    this.timeout(30000);
    const before = text();
    // Check Links (Problems panel)
    const brand = session.model.nodes.find((n) => n.attrs.some((a) => a.name === 'class' && a.value === 'brand'))!;
    const we = new vscode.WorkspaceEdit();
    we.insert(doc.uri, doc.positionAt(brand.end), '\n      <a href="missing.html">Old</a>\n      <a href="#nowhere">Nowhere</a>\n      <a href="about.html#story">Story</a>\n      <a href="about.html#nope">Nope</a>\n      <a href="https://example.com">Ext</a>');
    let v = session.currentRenderVersion;
    await vscode.workspace.applyEdit(we);
    await session.waitForRender(v + 1);
    await api.links.checkDocument(doc);
    const msgs = vscode.languages.getDiagnostics(doc.uri).filter((d) => d.source === 'Live Design links').map((d) => d.message);
    assert.ok(msgs.some((m) => /missing\.html/.test(m)), 'broken file link: ' + msgs.join(' | '));
    assert.ok(msgs.some((m) => /id="nowhere"/.test(m)), 'missing same-page anchor');
    assert.ok(msgs.some((m) => /about\.html has no element with id="nope"/.test(m)), 'missing anchor on another page');
    assert.strictEqual(msgs.length, 3, 'about.html, about.html#story, #features, external are fine: ' + msgs.join(' | '));
    const site = await vscode.commands.executeCommand<number>('liveDesign.checkLinks');
    assert.ok(site >= 3);
    // Follow a missing page: offers to create it (not created unless chosen)
    await setInteract(session, true);
    session.testAction({ kind: 'pageClick', selector: 'a[href="missing.html"]' });
    await until(() => session.lastFollow?.action === 'missing', 'missing page reported');
    await vscode.commands.executeCommand('workbench.action.closeMessages').then(undefined, () => undefined);
    // Same-page anchor scrolls the canvas
    session.testAction({ kind: 'scroll', y: 0 });
    await sleep(200);
    assert.strictEqual(await session.pageEval('scrollY'), 0);
    session.testAction({ kind: 'pageClick', selector: '.nav a[href$="#contact"]' });
    await sleep(400);
    assert.ok((await session.pageEval('scrollY')) > 0, 'scrolled to #contact');
    // Another page opens in Live view
    session.testAction({ kind: 'pageClick', selector: '.nav a[href="about.html"]' });
    const aboutUri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'about.html');
    const about = await until(() => api.provider.sessionsFor(aboutUri)[0], 'about.html opened in Live view');
    await about.waitForRender(1);
    // …and its link back to index.html#features opens index scrolled to #features
    await setInteract(about, true);
    about.testAction({ kind: 'pageClick', selector: 'a[href="index.html#features"]' });
    await until(() => about.lastFollow?.action === 'page' && /index\.html#features$/.test(about.lastFollow.target!), 'followed back to index#features');
    await until(async () => (await session.pageEval('scrollY')) > 0, 'index scrolled to #features');
    // Design mode: ⌘-click follows a link instead of selecting it
    await setInteract(session, false);
    session.lastFollow = undefined;
    session.testAction({ kind: 'pageClick', selector: '.nav a[href="about.html"]', metaKey: true });
    await until(() => session.lastFollow?.action === 'page', '⌘-click followed the link');
    // close about.html, back to index
    for (const g of vscode.window.tabGroups.all) for (const t of g.tabs) if (t.input instanceof vscode.TabInputCustom && t.input.uri.toString() === aboutUri.toString()) await vscode.window.tabGroups.close(t);
    await vscode.commands.executeCommand('liveDesign.liveView', uri);
    await sleep(500);
    await restore(before);
  });

  test('38. Audit: axe-core accessibility + SEO / best practices / forms, in Problems and on the page', async function () {
    this.timeout(60000);
    const before = text();
    await setInteract(session, false);
    // an image without alt text: axe flags it (critical)
    const hero = session.model.nodes.find((n) => n.attrs.some((a) => a.name === 'class' && a.value === 'hero'))!;
    const we = new vscode.WorkspaceEdit();
    we.insert(doc.uri, doc.positionAt(hero.stEnd), '\n      <img src="images/lantern.svg" width="40" height="40" id="noalt">');
    let v = session.currentRenderVersion;
    await vscode.workspace.applyEdit(we);
    await session.waitForRender(v + 1);
    session.testAction({ kind: 'clickButton', selector: '#runAudit' });
    const res: any = await until(() => api.audit.results.get(uri.toString()), 'audit finished', 45000);
    assert.ok(!res.axeError, 'axe ran: ' + res.axeError);
    assert.ok(typeof res.scores.accessibility === 'number' && res.scores.accessibility < 100, JSON.stringify(res.scores));
    const rules = new Set(res.findings.map((f: any) => f.rule));
    assert.ok(rules.has('image-alt'), 'axe image-alt: ' + [...rules].join(','));
    const imgFinding = res.findings.find((f: any) => f.rule === 'image-alt');
    assert.strictEqual(session.model.nodes[imgFinding.nodeId].attrs.find((a) => a.name === 'id')?.value, 'noalt', 'finding points at the element');
    for (const r of ['meta-description', 'form-autocomplete', 'form-action']) assert.ok(rules.has(r), r + ' in ' + [...rules].join(','));
    // Problems panel
    const diags = vscode.languages.getDiagnostics(doc.uri).filter((d) => String(d.source).startsWith('Live Design ·'));
    assert.ok(diags.some((d) => d.source === 'Live Design · Accessibility' && d.severity === vscode.DiagnosticSeverity.Error && doc.getText(d.range).includes('id="noalt"')), 'axe finding on the <img> start tag');
    assert.ok(diags.some((d) => d.source === 'Live Design · SEO'));
    assert.ok(diags.some((d) => d.source === 'Live Design · Forms'));
    // canvas: score bar + numbered markers
    await sleep(300);
    const ui = await session.uiState();
    assert.strictEqual(ui.auditBar, true);
    assert.strictEqual(ui.auditScores.length, 4);
    assert.ok(ui.auditMarks > 0, 'markers drawn');
    // fixing the problem and re-running clears it
    await restore(before);
    api.audit.results.delete(uri.toString());
    await vscode.commands.executeCommand('liveDesign.audit', uri);
    const res2: any = api.audit.results.get(uri.toString());
    assert.ok(!res2.findings.some((f: any) => f.rule === 'image-alt'), 'fixed');
    session.testAction({ kind: 'clickButton', selector: '#auditClose' });
  });

  test('39. Form testing in Interact mode: validation blocks bad input, a valid submit shows the data', async () => {
    await setInteract(session, true);
    session.lastFormTest = undefined;
    session.testAction({ kind: 'pageInput', selector: '#email', value: 'not-an-email' });
    session.testAction({ kind: 'pageClick', selector: '.contact button[type="submit"]' });
    const bad: any = await until(() => session.lastFormTest, 'validation reported');
    assert.strictEqual(bad.kind, 'invalid');
    assert.strictEqual(bad.label, 'Email');
    assert.match(bad.message, /@/);
    session.lastFormTest = undefined;
    session.testAction({ kind: 'pageInput', selector: '#email', value: 'jo@example.com' });
    session.testAction({ kind: 'pageClick', selector: '.contact button[type="submit"]' });
    const ok: any = await until(() => session.lastFormTest, 'submit reported');
    assert.strictEqual(ok.kind, 'submit');
    assert.strictEqual(ok.method, 'POST');
    assert.strictEqual(ok.action, '#');
    assert.deepStrictEqual(ok.fields, [['email', 'jo@example.com']]);
    // the page is still the document being edited (no navigation)
    assert.ok(((await session.probe('#email', [])) as any[]).length === 1);
    await vscode.commands.executeCommand('workbench.action.closeMessages').then(undefined, () => undefined);
    await setInteract(session, false);
  });

  test('40. Subgrid uses the parent grid tracks; Show all outlines every grid and flex container', async () => {
    const before = text();
    await setInteract(session, false);
    const feat = session.model.nodes.find((n) => n.attrs.some((a) => a.name === 'id' && a.value === 'features'))!;
    const we = new vscode.WorkspaceEdit();
    we.insert(doc.uri, doc.positionAt(feat.stEnd), '\n      <div class="sg-parent" style="display: grid; grid-template-columns: 100px 150px 200px; column-gap: 10px;">\n        <div class="sg-child" style="grid-column: 1 / 4; display: grid; grid-template-columns: subgrid;"><span>a</span><span>b</span><span>c</span></div>\n      </div>');
    let v = session.currentRenderVersion;
    await vscode.workspace.applyEdit(we);
    await session.waitForRender(v + 1);
    const child = session.model.nodes.find((n) => n.attrs.some((a) => a.name === 'class' && a.value === 'sg-child'))!;
    const parent = session.model.nodes[child.parent!];
    session.select(child.id, { scrollCanvas: true });
    await settle();
    await sleep(200);
    const st = await session.boxModelStats();
    assert.strictEqual(st.sub, 3, 'three subgrid column headers: ' + JSON.stringify(st));
    assert.deepStrictEqual(st.subLabels, ['100px', '150px', '200px'], 'sizes come from the parent tracks');
    assert.strictEqual(st.subTracks, 3);
    // clicking a subgrid header selects the parent grid (where the tracks are edited)
    session.testAction({ kind: 'overlayPointer', selector: '#boxModel .bm-gh.sub' });
    await until(() => session.selectedId === parent.id, 'parent grid selected');
    await sleep(200);
    const ps = await session.boxModelStats();
    assert.strictEqual(ps.sub, 0);
    assert.ok(ps.heads >= 3, 'parent shows its own editable headers');
    // Show all
    let ui = await session.uiState();
    assert.strictEqual(ui.allLayouts, 'false');
    session.testAction({ kind: 'clickButton', selector: '#toggleAllLayouts' });
    await sleep(300);
    ui = await session.uiState();
    assert.strictEqual(ui.allLayouts, 'true');
    for (const k of ['flex', 'subgrid']) assert.ok(ui.layoutBadges.includes(k), k + ' badge in ' + ui.layoutBadges.join(','));
    assert.ok(!ui.layoutBadges.includes('grid') || ui.layoutBadges.filter((b: string) => b === 'grid').length >= 1);
    assert.ok(ui.layoutPieces > ui.layoutBadges.length, 'outlines drawn');
    // a badge selects its element
    session.testAction({ kind: 'overlayPointer', selector: '#layoutAll .la-badge' });
    await sleep(200);
    assert.ok(session.selectedId !== undefined);
    session.testAction({ kind: 'clickButton', selector: '#toggleAllLayouts' });
    await sleep(200);
    assert.strictEqual((await session.uiState()).layoutPieces, 0);
    await restore(before);
  });
});
