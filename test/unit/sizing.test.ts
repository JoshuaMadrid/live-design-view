import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const S = require('../../media/sizing.js') as {
  sizeProps: (ctx: object, prop: 'width' | 'height', mode: string, v?: string) => Record<string, string>;
  sizeMode: (ctx: object, prop: 'width' | 'height', get: (p: string) => string) => string;
};
const set = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== ''));

const ROW = { parentDisplay: 'flex', parentDirection: 'row', display: 'block' };
const COL = { parentDisplay: 'flex', parentDirection: 'column', display: 'block' };
const GRID = { parentDisplay: 'grid', display: 'block' };
const BLOCK = { parentDisplay: 'block', display: 'block' };
const INLINE = { parentDisplay: 'block', display: 'inline-block' };

test('Fill: flex main axis grows, cross axis stretches, grid stretches, block fills', () => {
  assert.deepEqual(set(S.sizeProps(ROW, 'width', 'fill')), { flex: '1 1 0%', 'min-width': '0' });
  assert.deepEqual(set(S.sizeProps(ROW, 'height', 'fill')), { 'align-self': 'stretch' });
  assert.deepEqual(set(S.sizeProps(COL, 'height', 'fill')), { flex: '1 1 0%', 'min-height': '0' });
  assert.deepEqual(set(S.sizeProps(COL, 'width', 'fill')), { 'align-self': 'stretch' });
  assert.deepEqual(set(S.sizeProps(GRID, 'width', 'fill')), { 'justify-self': 'stretch' });
  assert.deepEqual(set(S.sizeProps(GRID, 'height', 'fill')), { 'align-self': 'stretch' });
  assert.deepEqual(S.sizeProps(BLOCK, 'width', 'fill'), { width: '' }); // block-level: auto width fills
  assert.deepEqual(S.sizeProps(INLINE, 'width', 'fill'), { width: '100%' });
  // Fill clears a conflicting fixed size and old longhands
  const p = S.sizeProps(ROW, 'width', 'fill');
  assert.equal(p.width, '');
  assert.equal(p['flex-grow'], '');
});

test('Hug: main axis stops growing, cross axis beats stretch with fit-content', () => {
  assert.deepEqual(set(S.sizeProps(ROW, 'width', 'hug')), { flex: '0 0 auto' });
  assert.deepEqual(set(S.sizeProps(ROW, 'height', 'hug')), { height: 'fit-content' });
  assert.deepEqual(set(S.sizeProps(COL, 'width', 'hug')), { width: 'fit-content' });
  assert.deepEqual(set(S.sizeProps(BLOCK, 'width', 'hug')), { width: 'fit-content' });
  assert.deepEqual(S.sizeProps(BLOCK, 'height', 'hug'), { height: '' });
});

test('Fixed: main axis does not shrink; Auto removes everything it set', () => {
  assert.deepEqual(set(S.sizeProps(ROW, 'width', 'fixed', '240px')), { width: '240px', flex: '0 0 auto' });
  assert.deepEqual(set(S.sizeProps(ROW, 'height', 'fixed', '40px')), { height: '40px' });
  assert.deepEqual(set(S.sizeProps(ROW, 'width', 'auto')), {});
  assert.ok('flex' in S.sizeProps(ROW, 'width', 'auto'));
});

test('sizeMode reads the mode back from declarations', () => {
  const g = (o: Record<string, string>) => (p: string) => o[p] ?? '';
  assert.equal(S.sizeMode(ROW, 'width', g({ flex: '1 1 0%' })), 'fill');
  assert.equal(S.sizeMode(ROW, 'width', g({ flex: 'auto' })), 'fill');
  assert.equal(S.sizeMode(ROW, 'width', g({ 'flex-grow': '2' })), 'fill');
  assert.equal(S.sizeMode(ROW, 'width', g({ flex: '0 0 auto' })), 'hug');
  assert.equal(S.sizeMode(ROW, 'width', g({ flex: '0 0 auto', width: '240px' })), 'fixed');
  assert.equal(S.sizeMode(ROW, 'height', g({ 'align-self': 'stretch' })), 'fill');
  assert.equal(S.sizeMode(ROW, 'height', g({ height: 'fit-content' })), 'hug');
  assert.equal(S.sizeMode(BLOCK, 'width', g({ width: '100%' })), 'fill');
  assert.equal(S.sizeMode(BLOCK, 'width', g({})), 'auto');
  // round trip: what we write reads back as the same mode
  for (const ctx of [ROW, COL, GRID, INLINE])
    for (const prop of ['width', 'height'] as const)
      for (const mode of ['fill', 'hug', 'fixed']) {
        const props = S.sizeProps(ctx, prop, mode, '120px');
        const got = S.sizeMode(ctx, prop, (p) => props[p] ?? '');
        assert.equal(got, mode, `${JSON.stringify(ctx)} ${prop} ${mode} -> ${got}`);
      }
});
