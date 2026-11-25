import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCss,
  setDeclaration,
  removeDeclaration,
  toggleDeclaration,
  addRule,
  addMedia,
  removeRule,
  specificity,
  compareSpecificity,
  matchableSelector,
  expandBox,
  collapseBox,
  detectCssIndent,
} from '../../src/css/cssModel';
import type { TextEdit } from '../../src/edits';

const apply = (t: string, e: TextEdit[]) => [...e].sort((a, b) => b.start - a.start).reduce((s, x) => s.slice(0, x.start) + x.text + s.slice(x.end), t);

const CSS = `body {
  margin: 0;
  color: #333;
}

.hero h1 {
  font-size: 2rem
}

@media (max-width: 600px) {
  .hero h1 {
    font-size: 1.5rem;
    /* color: red; */
  }
}
`;

test('parses rules, media, disabled declarations', () => {
  const m = parseCss(CSS);
  assert.deepEqual(m.rules.map((r) => [r.selector, r.media]), [['body', undefined], ['.hero h1', undefined], ['.hero h1', 0]]);
  assert.equal(m.media[0].params, '(max-width: 600px)');
  const d = m.rules[2].decls;
  assert.deepEqual(d.map((x) => [x.prop, x.value, x.disabled]), [['font-size', '1.5rem', false], ['color', 'red', true]]);
  assert.equal(detectCssIndent(CSS), '  ');
});

test('set existing / add new declarations with minimal edits', () => {
  const m = parseCss(CSS);
  assert.equal(apply(CSS, setDeclaration(m, 0, 'color', 'navy')), CSS.replace('color: #333;', 'color: navy;'));
  // Adding after a last declaration without ";" adds the missing semicolon.
  const out = apply(CSS, setDeclaration(m, 1, 'line-height', '1.2'));
  assert.ok(out.includes('.hero h1 {\n  font-size: 2rem;\n  line-height: 1.2;\n}'));
  const out2 = apply(CSS, setDeclaration(m, 2, 'margin', '0 auto !important'));
  assert.ok(out2.includes('    /* color: red; */\n    margin: 0 auto !important;\n  }'));
  // Single-line rule stays single-line; empty rule opens up.
  const one = 'a{color:red}';
  assert.equal(apply(one, setDeclaration(parseCss(one), 0, 'margin', '0')), 'a{color:red; margin: 0;}');
  const empty = '.x {\n}\n';
  assert.equal(apply(empty, setDeclaration(parseCss(empty), 0, 'color', 'red')), '.x {\n  color: red;\n}\n');
});

test('empty value removes; toggle comments in and out', () => {
  const m = parseCss(CSS);
  assert.equal(apply(CSS, setDeclaration(m, 0, 'margin', '')), CSS.replace('  margin: 0;\n', ''));
  assert.equal(apply(CSS, removeDeclaration(m, 0, 'color')), CSS.replace('  color: #333;\n', ''));
  assert.equal(apply(CSS, toggleDeclaration(m, 0, 'margin', false)), CSS.replace('margin: 0;', '/* margin: 0; */'));
  assert.equal(apply(CSS, toggleDeclaration(m, 2, 'color', true)), CSS.replace('/* color: red; */', 'color: red;'));
  assert.equal(apply(CSS, setDeclaration(m, 2, 'color', 'blue')), CSS.replace('/* color: red; */', 'color: blue;'));
});

test('add rule at end / inside media, add media, remove rule', () => {
  const m = parseCss(CSS);
  const a = addRule(m, '.card');
  const out = apply(CSS, a.edits);
  assert.ok(out.endsWith('}\n\n.card {\n}\n'));
  assert.equal(out.slice(a.selectorStart, a.selectorStart + 5), '.card');
  const b = apply(CSS, addRule(m, '.nav a', 0).edits);
  assert.ok(b.includes('    /* color: red; */\n  }\n\n  .nav a {\n  }\n}'));
  assert.ok(apply(CSS, addMedia(m, '(min-width: 1024px)')).endsWith('}\n\n@media (min-width: 1024px) {\n}\n'));
  assert.equal(apply(CSS, removeRule(m, 1)), CSS.replace('.hero h1 {\n  font-size: 2rem\n}\n', ''));
});

test('specificity, matchable selectors, box shorthands', () => {
  assert.deepEqual(specificity('#nav .item a:hover'), [1, 2, 1]);
  assert.deepEqual(specificity('ul li::before'), [0, 0, 3]);
  assert.deepEqual(specificity('a[href] > :not(.x, #y)'), [1, 1, 1]);
  assert.ok(compareSpecificity(specificity('.a .b'), specificity('#c')) < 0);
  assert.deepEqual(matchableSelector('.btn:hover::after'), { selector: '.btn', state: true });
  assert.deepEqual(matchableSelector('.btn'), { selector: '.btn', state: false });
  assert.deepEqual(expandBox('1px 2px'), ['1px', '2px', '1px', '2px']);
  assert.equal(collapseBox(['0', 'auto', '0', 'auto']), '0 auto');
  assert.equal(collapseBox(['1px', '2px', '3px', '2px']), '1px 2px 3px');
});

test('setDeclarations: several props in one rule edit; inline style updates', async () => {
  const { setDeclarations, updateInlineStyle } = await import('../../src/css/cssModel');
  const m = parseCss(CSS);
  const e = setDeclarations(m, 1, { display: 'flex', 'flex-direction': 'column', gap: '16px', 'font-size': '' });
  assert.equal(e.length, 1);
  const out = apply(CSS, e);
  assert.ok(out.includes('.hero h1 {\n  display: flex;\n  flex-direction: column;\n  gap: 16px;\n}'), out);
  assert.ok(out.startsWith('body {\n  margin: 0;'));
  assert.equal(updateInlineStyle('color: red; margin: 0', { display: 'grid', color: '' }), 'margin: 0; display: grid;');
  assert.equal(updateInlineStyle('', { gap: '8px' }), 'gap: 8px;');
});

test('removing a declaration from a one-line rule keeps single spacing', () => {
  const one = '.a { color: red; margin: 0; gap: 4px; }';
  assert.equal(apply(one, removeDeclaration(parseCss(one), 0, 'margin')), '.a { color: red; gap: 4px; }');
  assert.equal(apply(one, removeDeclaration(parseCss(one), 0, 'gap')), '.a { color: red; margin: 0; }');
});

test('grid track helpers: split, expand repeat, compress, edit', async () => {
  const { splitTracks, expandTracks, compressTracks, editTracks } = await import('../../src/css/cssModel');
  assert.deepEqual(splitTracks('repeat(2, 1fr) minmax(100px, 1fr) auto'), ['repeat(2, 1fr)', 'minmax(100px, 1fr)', 'auto']);
  assert.deepEqual(expandTracks('repeat(3, 1fr)'), ['1fr', '1fr', '1fr']);
  assert.deepEqual(expandTracks('200px repeat(2, 1fr 2fr)'), ['200px', '1fr', '2fr', '1fr', '2fr']);
  assert.equal(expandTracks('repeat(auto-fit, minmax(200px, 1fr))'), undefined);
  assert.equal(compressTracks(['1fr', '1fr', '1fr']), 'repeat(3, 1fr)');
  assert.equal(compressTracks(['200px', '1fr']), '200px 1fr');
  assert.deepEqual(editTracks(['1fr', '1fr'], 'set', 1, '240px'), ['1fr', '240px']);
  assert.deepEqual(editTracks(['1fr', '2fr'], 'add', -1), ['1fr', '2fr', '2fr']);
  assert.deepEqual(editTracks(['1fr', '2fr'], 'remove', 0), ['2fr']);
  assert.deepEqual(editTracks(['1fr'], 'remove', 0), ['1fr']);
});

test('moveRule reorders rules, keeps attached comments, re-indents into @media', async () => {
  const { moveRule } = await import('../../src/css/cssModel');
  const src = `/* base */
body {
  margin: 0;
}

.a {
  color: red;
}

.b { color: blue; }

@media (max-width: 600px) {
  .c {
    color: green;
  }
}
`;
  const m = parseCss(src);
  // .b before body
  let out = apply(src, moveRule(m, 2, 0, 'before'));
  assert.equal(out, `.b { color: blue; }

/* base */
body {
  margin: 0;
}

.a {
  color: red;
}

@media (max-width: 600px) {
  .c {
    color: green;
  }
}
`);
  // body (with its comment) after .a
  out = apply(src, moveRule(m, 0, 1, 'after'));
  assert.ok(out.startsWith('.a {\n  color: red;\n}\n\n/* base */\nbody {\n  margin: 0;\n}\n\n.b'), out);
  // .a into the media block, after .c → indented two spaces
  out = apply(src, moveRule(m, 1, 3, 'after'));
  assert.ok(out.includes('  .c {\n    color: green;\n  }\n\n  .a {\n    color: red;\n  }\n}'), out);
  assert.ok(!out.includes('\n\n\n'), 'no stacked blank lines');
  // no-op onto itself
  assert.deepEqual(moveRule(m, 1, 1, 'before'), []);
});
