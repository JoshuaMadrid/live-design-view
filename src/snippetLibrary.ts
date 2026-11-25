/**
 * User snippet library: folders of .html files (pattern folders, like shadcn's component groups).
 *
 *   <library>/<Folder>/<Name>.html
 *
 * An optional first-line comment holds metadata:
 *   <!-- snippet: {"trigger": "cta", "description": "Call to action", "requires": ["tailwind"]} -->
 * Everything after it is the snippet. Pure (no vscode) so it can be unit tested.
 */
import { parseHtml } from './htmlModel';
import { detectIndentUnit } from './edits';
import type { AssetId, Snippet } from './snippets';

export interface SnippetMeta {
  trigger?: string;
  description?: string;
  requires?: AssetId[];
}

export interface UserSnippet extends Snippet {
  folder: string;
  file: string;
  meta: SnippetMeta;
  body: string;
}

const HEADER = /^\s*<!--\s*snippet:\s*(\{[\s\S]*?\})\s*-->[ \t]*\r?\n?/;

export function userKey(folder: string, name: string) {
  return `user:${folder}/${name}`;
}

export function parseSnippetFile(folder: string, file: string, text: string): UserSnippet {
  let meta: SnippetMeta = {};
  let body = text;
  const m = HEADER.exec(text);
  if (m) {
    try {
      meta = JSON.parse(m[1]);
    } catch {
      /* ignore malformed header */
    }
    body = text.slice(m[0].length);
  }
  body = body.replace(/\r\n/g, '\n').replace(/^\s*\n/, '').replace(/\s+$/, '');
  const name = file.replace(/\.html?$/i, '');
  const lines = toRelativeLines(body);

  // Element tag and whether the snippet has one root (needed for Wrap).
  const model = parseHtml(body);
  const roots = model.nodes.filter((n) => {
    if (!n.located) return false;
    const p = n.parent !== undefined ? model.nodes[n.parent] : undefined;
    return !p || !p.located;
  });
  const tag = roots[0]?.tag ?? 'div';
  const requires = (meta.requires ?? []).filter((r): r is AssetId => r === 'tailwind' || r === 'react');
  if (!requires.includes('tailwind') && /\bclass="[^"]*\b(?:flex|grid|px-\d|py-\d|text-(?:sm|lg|xl)|rounded-(?:md|lg|xl)|bg-[a-z]+-\d{2,3})\b/.test(body)) {
    requires.push('tailwind');
  }
  if (!requires.includes('react') && /type="text\/babel"/.test(body)) requires.push('react');

  return {
    key: userKey(folder, name),
    tag,
    name,
    icon: 'symbol-snippet',
    lines,
    requires,
    noWrap: roots.length !== 1,
    source: 'user',
    folder,
    file,
    meta,
    body,
  };
}

/**
 * Converts the snippet's indentation into the "\t = one indent level" form insertSnippet expects,
 * after removing indentation common to every line.
 */
export function toRelativeLines(body: string): string[] {
  const lines = body.split('\n');
  const widths = lines.filter((l) => l.trim()).map((l) => /^[ \t]*/.exec(l)![0].replace(/\t/g, '    ').length);
  const common = widths.length ? Math.min(...widths) : 0;
  const unit = detectIndentUnit(body);
  const unitWidth = unit === '\t' ? 4 : unit.length;
  return lines.map((l) => {
    if (!l.trim()) return '';
    const w = /^[ \t]*/.exec(l)![0].replace(/\t/g, '    ').length - common;
    return '\t'.repeat(Math.max(0, Math.round(w / unitWidth))) + l.trim();
  });
}

export function serializeSnippet(body: string, meta: SnippetMeta): string {
  const clean: SnippetMeta = {};
  if (meta.trigger) clean.trigger = meta.trigger;
  if (meta.description) clean.description = meta.description;
  if (meta.requires?.length) clean.requires = meta.requires;
  const header = Object.keys(clean).length ? `<!-- snippet: ${JSON.stringify(clean)} -->\n` : '';
  return header + dedent(body) + '\n';
}

/** Removes indentation shared by all lines (the first line of a selection usually has none). */
export function dedent(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').replace(/\s+$/, '').split('\n');
  const rest = lines.slice(1).filter((l) => l.trim());
  const common = rest.length ? Math.min(...rest.map((l) => /^[ \t]*/.exec(l)![0].length)) : 0;
  return [lines[0].trimStart(), ...lines.slice(1).map((l) => l.slice(Math.min(common, /^[ \t]*/.exec(l)![0].length)))].join('\n');
}

export function safeName(s: string): string {
  return s.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_').slice(0, 80);
}

/** Starter library written on first run. */
export const STARTER_LIBRARY: Record<string, Record<string, string>> = {
  HTML_Snippets: {
    'Contact_Form.html': serializeSnippet(
      `<form action="#" method="post">
  <label for="name">Name</label>
  <input type="text" id="name" name="name">
  <label for="email">Email</label>
  <input type="email" id="email" name="email">
  <button type="submit">Send</button>
</form>`,
      { trigger: 'contactform', description: 'Simple contact form' },
    ),
    'Figure_With_Caption.html': serializeSnippet(
      `<figure>
  <img src="" alt="">
  <figcaption>Caption</figcaption>
</figure>`,
      { trigger: 'figcap' },
    ),
  },
  Tailwind_Layouts: {
    'Feature_Grid.html': serializeSnippet(
      `<section class="mx-auto max-w-6xl px-6 py-16">
  <h2 class="text-3xl font-bold tracking-tight">Features</h2>
  <div class="mt-10 grid grid-cols-1 gap-8 md:grid-cols-3">
    <div>
      <h3 class="font-semibold">Fast</h3>
      <p class="mt-2 text-gray-600">Describe the benefit.</p>
    </div>
    <div>
      <h3 class="font-semibold">Simple</h3>
      <p class="mt-2 text-gray-600">Describe the benefit.</p>
    </div>
    <div>
      <h3 class="font-semibold">Reliable</h3>
      <p class="mt-2 text-gray-600">Describe the benefit.</p>
    </div>
  </div>
</section>`,
      { trigger: 'twfeatures', description: 'Three-column feature grid', requires: ['tailwind'] },
    ),
  },
  shadcn_Patterns: {
    'Login_Card.html': serializeSnippet(
      `<div class="mx-auto w-full max-w-sm rounded-xl border border-zinc-200 bg-white shadow">
  <div class="flex flex-col space-y-1.5 p-6">
    <h3 class="text-2xl font-semibold leading-none tracking-tight">Login</h3>
    <p class="text-sm text-zinc-500">Enter your email below to login to your account.</p>
  </div>
  <div class="grid gap-4 p-6 pt-0">
    <div class="grid gap-2">
      <label for="login-email" class="text-sm font-medium leading-none">Email</label>
      <input id="login-email" type="email" placeholder="m@example.com" class="flex h-9 w-full rounded-md border border-zinc-200 bg-transparent px-3 py-1 text-sm shadow-sm">
    </div>
    <div class="grid gap-2">
      <label for="login-password" class="text-sm font-medium leading-none">Password</label>
      <input id="login-password" type="password" class="flex h-9 w-full rounded-md border border-zinc-200 bg-transparent px-3 py-1 text-sm shadow-sm">
    </div>
    <button type="button" class="inline-flex h-9 w-full items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 shadow hover:bg-zinc-900/90">Sign in</button>
  </div>
</div>`,
      { trigger: 'sclogin', description: 'shadcn-style login card', requires: ['tailwind'] },
    ),
    'Pricing_Card.html': serializeSnippet(
      `<div class="rounded-xl border border-zinc-200 bg-white p-6 shadow">
  <h3 class="font-semibold leading-none tracking-tight">Pro</h3>
  <p class="mt-4 text-4xl font-bold">$19<span class="text-sm font-normal text-zinc-500">/month</span></p>
  <ul class="mt-6 space-y-2 text-sm text-zinc-600">
    <li>Unlimited projects</li>
    <li>Priority support</li>
  </ul>
  <button type="button" class="mt-6 inline-flex h-9 w-full items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 shadow hover:bg-zinc-900/90">Upgrade</button>
</div>`,
      { trigger: 'scpricing', description: 'shadcn-style pricing card', requires: ['tailwind'] },
    ),
  },
  React_Components: {
    'Toggle.html': serializeSnippet(
      `<div id="toggle"></div>
<script type="text/babel">
  function Toggle() {
    const [on, setOn] = React.useState(false);
    return <button onClick={() => setOn(!on)}>{on ? 'On' : 'Off'}</button>;
  }
  ReactDOM.createRoot(document.getElementById('toggle')).render(<Toggle />);
</script>`,
      { trigger: 'rtoggle', description: 'React toggle button', requires: ['react'] },
    ),
  },
};
