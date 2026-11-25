import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHtml, buildServedHtml, nodeAtOffset, isExternalUrl, type HtmlModel } from '../../src/htmlModel';
import {
  insertSnippet,
  deleteElement,
  moveElement,
  setAttribute,
  editTexts,
  detectIndentUnit,
  type TextEdit,
  type EditResult,
} from '../../src/edits';

function apply(text: string, edits: TextEdit[]): string {
  return [...edits].sort((a, b) => b.start - a.start).reduce((t, e) => t.slice(0, e.start) + e.text + t.slice(e.end), text);
}
const find = (m: HtmlModel, tag: string, nth = 0) => m.nodes.filter((n) => n.tag === tag)[nth];
function run(src: string, fn: (m: HtmlModel) => EditResult) {
  const m = parseHtml(src);
  const r = fn(m);
  assert.ok(r.ok, !r.ok ? r.message : '');
  const out = apply(src, r.edits);
  return { out, r, after: parseHtml(out) };
}

const PAGE = `<!DOCTYPE html>
<html>
<head>
  <title>T</title>
</head>
<body>
  <main>
    <section class="hero">
      <h1>Hello</h1>
      <p>Para <b>bold</b> &amp; more</p>
    </section>
    <div class="card"></div>
    <img src="a.png" alt="x"/>
  </main>
</body>
</html>
`;

test('ids are injected only into the served copy', () => {
  const m = parseHtml(PAGE);
  const served = buildServedHtml(m, { nonce: 'N', baseHref: 'https://x/', rewriteUrl: (u) => 'https://x/' + u });
  assert.ok(!PAGE.includes('data-ld-id'));
  assert.equal((served.match(/data-ld-id=/g) || []).length, m.nodes.filter((n) => n.located).length);
  assert.match(served, /<img src="https:\/\/x\/a.png" alt="x" data-ld-id="\d+"\/>/);
  assert.match(served, /<head data-ld-id="\d+"><base href="https:\/\/x\/">/);
  // Re-parsing the served copy yields the same element structure.
  const again = parseHtml(served);
  assert.deepEqual(again.nodes.map((n) => n.tag).filter((t) => t !== 'base'), m.nodes.map((n) => n.tag));
});

test('scripts get the CSP nonce and external URLs are left alone', () => {
  const src = '<script src="js/a.js"></script><script>var x=1</script><link rel="stylesheet" href="https://cdn/x.css">';
  const served = buildServedHtml(parseHtml(src), { nonce: 'N', baseHref: 'b/', rewriteUrl: (u) => (isExternalUrl(u) ? undefined : 'W/' + u) });
  assert.match(served, /<script src="W\/js\/a.js" data-ld-id="\d+" nonce="N">/);
  assert.match(served, /<script data-ld-id="\d+" nonce="N">var x=1/);
  assert.match(served, /href="https:\/\/cdn\/x.css"/);
});

test('insert before/after keeps indentation on own line', () => {
  const { out } = run(PAGE, (m) => insertSnippet(m, find(m, 'h1').id, 'p', 'before'));
  assert.match(out, /\n      <p>Lorem ipsum[^\n]*<\/p>\n      <h1>Hello<\/h1>/);
  const { out: out2, after, r } = run(PAGE, (m) => insertSnippet(m, find(m, 'h1').id, 'ul', 'after'));
  assert.match(out2, /<h1>Hello<\/h1>\n      <ul>\n        <li>List item<\/li>\n        <li>List item<\/li>\n      <\/ul>\n      <p>Para/);
  assert.ok(r.ok && after.nodes.find((n) => n.start === r.selectStart)?.tag === 'ul');
});

test('insert inside an empty element opens it onto lines', () => {
  const { out } = run(PAGE, (m) => insertSnippet(m, find(m, 'div').id, 'h2', 'inside-first'));
  assert.match(out, /<div class="card">\n      <h2>Heading 2<\/h2>\n    <\/div>/);
});

test('insert inside first/last of block content', () => {
  const { out } = run(PAGE, (m) => insertSnippet(m, find(m, 'section').id, 'h2', 'inside-first'));
  assert.match(out, /<section class="hero">\n      <h2>Heading 2<\/h2>\n      <h1>Hello/);
  const { out: o2, after, r } = run(PAGE, (m) => insertSnippet(m, find(m, 'section').id, 'button', 'inside-last'));
  assert.match(o2, /<\/p>\n      <button type="button">Button<\/button>\n    <\/section>/);
  assert.ok(r.ok && after.nodes.find((n) => n.start === r.selectStart)?.tag === 'button');
});

test('insert inline inside a paragraph stays inline', () => {
  const { out } = run(PAGE, (m) => insertSnippet(m, find(m, 'p').id, 'em', 'inside-last'));
  assert.match(out, /<p>Para <b>bold<\/b> &amp; more<em>Emphasized text<\/em><\/p>/);
  const { out: o2 } = run(PAGE, (m) => insertSnippet(m, find(m, 'b').id, 'a', 'after'));
  assert.match(o2, /<b>bold<\/b><a href="#">Link text<\/a> &amp;/);
});

test('only the inserted text changes', () => {
  const m = parseHtml(PAGE);
  const r = insertSnippet(m, find(m, 'h1').id, 'span', 'after');
  assert.ok(r.ok);
  assert.equal(r.edits.length, 1);
  assert.equal(r.edits[0].start, r.edits[0].end);
});

test('invalid targets are rejected', () => {
  const m = parseHtml(PAGE);
  const r = insertSnippet(m, find(m, 'img').id, 'p', 'inside-first');
  assert.ok(!r.ok && /can't contain/.test(r.message));
  const r2 = insertSnippet(m, find(m, 'body').id, 'p', 'before');
  assert.ok(!r2.ok);
  const brm = parseHtml('<p>a<br>b</p>');
  const r3 = insertSnippet(brm, find(brm, 'br').id, 'span', 'inside-last');
  assert.ok(!r3.ok);
});

test('tabs are detected and used', () => {
  const src = '<body>\n\t<main>\n\t\t<p>x</p>\n\t</main>\n</body>';
  assert.equal(detectIndentUnit(src), '\t');
  const { out } = run(src, (m) => insertSnippet(m, find(m, 'p').id, 'ul', 'after'));
  assert.match(out, /<p>x<\/p>\n\t\t<ul>\n\t\t\t<li>List item<\/li>/);
});

test('delete removes the whole line when element is alone on it', () => {
  const { out } = run(PAGE, (m) => deleteElement(m, find(m, 'h1').id));
  assert.equal(out, PAGE.replace('      <h1>Hello</h1>\n', ''));
  const { out: o2 } = run(PAGE, (m) => deleteElement(m, find(m, 'b').id));
  assert.equal(o2, PAGE.replace('<b>bold</b>', ''));
});

test('move up/down swaps with sibling and reports new start', () => {
  const { out, after, r } = run(PAGE, (m) => moveElement(m, find(m, 'p').id, 'up'));
  assert.match(out, /<section class="hero">\n      <p>Para <b>bold<\/b> &amp; more<\/p>\n      <h1>Hello<\/h1>/);
  assert.ok(r.ok && after.nodes.find((n) => n.start === r.selectStart)?.tag === 'p');
  const { out: o2, after: a2, r: r2 } = run(PAGE, (m) => moveElement(m, find(m, 'h1').id, 'down'));
  assert.equal(o2, out);
  assert.ok(r2.ok && a2.nodes.find((n) => n.start === r2.selectStart)?.tag === 'h1');
  const bad = moveElement(parseHtml(PAGE), find(parseHtml(PAGE), 'h1').id, 'up');
  assert.ok(!bad.ok);
});

test('setAttribute edits only the start tag', () => {
  const { out } = run(PAGE, (m) => setAttribute(m, find(m, 'div').id, 'id', 'promo'));
  assert.equal(out, PAGE.replace('<div class="card">', '<div class="card" id="promo">'));
  const { out: o2 } = run(PAGE, (m) => setAttribute(m, find(m, 'div').id, 'class', 'card big'));
  assert.equal(o2, PAGE.replace('class="card"', 'class="card big"'));
  const { out: o3 } = run(PAGE, (m) => setAttribute(m, find(m, 'div').id, 'class', ''));
  assert.equal(o3, PAGE.replace('<div class="card">', '<div>'));
  const { out: o4 } = run(PAGE, (m) => setAttribute(m, find(m, 'img').id, 'width', '20'));
  assert.equal(o4, PAGE.replace('<img src="a.png" alt="x"/>', '<img src="a.png" alt="x" width="20"/>'));
  const { out: o5 } = run(PAGE, (m) => setAttribute(m, find(m, 'img').id, 'alt', 'say "hi" & bye'));
  assert.ok(o5.includes('alt="say &quot;hi&quot; &amp; bye"'));
});

test('editTexts replaces only changed text node ranges and keeps entities elsewhere', () => {
  const m = parseHtml(PAGE);
  const p = find(m, 'p');
  assert.deepEqual(p.texts.map((t) => t.value), ['Para ', 'bold', ' & more']);
  const { out } = run(PAGE, (mm) => editTexts(mm, p.id, [{ index: 1, value: 'brave <new>' }], 3));
  assert.equal(out, PAGE.replace('<b>bold</b>', '<b>brave &lt;new></b>'));
  const fail = editTexts(m, p.id, [{ index: 0, value: 'x' }], 2);
  assert.ok(!fail.ok);
  const { out: o2 } = run(PAGE, (mm) => editTexts(mm, find(mm, 'div').id, [{ index: 0, value: 'Hi' }], 0));
  assert.ok(o2.includes('<div class="card">Hi</div>'));
});

test('nodeAtOffset finds innermost element', () => {
  const m = parseHtml(PAGE);
  assert.equal(nodeAtOffset(m, PAGE.indexOf('bold'))?.tag, 'b');
  assert.equal(nodeAtOffset(m, PAGE.indexOf('Para'))?.tag, 'p');
});

test('implied end tags (li without </li>) still insert correctly', () => {
  const src = '<ul>\n  <li>One\n  <li>Two\n</ul>';
  const { out } = run(src, (m) => insertSnippet(m, find(m, 'li', 1).id, 'li', 'after'));
  assert.equal(out, '<ul>\n  <li>One\n  <li>Two\n  <li>List item</li>\n</ul>');
});

test('parse issues are collected but parsing still succeeds', () => {
  const m = parseHtml('<div><p>unclosed <b>x</div></span>');
  assert.ok(m.issues.length > 0);
  assert.ok(m.nodes.some((n) => n.tag === 'b'));
});

test('wrap re-indents block elements and stays inline for inline ones', async () => {
  const { wrapElement } = await import('../../src/edits');
  const { out, after, r } = run(PAGE, (m) => wrapElement(m, find(m, 'h1').id, 'div'));
  assert.match(out, /\n      <div>\n        <h1>Hello<\/h1>\n      <\/div>\n      <p>Para/);
  assert.ok(r.ok && after.nodes.find((n) => n.start === r.selectStart)?.tag === 'div');
  const { out: o2 } = run(PAGE, (m) => wrapElement(m, find(m, 'b').id, 'a'));
  assert.ok(o2.includes('<p>Para <a href="#"><b>bold</b></a> &amp; more</p>'));
  const { out: o3 } = run(PAGE, (m) => wrapElement(m, find(m, 'section').id, 'main'));
  assert.match(o3, /    <main>\n      <section class="hero">\n        <h1>Hello<\/h1>\n        <p>Para[^\n]*\n      <\/section>\n    <\/main>/);
  const bad = wrapElement(parseHtml(PAGE), find(parseHtml(PAGE), 'h1').id, 'img');
  assert.ok(!bad.ok);
});

test('Tailwind snippets add the CDN script to <head> once', async () => {
  const { ensureHeadAssets } = await import('../../src/edits');
  const m = parseHtml(PAGE);
  const e = ensureHeadAssets(m, ['tailwind']);
  const out = apply(PAGE, e);
  assert.match(out, /  <title>T<\/title>\n  <script src="https:\/\/cdn.tailwindcss.com\/3.4.17"><\/script>\n<\/head>/);
  assert.deepEqual(ensureHeadAssets(parseHtml(out), ['tailwind']), []);
  const r = apply(PAGE, ensureHeadAssets(m, ['react']));
  assert.equal((r.match(/<script/g) || []).length, 3);
});

test('snippet files: header metadata, relative indentation, roots', async () => {
  const { parseSnippetFile, serializeSnippet, dedent } = await import('../../src/snippetLibrary');
  const text = serializeSnippet('<div class="flex gap-4">\n      <p>a</p>\n    </div>', { trigger: 'row' });
  assert.match(text, /^<!-- snippet: \{"trigger":"row"\} -->\n<div class="flex gap-4">\n  <p>a<\/p>\n<\/div>\n$/);
  const s = parseSnippetFile('Tailwind_Layouts', 'Row.html', text);
  assert.equal(s.key, 'user:Tailwind_Layouts/Row');
  assert.equal(s.meta.trigger, 'row');
  assert.deepEqual(s.lines, ['<div class="flex gap-4">', '\t<p>a</p>', '</div>']);
  assert.deepEqual(s.requires, ['tailwind']);
  assert.equal(s.tag, 'div');
  assert.equal(s.noWrap, false);
  const multi = parseSnippetFile('R', 'X.html', '<div id="x"></div>\n<script type="text/babel">1</script>');
  assert.ok(multi.noWrap);
  assert.deepEqual(multi.requires, ['react']);
  assert.equal(dedent('<ul>\n    <li>x</li>\n  </ul>'), '<ul>\n  <li>x</li>\n</ul>');
});

test('empty page: first insert creates the HTML5 structure; implied <body> accepts children', async () => {
  const { insertSnippet, scaffoldPage } = await import('../../src/edits');
  const empty = parseHtml('');
  const body = empty.nodes.find((n) => n.tag === 'body')!;
  const r = insertSnippet(empty, body.id, 'div', 'inside-last');
  assert.ok(r.ok);
  const out = apply('', r.edits);
  assert.match(out, /^<!DOCTYPE html>\n<html lang="en">\n<head>\n[\s\S]*<\/head>\n<body>\n  <div><\/div>\n<\/body>\n<\/html>\n$/);
  assert.equal(parseHtml(out).nodes.find((n) => n.start === r.selectStart)?.tag, 'div');
  const ul = insertSnippet(empty, body.id, 'ul', 'inside-last');
  assert.ok(ul.ok && apply('', ul.edits).includes('<body>\n  <ul>\n    <li>List item</li>\n    <li>List item</li>\n  </ul>\n</body>'));
  // Content without <body>: append after the last element.
  const loose = '<h1>a</h1>\n';
  const m = parseHtml(loose);
  const r2 = insertSnippet(m, m.nodes.find((n) => n.tag === 'body')!.id, 'p', 'inside-last');
  assert.ok(r2.ok);
  assert.equal(apply(loose, r2.edits), '<h1>a</h1>\n<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>\n');
  const sc = scaffoldPage(parseHtml('  \n'));
  assert.ok(sc.ok && apply('  \n', sc.edits).startsWith('<!DOCTYPE html>'));
});

test('insertInline puts characters at the end of an element\'s text', async () => {
  const { insertInline } = await import('../../src/edits');
  const m = parseHtml(PAGE);
  assert.equal(apply(PAGE, (insertInline(m, find(m, 'h1').id, '&copy;') as any).edits), PAGE.replace('<h1>Hello</h1>', '<h1>Hello&copy;</h1>'));
  assert.equal(apply(PAGE, (insertInline(m, find(m, 'img').id, '<br>') as any).edits), PAGE.replace('alt="x"/>', 'alt="x"/><br>'));
  assert.equal(apply(PAGE, (insertInline(m, find(m, 'section').id, 'X') as any).edits), PAGE.replace('</p>\n    </section>', '</p>X\n    </section>'));
});

test('moveElementTo: reorder, nest (re-indented), refuse into itself', async () => {
  const { moveElementTo } = await import('../../src/edits');
  const m = parseHtml(PAGE);
  // h1 after p (sibling reorder)
  const r = moveElementTo(m, find(m, 'h1').id, find(m, 'p').id, 'after');
  assert.ok(r.ok);
  const out = apply(PAGE, r.edits);
  assert.match(out, /<section class="hero">\n      <p>Para <b>bold<\/b> &amp; more<\/p>\n      <h1>Hello<\/h1>\n    <\/section>/);
  assert.equal(parseHtml(out).nodes.find((n) => n.start === r.selectStart)?.tag, 'h1');
  // section into the empty .card div as first child: lines shift one level deeper
  const r2 = moveElementTo(m, find(m, 'section').id, find(m, 'div').id, 'inside-first');
  assert.ok(r2.ok);
  const out2 = apply(PAGE, r2.edits);
  assert.match(out2, /<main>\n    <div class="card">\n      <section class="hero">\n        <h1>Hello<\/h1>\n        <p>Para[^\n]*<\/p>\n      <\/section>\n    <\/div>/);
  assert.equal(parseHtml(out2).nodes.find((n) => n.start === r2.selectStart)?.tag, 'section');
  assert.ok(!moveElementTo(m, find(m, 'section').id, find(m, 'h1').id, 'inside-last').ok);
});

test('renameTag, boolean attributes, wrapWith, replaceContent', async () => {
  const { renameTag, setBooleanAttribute, wrapWith, replaceContent } = await import('../../src/edits');
  const m = parseHtml(PAGE);
  assert.equal(apply(PAGE, (renameTag(m, find(m, 'h1').id, 'h2') as any).edits), PAGE.replace('<h1>Hello</h1>', '<h2>Hello</h2>'));
  const f = '<input type="text" name="q">\n<select name="s"><option>a</option></select>';
  const fm = parseHtml(f);
  const on = apply(f, (setBooleanAttribute(fm, find(fm, 'input').id, 'required', true) as any).edits);
  assert.equal(on, f.replace('name="q">', 'name="q" required>'));
  const om = parseHtml(on);
  assert.equal(apply(on, (setBooleanAttribute(om, find(om, 'input').id, 'required', false) as any).edits), f);
  assert.equal(apply(PAGE, (wrapWith(m, find(m, 'img').id, '<a href="x.html">', 'a') as any).edits), PAGE.replace('<img src="a.png" alt="x"/>', '<a href="x.html"><img src="a.png" alt="x"/></a>'));
  assert.equal(apply(f, (replaceContent(fm, find(fm, 'select').id, ['<option value="1">One</option>']) as any).edits), f.replace('<option>a</option>', '\n  <option value="1">One</option>\n'));
});

test('insertMarkup re-indents pasted HTML at the target', async () => {
  const { insertMarkup } = await import('../../src/edits');
  const m = parseHtml(PAGE);
  const pasted = '<ul>\n        <li>a</li>\n      </ul>';
  const r = insertMarkup(m, find(m, 'h1').id, pasted, 'after');
  assert.ok(r.ok);
  assert.match(apply(PAGE, r.edits), /<h1>Hello<\/h1>\n      <ul>\n        <li>a<\/li>\n      <\/ul>\n      <p>/);
  const r2 = insertMarkup(m, find(m, 'div').id, '<b>x</b>', 'inside-last');
  assert.ok(r2.ok && apply(PAGE, r2.edits).includes('<div class="card">\n      <b>x</b>\n    </div>'));
});

test('numbered widget ids and jQuery UI placed after the page\'s jQuery', async () => {
  const { numberLines, ensureHeadAssets } = await import('../../src/edits');
  assert.deepEqual(numberLines(['<div id="Tabs{{n}}">', '<a href="#tabs-{{n}}-1">'], '<div id="Tabs1"></div>'), ['<div id="Tabs2">', '<a href="#tabs-2-1">']);
  assert.deepEqual(numberLines(['<p>x</p>'], ''), ['<p>x</p>']);
  const page = '<!DOCTYPE html>\n<html>\n<head>\n  <title>t</title>\n</head>\n<body>\n  <p>x</p>\n  <script src="js/jquery.min.js"></script>\n</body>\n</html>\n';
  const m = parseHtml(page);
  const edits = ensureHeadAssets(m, ['jqueryui']);
  const out = [...edits].sort((a, b) => b.start - a.start).reduce((t, e) => t.slice(0, e.start) + e.text + t.slice(e.end), page);
  assert.match(out, /<link rel="stylesheet" href="https:\/\/code\.jquery\.com\/ui\/[\d.]+\/themes\/base\/jquery-ui\.css">\n<\/head>/);
  assert.match(out, /<script src="js\/jquery\.min\.js"><\/script>\n  <script src="https:\/\/code\.jquery\.com\/ui\/[\d.]+\/jquery-ui\.min\.js"><\/script>/);
  assert.doesNotMatch(out, /jquery-3\.7\.1/); // page already has jQuery
  // a page without jQuery gets jQuery + UI in <head>
  const bare = parseHtml('<!DOCTYPE html>\n<html>\n<head>\n  <title>t</title>\n</head>\n<body></body>\n</html>\n');
  const e2 = ensureHeadAssets(bare, ['jqueryui']);
  assert.match(e2.map((e) => e.text).join(''), /jquery-ui\.css[\s\S]*jquery-3\.7\.1\.min\.js[\s\S]*jquery-ui\.min\.js/);
  assert.deepEqual(ensureHeadAssets(parseHtml(out), ['jqueryui']), []);
});
