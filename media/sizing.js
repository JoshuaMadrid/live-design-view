// Design-tool sizing (Fixed · Hug contents · Fill container · Auto) mapped to correct CSS
// for the element's context: its parent's layout (flex row / column, grid, block) and the axis.
// Shared by the Styles panel webview and the unit tests (UMD-style export).
(function (root) {
  'use strict';

  /**
   * @param {{ parentDisplay?: string, parentDirection?: string, display?: string }} ctx
   * @param {'width'|'height'} prop
   */
  function contextOf(ctx, prop) {
    const pd = (ctx && ctx.parentDisplay) || '';
    const isW = prop === 'width';
    const pflex = /flex/.test(pd);
    const pgrid = /grid/.test(pd);
    const prow = !/column/.test((ctx && ctx.parentDirection) || 'row');
    const main = pflex && (isW ? prow : !prow);
    const cross = pflex && !main;
    const display = (ctx && ctx.display) || 'block';
    const blockLevel = /^(block|flex|grid|table|list-item|flow-root)$/.test(display);
    return {
      isW, pflex, pgrid, main, cross, blockLevel,
      min: isW ? 'min-width' : 'min-height',
      selfAlign: isW && pgrid ? 'justify-self' : 'align-self',
      where: main ? `main axis of a flex ${prow ? 'row' : 'column'}` : cross ? `cross axis of a flex ${prow ? 'row' : 'column'}` : pgrid ? 'grid cell' : 'block flow',
    };
  }

  const FLEX_LONGHANDS = { 'flex-grow': '', 'flex-shrink': '', 'flex-basis': '' };

  /**
   * CSS properties for a sizing mode. "" removes a property.
   * @param {'fixed'|'hug'|'fill'|'auto'} mode
   * @param {string} [fixedValue] e.g. "240px" (for 'fixed')
   */
  function sizeProps(ctx, prop, mode, fixedValue) {
    const c = contextOf(ctx, prop);
    switch (mode) {
      case 'fill':
        if (c.main) return { flex: '1 1 0%', ...FLEX_LONGHANDS, [prop]: '', [c.min]: '0' };
        if (c.cross || c.pgrid) return { [c.selfAlign]: 'stretch', [prop]: '' };
        if (c.isW) return c.blockLevel ? { width: '' } : { width: '100%' };
        return { height: '100%' };
      case 'hug':
        if (c.main) return { flex: '0 0 auto', ...FLEX_LONGHANDS, [prop]: '', [c.min]: '' };
        if (c.cross || c.pgrid) return { [prop]: 'fit-content', [c.selfAlign]: '' };
        return c.isW ? { width: 'fit-content' } : { height: '' };
      case 'fixed': {
        const v = fixedValue || '100px';
        if (c.main) return { [prop]: v, flex: '0 0 auto', ...FLEX_LONGHANDS, [c.min]: '' };
        if (c.cross || c.pgrid) return { [prop]: v, [c.selfAlign]: '' };
        return { [prop]: v };
      }
      default: // auto: back to the browser's default sizing
        if (c.main) return { [prop]: '', flex: '', ...FLEX_LONGHANDS, [c.min]: '' };
        if (c.cross || c.pgrid) return { [prop]: '', [c.selfAlign]: '' };
        return { [prop]: '' };
    }
  }

  /**
   * Reads the current mode back from the rule's declarations.
   * @param {(p: string) => string} get authored value of a property ("" if unset)
   */
  function sizeMode(ctx, prop, get) {
    const c = contextOf(ctx, prop);
    const v = (get(prop) || '').trim();
    const flex = (get('flex') || '').trim();
    const grow = (get('flex-grow') || '').trim();
    if (c.main) {
      const growing = (flex && !/^(none|0(\s|$))/.test(flex) && /^(auto|\d)/.test(flex) && !/^0\b/.test(flex)) || (grow && grow !== '0');
      if (growing) return 'fill';
    }
    if ((c.cross || c.pgrid) && get(c.selfAlign) === 'stretch') return 'fill';
    if (v === '100%') return 'fill';
    if (/fit-content|max-content|min-content/.test(v)) return 'hug';
    if (c.main && /^(none|0 0 auto)$/.test(flex) && !v) return 'hug';
    if (v && v !== 'auto') return 'fixed';
    // In block flow an unset height already hugs the content.
    if (!c.isW && !c.pflex && !c.pgrid) return 'hug';
    return 'auto';
  }

  /** One-line description of what a mode writes here (for tooltips). */
  function describe(ctx, prop, mode) {
    const c = contextOf(ctx, prop);
    const props = sizeProps(ctx, prop, mode, mode === 'fixed' ? 'Npx' : undefined);
    const css = Object.entries(props).filter(([, v]) => v !== '').map(([k, v]) => `${k}: ${v}`).join('; ') || `remove ${prop}`;
    return `${css}  (${c.where})`;
  }

  const api = { contextOf, sizeProps, sizeMode, describe };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ldSizing = api;
})(typeof window !== 'undefined' ? window : globalThis);
