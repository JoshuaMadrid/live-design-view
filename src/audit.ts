// Page audit, Lighthouse-style: Accessibility (axe-core, the engine Lighthouse uses, run inside
// the Design view on the unsaved page), plus basic SEO, Best Practices and Forms checks run on the
// source. Findings go to the Problems panel, as markers on the canvas, and as category scores.
import type { HtmlModel, LdNode } from './htmlModel';

export type Category = 'accessibility' | 'seo' | 'best-practices' | 'forms';
export type Impact = 'critical' | 'serious' | 'moderate' | 'minor';

export interface Finding {
  rule: string;
  category: Category;
  impact: Impact;
  message: string;
  /** element the finding is about (model id); undefined = the whole page */
  nodeId?: number;
  helpUrl?: string;
}

/** Result of one check over the page: passed, or failed with findings. Used for scores. */
export interface CheckResult {
  rule: string;
  category: Category;
  impact: Impact;
  passed: boolean;
}

/** axe-core results as the canvas reports them (violations mapped to model ids). */
export interface AxeReport {
  violations: { id: string; impact: Impact | null; help: string; helpUrl: string; nodes: { id: number | null; summary: string }[] }[];
  passes: { id: string; impact: Impact | null }[];
  incomplete: number;
}

/** Lighthouse-like weights by impact. */
export const WEIGHT: Record<Impact, number> = { critical: 10, serious: 7, moderate: 3, minor: 1 };

const attr = (n: LdNode, name: string) => n.attrs.find((a) => a.name === name)?.value;
const has = (n: LdNode, name: string) => n.attrs.some((a) => a.name === name);
const textOf = (m: HtmlModel, n: LdNode) => n.texts.map((t) => t.value).join('').replace(/\s+/g, ' ').trim();

/** Non-descriptive link texts (Lighthouse SEO "link-text"). */
const VAGUE_LINKS = new Set(['click here', 'click this', 'here', 'go', 'link', 'more', 'read more', 'learn more', 'start', 'right here', 'this', 'continue']);
const DEPRECATED = new Set(['font', 'center', 'marquee', 'blink', 'big', 'strike', 'tt', 'frame', 'frameset', 'acronym', 'applet', 'basefont', 'dir']);

/** Field purposes WCAG 1.3.5 (Identify Input Purpose) expects an autocomplete token for. */
const PURPOSES: [RegExp, string, string?][] = [
  [/e-?mail/i, 'email', 'email'],
  [/(^|[^a-z])(tel|phone|mobile)/i, 'tel', 'tel'],
  [/first.?name|given.?name|fname/i, 'given-name'],
  [/last.?name|family.?name|surname|lname/i, 'family-name'],
  [/full.?name|^name$|your.?name/i, 'name'],
  [/zip|postal/i, 'postal-code'],
  [/street|address/i, 'street-address'],
  [/city|town/i, 'address-level2'],
  [/country/i, 'country-name'],
  [/(^|[^a-z])org|company/i, 'organization'],
  [/url|website/i, 'url', 'url'],
];

/** Basic SEO / Best Practices / Forms checks on the source (fast, no browser needed). */
export function basicChecks(model: HtmlModel): { findings: Finding[]; checks: CheckResult[] } {
  const findings: Finding[] = [];
  const checks: CheckResult[] = [];
  const nodes = model.nodes.filter((n) => n.located || n.tag === 'html' || n.tag === 'body');
  const byTag = (t: string) => nodes.filter((n) => n.tag === t);
  const check = (rule: string, category: Category, impact: Impact, fails: Omit<Finding, 'rule' | 'category' | 'impact'>[]) => {
    checks.push({ rule, category, impact, passed: !fails.length });
    for (const f of fails) findings.push({ rule, category, impact, ...f });
  };

  // ---- SEO ------------------------------------------------------------------------
  const title = byTag('title')[0];
  check('document-title', 'seo', 'serious', !title || !textOf(model, title) ? [{ message: 'The page has no <title>. Search results and browser tabs show the title.' }] : []);
  const metas = byTag('meta');
  const desc = metas.find((n) => attr(n, 'name')?.toLowerCase() === 'description');
  check('meta-description', 'seo', 'moderate', !desc || !(attr(desc, 'content') || '').trim() ? [{ message: 'No <meta name="description">. Search engines show it under the title.', nodeId: title?.id }] : []);
  const viewport = metas.find((n) => attr(n, 'name')?.toLowerCase() === 'viewport');
  check('viewport', 'seo', 'serious', !viewport ? [{ message: 'No <meta name="viewport">, so phones show a zoomed-out desktop page.' }] : []);
  const html = byTag('html')[0];
  check('html-lang', 'seo', 'serious', html && !(attr(html, 'lang') || '').trim() ? [{ message: '<html> has no lang attribute (screen readers and search engines use it).', nodeId: html.located ? html.id : undefined }] : []);
  const h1s = nodes.filter((n) => n.tag === 'h1');
  check('one-h1', 'seo', 'minor', h1s.length === 0 ? [{ message: 'The page has no <h1> heading.' }] : h1s.slice(1).map((n) => ({ message: `More than one <h1> on the page (${h1s.length}). Use one main heading.`, nodeId: n.id })));
  const vague = byTag('a').filter((n) => has(n, 'href') && VAGUE_LINKS.has(textOf(model, n).toLowerCase().replace(/[.!…→»]+$/, '').trim()));
  check('link-text', 'seo', 'minor', vague.map((n) => ({ message: `Link text "${textOf(model, n)}" doesn't say where it goes. Describe the destination.`, nodeId: n.id })));

  // ---- Best practices -------------------------------------------------------------
  check('doctype', 'best-practices', 'moderate', /^\s*(<!--[\s\S]*?-->\s*)*<!doctype html>/i.test(model.text) ? [] : [{ message: 'Missing <!DOCTYPE html>, so the browser renders in quirks mode.' }]);
  check('charset', 'best-practices', 'moderate', metas.some((n) => has(n, 'charset') || /charset/i.test(attr(n, 'content') || '')) ? [] : [{ message: 'No <meta charset="UTF-8">.' }]);
  check('noopener', 'best-practices', 'minor', byTag('a').filter((n) => attr(n, 'target') === '_blank' && /^https?:|^\/\//i.test(attr(n, 'href') || '') && !/noopener|noreferrer/i.test(attr(n, 'rel') || '')).map((n) => ({ message: 'External link opens a new tab without rel="noopener".', nodeId: n.id })));
  const insecure = nodes.filter((n) => ['src', 'href'].some((a) => /^http:\/\//i.test(attr(n, a) || '')) && n.tag !== 'a');
  check('https', 'best-practices', 'serious', insecure.map((n) => ({ message: `<${n.tag}> loads over http:// (insecure; blocked on https pages).`, nodeId: n.id })));
  check('deprecated', 'best-practices', 'moderate', nodes.filter((n) => DEPRECATED.has(n.tag)).map((n) => ({ message: `<${n.tag}> is obsolete HTML; use CSS instead.`, nodeId: n.id })));
  check('image-size', 'best-practices', 'minor', byTag('img').filter((n) => !(has(n, 'width') && has(n, 'height'))).map((n) => ({ message: 'Image has no width/height, so the page jumps while it loads (layout shift).', nodeId: n.id })));
  const ids = new Map<string, LdNode[]>();
  for (const n of nodes) {
    const id = attr(n, 'id');
    if (id) ids.set(id, [...(ids.get(id) ?? []), n]);
  }
  check('unique-ids', 'best-practices', 'serious', [...ids.entries()].filter(([, ns]) => ns.length > 1).flatMap(([id, ns]) => ns.slice(1).map((n) => ({ message: `Duplicate id="${id}" (ids must be unique; labels and links may point at the wrong element).`, nodeId: n.id }))));

  // ---- Forms ----------------------------------------------------------------------
  const forms = byTag('form');
  const inForm = (n: LdNode) => {
    for (let p = n.parent; p !== undefined; p = model.nodes[p].parent) if (model.nodes[p].tag === 'form') return model.nodes[p];
    return undefined;
  };
  const fields = nodes.filter((n) => ['input', 'select', 'textarea'].includes(n.tag) && !['submit', 'button', 'reset', 'image', 'hidden'].includes((attr(n, 'type') || '').toLowerCase()));
  const labelled = (n: LdNode) => {
    const id = attr(n, 'id');
    if (has(n, 'aria-label') || has(n, 'aria-labelledby') || has(n, 'title')) return true;
    if (id && byTag('label').some((l) => attr(l, 'for') === id)) return true;
    for (let p = n.parent; p !== undefined; p = model.nodes[p].parent) if (model.nodes[p].tag === 'label') return true;
    return false;
  };
  check('form-labels', 'forms', 'critical', fields.filter((n) => !labelled(n)).map((n) => ({
    message: has(n, 'placeholder') ? `Field "${attr(n, 'placeholder')}" uses a placeholder instead of a <label>; it disappears while typing and many screen readers skip it.` : `<${n.tag}> has no label (add <label for="…"> or aria-label).`,
    nodeId: n.id,
  })));
  check('form-names', 'forms', 'serious', fields.filter((n) => inForm(n) && !has(n, 'name')).map((n) => ({ message: `<${n.tag}${attr(n, 'id') ? ' id="' + attr(n, 'id') + '"' : ''}> has no name, so its value isn't sent when the form is submitted.`, nodeId: n.id })));
  check('form-submit', 'forms', 'serious', forms.filter((f) => !nodes.some((n) => inForm(n)?.id === f.id && ((n.tag === 'button' && (attr(n, 'type') || 'submit').toLowerCase() === 'submit') || (n.tag === 'input' && ['submit', 'image'].includes((attr(n, 'type') || '').toLowerCase()))))).map((f) => ({ message: "Form has no submit button, so keyboard users can't send it.", nodeId: f.id })));
  check('form-action', 'forms', 'minor', forms.filter((f) => !has(f, 'action') || ['', '#'].includes((attr(f, 'action') || '').trim())).map((f) => ({ message: 'Form has no action URL yet; submitting goes nowhere. (Design view: Interact mode shows what it would send.)', nodeId: f.id })));
  check('form-password-get', 'forms', 'critical', forms.filter((f) => (attr(f, 'method') || 'get').toLowerCase() === 'get' && fields.some((n) => inForm(n)?.id === f.id && attr(n, 'type') === 'password')).map((f) => ({ message: 'Form with a password uses method GET, which puts the password in the URL. Use method="post".', nodeId: f.id })));
  const purpose = (n: LdNode) => {
    const hint = [attr(n, 'name'), attr(n, 'id'), attr(n, 'placeholder')].filter(Boolean).join(' ');
    return PURPOSES.find(([re]) => re.test(hint));
  };
  check('form-input-type', 'forms', 'moderate', fields.filter((n) => n.tag === 'input' && (attr(n, 'type') || 'text').toLowerCase() === 'text').flatMap((n) => {
    const p = purpose(n);
    return p && p[2] ? [{ message: `Looks like a ${p[2]} field: use type="${p[2]}" for the right phone keyboard and built-in validation.`, nodeId: n.id }] : [];
  }));
  check('form-autocomplete', 'forms', 'moderate', fields.filter((n) => n.tag !== 'select' && !has(n, 'autocomplete') && !['checkbox', 'radio', 'range', 'color', 'file', 'date', 'month', 'week', 'time', 'number', 'search'].includes((attr(n, 'type') || '').toLowerCase())).flatMap((n) => {
    const p = purpose(n);
    return p ? [{ message: `Add autocomplete="${p[1]}" so browsers can fill it in (WCAG 1.3.5 Identify Input Purpose).`, nodeId: n.id }] : [];
  }));
  const buttons = nodes.filter((n) => n.tag === 'button' && !has(n, 'type') && inForm(n));
  check('button-type', 'forms', 'minor', buttons.filter((n) => buttons.filter((b) => inForm(b)?.id === inForm(n)?.id).length > 1).map((n) => ({ message: '<button> without type in a form submits it. Add type="button" (or "submit") to make the intent explicit.', nodeId: n.id })));

  return { findings, checks };
}

/** axe results → findings + checks (category accessibility). */
export function axeFindings(r: AxeReport): { findings: Finding[]; checks: CheckResult[] } {
  const findings: Finding[] = [];
  const checks: CheckResult[] = [];
  for (const v of r.violations) {
    const impact = v.impact ?? 'moderate';
    checks.push({ rule: v.id, category: 'accessibility', impact, passed: false });
    for (const n of v.nodes) findings.push({ rule: v.id, category: 'accessibility', impact, message: v.help + (n.summary ? ` — ${n.summary.replace(/^Fix (any|all) of the following:\s*/i, '').split('\n')[0].trim()}` : ''), nodeId: n.id ?? undefined, helpUrl: v.helpUrl });
  }
  for (const p of r.passes) checks.push({ rule: p.id, category: 'accessibility', impact: p.impact ?? 'moderate', passed: true });
  return { findings, checks };
}

/** Lighthouse-style 0–100 score per category (weighted share of passed checks). */
export function scores(checks: CheckResult[]): Record<Category, number | null> {
  const out = {} as Record<Category, number | null>;
  for (const c of ['accessibility', 'best-practices', 'seo', 'forms'] as Category[]) {
    const cs = checks.filter((x) => x.category === c);
    const total = cs.reduce((s, x) => s + WEIGHT[x.impact], 0);
    out[c] = total ? Math.round((100 * cs.filter((x) => x.passed).reduce((s, x) => s + WEIGHT[x.impact], 0)) / total) : null;
  }
  return out;
}
