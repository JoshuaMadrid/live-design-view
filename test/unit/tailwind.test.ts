import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHtml } from '../../src/htmlModel';
import { SNIPPETS, INSERT_CATEGORIES } from '../../src/snippets';
import { TW_GROUPS, TW_SNIPPETS } from '../../src/tailwind';

test('Tailwind: the usual front-end kit is in groups, and every group item has a snippet', () => {
  const kit = ['container', 'grid', 'navbar', 'breadcrumb', 'pagination', 'tabs', 'card', 'table', 'button', 'button-group', 'badge', 'input',
    'select', 'checkbox', 'switch', 'input-group', 'alert', 'toast', 'progress', 'spinner', 'tooltip', 'accordion', 'dropdown', 'modal',
    'offcanvas', 'carousel', 'hero', 'pricing', 'footer', 'product-card'];
  const grouped = new Set(TW_GROUPS.flatMap((g) => g.items));
  for (const c of kit) assert.ok(grouped.has('tw-' + c), `missing tw-${c}`);
  for (const k of grouped) assert.ok(SNIPPETS[k], `group item ${k} has no snippet`);
  for (const sn of TW_SNIPPETS) assert.ok(grouped.has(sn.key), `${sn.key} is in no group`);
  assert.ok(INSERT_CATEGORIES.find((c) => c.name === 'Tailwind')!.groups);
  assert.deepEqual(SNIPPETS['tw-card'].requires, ['tailwind']);
});

test('Tailwind: every snippet is one well-formed element of its tag', () => {
  for (const sn of TW_SNIPPETS) {
    const html = `<!doctype html><html><head><title>t</title></head><body>\n${sn.lines.join('\n')}\n</body></html>`;
    const m = parseHtml(html);
    assert.deepEqual(m.issues.map((i) => i.code), [], `${sn.key} has parse issues`);
    const body = m.nodes.find((n) => n.tag === 'body')!;
    const kids = body.children.map((c) => m.nodes[c]).filter((n) => n.tag !== '#text' && n.tag !== '#comment');
    assert.equal(kids.length, 1, `${sn.key} should have one root element`);
    assert.equal(kids[0].tag, sn.tag, `${sn.key} root tag`);
  }
});
