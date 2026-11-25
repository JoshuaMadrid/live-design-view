import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const U = require('../../media/units.js') as {
  parse: (v: string) => Record<string, string | boolean>;
  optionsFor: (p: string) => { units: string[]; keywords: string[] };
  unitOf: (p: string, v: string) => string;
  normalize: (p: string, v: string, unit?: string) => string;
  withUnit: (p: string, v: string, choice: string) => string | null;
  compressBox: (v: string[]) => string;
  inferLinks: (s: string) => { all: boolean; x: boolean; y: boolean };
  linkBox: (v: string[], i: number, val: string, l: object) => string[];
  applyLink: (v: string[], kind: string) => string[];
};

test('bare numbers get the selected unit (px by default)', () => {
  assert.equal(U.normalize('padding-top', '20'), '20px');
  assert.equal(U.normalize('padding-top', '20', 'rem'), '20rem');
  assert.equal(U.normalize('width', '50', '%'), '50%');
  assert.equal(U.normalize('margin-left', '-8'), '-8px');
  assert.equal(U.normalize('font-size', '1.5', 'em'), '1.5em');
  // typed units / keywords / functions are kept
  assert.equal(U.normalize('width', '2rem', 'px'), '2rem');
  assert.equal(U.normalize('margin-left', 'auto', 'px'), 'auto');
  assert.equal(U.normalize('width', 'calc(100% - 2rem)'), 'calc(100% - 2rem)');
  assert.equal(U.normalize('padding-top', ''), '');
});

test('unitless properties keep plain numbers; line-height can be either', () => {
  assert.equal(U.normalize('z-index', '10'), '10');
  assert.equal(U.normalize('opacity', '.5'), '.5');
  assert.equal(U.normalize('line-height', '1.4'), '1.4');
  assert.equal(U.normalize('line-height', '24', 'px'), '24px');
  assert.deepEqual(U.optionsFor('z-index').units, []);
  assert.equal(U.optionsFor('line-height').units[0], '—');
});

test('dropdown switches unit, picks keywords allowed per property', () => {
  assert.equal(U.withUnit('padding-top', '20px', 'rem'), '20rem');
  assert.equal(U.withUnit('width', '50px', '%'), '50%');
  assert.equal(U.withUnit('margin-top', '10px', 'auto'), 'auto');
  assert.equal(U.withUnit('padding-top', '', 'em'), null);
  assert.equal(U.withUnit('line-height', '1.5em', '—'), '1.5');
  assert.deepEqual(U.optionsFor('margin-top').keywords, ['auto']);
  assert.deepEqual(U.optionsFor('padding-top').keywords, []);
  assert.deepEqual(U.optionsFor('max-width').keywords, ['none']);
  assert.deepEqual(U.optionsFor('letter-spacing').keywords, ['normal']);
  assert.equal(U.unitOf('padding-top', '2rem'), 'rem');
  assert.equal(U.unitOf('padding-top', ''), 'px');
  assert.equal(U.unitOf('margin-top', 'auto'), 'auto');
  assert.equal(U.unitOf('z-index', '3'), '—');
});

test('box links: shorthand compression, inference, linked edits', () => {
  assert.equal(U.compressBox(['8px', '8px', '8px', '8px']), '8px');
  assert.equal(U.compressBox(['8px', '16px', '8px', '16px']), '8px 16px');
  assert.equal(U.compressBox(['8px', '16px', '4px', '16px']), '8px 16px 4px');
  assert.equal(U.compressBox(['1px', '2px', '3px', '4px']), '1px 2px 3px 4px');
  assert.equal(U.compressBox(['', '2px', '', '2px']), '0 2px');
  assert.deepEqual(U.inferLinks('8px'), { all: true, x: true, y: true });
  assert.deepEqual(U.inferLinks('8px 16px'), { all: false, x: true, y: true });
  assert.deepEqual(U.inferLinks('8px 16px 4px'), { all: false, x: true, y: false });
  assert.deepEqual(U.inferLinks(''), { all: false, x: false, y: false });
  const v = ['1px', '2px', '3px', '4px'];
  assert.deepEqual(U.linkBox(v, 0, '9px', { all: true }), ['9px', '9px', '9px', '9px']);
  assert.deepEqual(U.linkBox(v, 2, '9px', { y: true }), ['9px', '2px', '9px', '4px']);
  assert.deepEqual(U.linkBox(v, 1, '9px', { x: true }), ['1px', '9px', '3px', '9px']);
  assert.deepEqual(U.linkBox(v, 1, '9px', { y: true }), ['1px', '9px', '3px', '4px']);
  assert.deepEqual(U.applyLink(v, 'all'), ['1px', '1px', '1px', '1px']);
  assert.deepEqual(U.applyLink(v, 'x'), ['1px', '4px', '3px', '4px']);
  assert.deepEqual(U.applyLink(['', '', '5px', ''], 'y'), ['5px', '', '5px', '']);
});
