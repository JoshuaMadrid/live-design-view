import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHtml } from '../../src/htmlModel';
import { basicChecks, axeFindings, scores } from '../../src/audit';

const rules = (html: string) => {
  const r = basicChecks(parseHtml(html));
  return { ...r, failed: [...new Set(r.findings.map((f) => f.rule))].sort() };
};

const GOOD = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Handmade lanterns.">
  <title>Lanterns</title>
</head>
<body>
  <h1>Lanterns</h1>
  <a href="about.html">About our studio</a>
  <img src="a.png" alt="A lantern" width="10" height="10">
  <form action="/send" method="post">
    <label for="email">Email</label>
    <input type="email" id="email" name="email" autocomplete="email">
    <button type="submit">Send</button>
  </form>
</body>
</html>`;

test('a clean page passes every basic check', () => {
  const r = rules(GOOD);
  assert.deepEqual(r.failed, []);
  const s = scores(r.checks);
  assert.equal(s.seo, 100);
  assert.equal(s['best-practices'], 100);
  assert.equal(s.forms, 100);
});

test('SEO / best-practice problems are found', () => {
  const r = rules(`<html><head></head><body>
<h1>A</h1><h1>B</h1>
<a href="x.html">Click here</a>
<a href="https://x.com" target="_blank">ext</a>
<img src="http://cdn.example.com/a.png" alt="">
<center>old</center>
<p id="dup"></p><p id="dup"></p>
</body></html>`);
  for (const rule of ['document-title', 'meta-description', 'viewport', 'html-lang', 'one-h1', 'link-text', 'doctype', 'charset', 'noopener', 'https', 'deprecated', 'image-size', 'unique-ids'])
    assert.ok(r.failed.includes(rule), 'expected ' + rule + ' in ' + r.failed.join(','));
  const s = scores(r.checks);
  assert.ok(s.seo! < 50 && s['best-practices']! < 50, JSON.stringify(s));
});

test('form problems are found', () => {
  const r = rules(`<!DOCTYPE html><html lang="en"><head><title>t</title></head><body>
<form method="get">
  <input type="text" id="email" placeholder="Your email">
  <input type="text" name="phone" id="phone"><label for="phone">Phone</label>
  <input type="password" name="pw" aria-label="Password">
  <button>One</button><button>Two</button>
</form>
<form action="/x" method="post"><label>Name <input name="full_name"></label></form>
</body></html>`);
  for (const rule of ['form-labels', 'form-names', 'form-action', 'form-password-get', 'form-input-type', 'form-autocomplete', 'button-type', 'form-submit'])
    assert.ok(r.failed.includes(rule), 'expected ' + rule + ' in ' + r.failed.join(','));
  const label = r.findings.find((f) => f.rule === 'form-labels')!;
  assert.match(label.message, /placeholder instead of a <label>/);
  assert.ok(r.findings.some((f) => f.rule === 'form-input-type' && /type="email"/.test(f.message)));
  assert.ok(r.findings.some((f) => f.rule === 'form-input-type' && /type="tel"/.test(f.message)));
  assert.ok(r.findings.some((f) => f.rule === 'form-autocomplete' && /autocomplete="name"/.test(f.message)));
});

test('axe results become accessibility findings and a weighted score', () => {
  const a = axeFindings({
    violations: [{ id: 'image-alt', impact: 'critical', help: 'Images must have alternate text', helpUrl: 'https://dequeuniversity.com/rules/axe/4.14/image-alt', nodes: [{ id: 3, summary: 'Fix any of the following:\n  Element does not have an alt attribute' }] }],
    passes: [{ id: 'html-has-lang', impact: 'serious' }, { id: 'document-title', impact: 'serious' }],
    incomplete: 0,
  });
  assert.equal(a.findings.length, 1);
  assert.equal(a.findings[0].nodeId, 3);
  assert.match(a.findings[0].message, /Images must have alternate text — Element does not have an alt attribute/);
  assert.equal(scores(a.checks).accessibility, Math.round((100 * 14) / 24));
});
