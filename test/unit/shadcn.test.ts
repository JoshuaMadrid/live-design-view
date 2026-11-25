import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHtml } from '../../src/htmlModel';
import { SNIPPETS, INSERT_CATEGORIES } from '../../src/snippets';
import { SHADCN_GROUPS, SHADCN_SNIPPETS } from '../../src/shadcn';

test('shadcn/ui: every official component is in a group', () => {
  // ui.shadcn.com/docs/components (2026-11)
  const official = ['accordion', 'alert', 'alert-dialog', 'aspect-ratio', 'attachment', 'avatar', 'badge', 'breadcrumb', 'bubble', 'button',
    'button-group', 'calendar', 'card', 'carousel', 'chart', 'checkbox', 'code-block', 'collapsible', 'combobox', 'command', 'context-menu',
    'data-table', 'date-picker', 'dialog', 'direction', 'drawer', 'dropdown-menu', 'empty', 'field', 'hover-card', 'input', 'input-group',
    'input-otp', 'item', 'kbd', 'label', 'marker', 'menubar', 'message', 'message-scroller', 'native-select', 'navigation-menu', 'pagination',
    'popover', 'progress', 'questionnaire', 'radio-group', 'resizable', 'scroll-area', 'select', 'separator', 'sheet', 'sidebar', 'skeleton',
    'slider', 'spinner', 'switch', 'table', 'tabs', 'textarea', 'toast', 'toggle', 'toggle-group', 'tooltip', 'trace', 'typography'];
  const grouped = new Set(SHADCN_GROUPS.flatMap((g) => g.items));
  for (const c of official) assert.ok(grouped.has('sc-' + c), `missing sc-${c}`);
  for (const k of grouped) if (k !== '-') assert.ok(SNIPPETS[k], `group item ${k} has no snippet`);
  assert.ok(INSERT_CATEGORIES.find((c) => c.name === 'shadcn/ui')!.groups);
});

test('shadcn/ui: every snippet is one well-formed element of its tag', () => {
  for (const sn of SHADCN_SNIPPETS) {
    const html = `<!doctype html><html><head><title>t</title></head><body>\n${sn.lines.join('\n')}\n</body></html>`;
    const m = parseHtml(html);
    assert.deepEqual(m.issues.map((i) => i.code), [], `${sn.key} has parse issues`);
    const body = m.nodes.find((n) => n.tag === 'body')!;
    const kids = body.children.map((c) => m.nodes[c]).filter((n) => n.tag !== '#text' && n.tag !== '#comment');
    assert.equal(kids.length, 1, `${sn.key} should have one root element`);
    assert.equal(kids[0].tag, sn.tag, `${sn.key} root tag`);
    assert.ok(!sn.lines.some((l) => / {2}/.test(l.match(/^\s*/)![0])), `${sn.key} uses spaces for indent`);
  }
});
