// shadcn/ui components as static HTML + Tailwind (CDN), styled like shadcn's default zinc theme.
// These are the look of the components, not the React components: interactive ones (dialog,
// dropdown, popover…) are shown in their open state so they can be designed on the canvas.
// Component list from ui.shadcn.com/docs/components, grouped for the Elements bar.

export interface ShadcnDef {
  key: string;
  name: string;
  icon: string;
  tag: string;
  lines: string[];
}

/** Template literal → snippet lines (2-space indents become tabs, outer blank lines trimmed). */
const L = (src: string): string[] =>
  src
    .replace(/^\n+|\s+$/g, '')
    .split('\n')
    .map((l) => l.replace(/^( {2})+/, (sp) => '\t'.repeat(sp.length / 2)));

// Shared class lists ------------------------------------------------------------------
const BTN = 'inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 disabled:pointer-events-none disabled:opacity-50';
const V = {
  primary: 'bg-zinc-900 text-zinc-50 shadow hover:bg-zinc-900/90',
  secondary: 'bg-zinc-100 text-zinc-900 shadow-sm hover:bg-zinc-100/80',
  outline: 'border border-zinc-200 bg-white shadow-sm hover:bg-zinc-100',
  ghost: 'hover:bg-zinc-100',
  destructive: 'bg-red-600 text-white shadow-sm hover:bg-red-600/90',
  link: 'text-zinc-900 underline-offset-4 hover:underline',
};
const btn = (v: keyof typeof V, text: string, extra = '') => `<button type="button" class="${BTN} ${V[v]}${extra ? ' ' + extra : ''}">${text}</button>`;
const ICON_BTN = 'inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 bg-white text-sm shadow-sm hover:bg-zinc-100';
const INPUT = 'flex h-9 w-full rounded-md border border-zinc-200 bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950';
const LABEL = 'text-sm font-medium leading-none';
const CARD = 'rounded-xl border border-zinc-200 bg-white text-zinc-950 shadow';
const POP = 'rounded-md border border-zinc-200 bg-white p-4 text-sm text-zinc-950 shadow-md';
const MENU = 'min-w-[12rem] rounded-md border border-zinc-200 bg-white p-1 text-sm text-zinc-950 shadow-md';
const ITEM = 'flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-zinc-100';
const MUTED = 'text-sm text-zinc-500';
const OVERLAY = 'relative flex min-h-[320px] items-center justify-center rounded-lg bg-black/80 p-6';
const CHEVRON = '<svg class="h-4 w-4 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>';
const CHECK = '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>';
const X = '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>';

const defs: ShadcnDef[] = [];
const d = (key: string, name: string, icon: string, tag: string, src: string | string[]) =>
  defs.push({ key, name, icon, tag, lines: Array.isArray(src) ? src : L(src) });

// Actions -----------------------------------------------------------------------------
d('sc-button', 'Button', 'record-small', 'button', [btn('primary', 'Button')]);
d('sc-button-secondary', 'Button · Secondary', 'circle-large-filled', 'button', [btn('secondary', 'Secondary')]);
d('sc-button-outline', 'Button · Outline', 'circle-large-outline', 'button', [btn('outline', 'Outline')]);
d('sc-button-ghost', 'Button · Ghost', 'circle-small', 'button', [btn('ghost', 'Ghost')]);
d('sc-button-destructive', 'Button · Destructive', 'error', 'button', [btn('destructive', 'Delete')]);
d('sc-button-link', 'Button · Link', 'link', 'button', [btn('link', 'Link')]);
d('sc-button-group', 'Button Group', 'layout-panel-left', 'div', `
<div role="group" class="inline-flex w-fit items-stretch [&>button]:rounded-none [&>button:first-child]:rounded-l-md [&>button:last-child]:rounded-r-md [&>button+button]:border-l-0">
  ${btn('outline', 'Archive')}
  ${btn('outline', 'Report')}
  ${btn('outline', 'Snooze')}
</div>`);
d('sc-toggle', 'Toggle', 'bold', 'button', `
<button type="button" aria-pressed="true" class="inline-flex h-9 min-w-9 items-center justify-center rounded-md bg-zinc-100 px-2 text-sm font-medium hover:bg-zinc-100 hover:text-zinc-500">
  <b>B</b>
</button>`);
d('sc-toggle-group', 'Toggle Group', 'symbol-boolean', 'div', `
<div role="group" class="flex w-fit items-center gap-1">
  <button type="button" aria-pressed="true" class="inline-flex h-9 min-w-9 items-center justify-center rounded-md bg-zinc-100 px-2 text-sm font-bold">B</button>
  <button type="button" aria-pressed="false" class="inline-flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-sm italic hover:bg-zinc-100">I</button>
  <button type="button" aria-pressed="false" class="inline-flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-sm underline hover:bg-zinc-100">U</button>
</div>`);

// Forms -------------------------------------------------------------------------------
d('sc-input', 'Input', 'symbol-string', 'input', [`<input type="text" placeholder="Email" class="${INPUT}">`]);
d('sc-textarea', 'Textarea', 'note', 'textarea', [`<textarea placeholder="Type your message here." class="flex min-h-[60px] w-full rounded-md border border-zinc-200 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950"></textarea>`]);
d('sc-label', 'Label', 'tag', 'label', [`<label for="terms" class="${LABEL}">Accept terms and conditions</label>`]);
d('sc-field', 'Field', 'symbol-field', 'div', `
<div class="grid w-full max-w-sm gap-2">
  <label for="username" class="${LABEL}">Username</label>
  <input type="text" id="username" placeholder="shadcn" class="${INPUT}">
  <p class="${MUTED}">This is your public display name.</p>
</div>`);
d('sc-input-group', 'Input Group', 'search', 'div', `
<div class="flex h-9 w-full max-w-sm items-center rounded-md border border-zinc-200 shadow-sm focus-within:ring-1 focus-within:ring-zinc-950">
  <span class="pl-3 text-zinc-500"><svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg></span>
  <input type="search" placeholder="Search..." class="h-full flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-zinc-500">
  <span class="pr-3 text-xs text-zinc-500">12 results</span>
</div>`);
d('sc-input-otp', 'Input OTP', 'key', 'div', `
<div class="flex items-center gap-2">
  <div class="flex items-center">
    <input maxlength="1" aria-label="Digit 1" class="h-9 w-9 rounded-l-md border border-zinc-200 text-center text-sm shadow-sm">
    <input maxlength="1" aria-label="Digit 2" class="h-9 w-9 border-y border-r border-zinc-200 text-center text-sm shadow-sm">
    <input maxlength="1" aria-label="Digit 3" class="h-9 w-9 rounded-r-md border-y border-r border-zinc-200 text-center text-sm shadow-sm">
  </div>
  <span class="text-zinc-400">-</span>
  <div class="flex items-center">
    <input maxlength="1" aria-label="Digit 4" class="h-9 w-9 rounded-l-md border border-zinc-200 text-center text-sm shadow-sm">
    <input maxlength="1" aria-label="Digit 5" class="h-9 w-9 border-y border-r border-zinc-200 text-center text-sm shadow-sm">
    <input maxlength="1" aria-label="Digit 6" class="h-9 w-9 rounded-r-md border-y border-r border-zinc-200 text-center text-sm shadow-sm">
  </div>
</div>`);
d('sc-checkbox', 'Checkbox', 'pass', 'div', `
<div class="flex items-center gap-2">
  <input type="checkbox" id="terms" class="h-4 w-4 rounded-sm border border-zinc-900 accent-zinc-900">
  <label for="terms" class="${LABEL}">Accept terms and conditions</label>
</div>`);
d('sc-radio-group', 'Radio Group', 'circle-large-filled', 'div', `
<div role="radiogroup" class="grid gap-3">
  <label class="flex items-center gap-2 text-sm"><input type="radio" name="density" value="default" checked class="h-4 w-4 accent-zinc-900"> Default</label>
  <label class="flex items-center gap-2 text-sm"><input type="radio" name="density" value="comfortable" class="h-4 w-4 accent-zinc-900"> Comfortable</label>
  <label class="flex items-center gap-2 text-sm"><input type="radio" name="density" value="compact" class="h-4 w-4 accent-zinc-900"> Compact</label>
</div>`);
d('sc-switch', 'Switch', 'settings', 'label', `
<label class="inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
  <input type="checkbox" role="switch" class="peer sr-only">
  <span class="relative h-5 w-9 rounded-full bg-zinc-200 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-zinc-900 peer-checked:after:translate-x-4"></span>
  Airplane Mode
</label>`);
d('sc-slider', 'Slider', 'settings-gear', 'input', [`<input type="range" min="0" max="100" value="50" aria-label="Volume" class="h-1.5 w-full max-w-sm cursor-pointer accent-zinc-900">`]);
d('sc-select', 'Select', 'list-selection', 'div', `
<div class="relative w-[180px]">
  <button type="button" class="flex h-9 w-full items-center justify-between rounded-md border border-zinc-200 bg-transparent px-3 py-2 text-sm shadow-sm">
    <span>Select a fruit</span>
    ${CHEVRON}
  </button>
  <div role="listbox" class="${MENU} absolute top-10 z-10 w-full">
    <div class="px-2 py-1.5 text-xs font-semibold text-zinc-500">Fruits</div>
    <div role="option" class="${ITEM}">Apple</div>
    <div role="option" aria-selected="true" class="${ITEM} justify-between bg-zinc-100">Banana ${CHECK}</div>
    <div role="option" class="${ITEM}">Blueberry</div>
  </div>
</div>`);
d('sc-native-select', 'Native Select', 'chevron-down', 'select', `
<select class="h-9 w-[180px] rounded-md border border-zinc-200 bg-transparent px-3 text-sm shadow-sm">
  <option>Select a status</option>
  <option>Todo</option>
  <option>In Progress</option>
  <option>Done</option>
</select>`);
d('sc-combobox', 'Combobox', 'search', 'div', `
<div class="w-[200px]">
  <button type="button" role="combobox" aria-expanded="true" class="flex h-9 w-full items-center justify-between rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm">
    Select framework...
    ${CHEVRON}
  </button>
  <div class="${MENU} mt-1 w-full p-0">
    <input placeholder="Search framework..." class="h-9 w-full border-b border-zinc-200 bg-transparent px-3 text-sm outline-none">
    <div class="p-1">
      <div class="${ITEM}">Next.js</div>
      <div class="${ITEM}">SvelteKit</div>
      <div class="${ITEM}">Astro</div>
    </div>
  </div>
</div>`);
d('sc-date-picker', 'Date Picker', 'calendar', 'div', `
<div class="grid gap-2">
  <button type="button" class="${BTN} ${V.outline} w-[240px] justify-start font-normal text-zinc-500">
    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
    Pick a date
  </button>
  <input type="date" class="${INPUT} w-[240px]">
</div>`);
d('sc-calendar', 'Calendar', 'calendar', 'div', `
<div class="w-fit rounded-md border border-zinc-200 p-3 shadow-sm">
  <div class="mb-2 flex items-center justify-between">
    <button type="button" class="${ICON_BTN} h-7 w-7" aria-label="Previous month">&lsaquo;</button>
    <div class="text-sm font-medium">November 2026</div>
    <button type="button" class="${ICON_BTN} h-7 w-7" aria-label="Next month">&rsaquo;</button>
  </div>
  <div class="grid grid-cols-7 gap-1 text-center text-xs text-zinc-500">
    <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
  </div>
  <div class="mt-1 grid grid-cols-7 gap-1 text-center text-sm">
    <span class="rounded-md p-1.5">1</span><span class="rounded-md p-1.5">2</span><span class="rounded-md p-1.5">3</span><span class="rounded-md p-1.5">4</span><span class="rounded-md p-1.5">5</span><span class="rounded-md p-1.5">6</span><span class="rounded-md p-1.5">7</span>
    <span class="rounded-md p-1.5">8</span><span class="rounded-md p-1.5">9</span><span class="rounded-md p-1.5">10</span><span class="rounded-md p-1.5">11</span><span class="rounded-md p-1.5">12</span><span class="rounded-md p-1.5">13</span><span class="rounded-md p-1.5">14</span>
    <span class="rounded-md p-1.5">15</span><span class="rounded-md p-1.5">16</span><span class="rounded-md p-1.5">17</span><span class="rounded-md p-1.5">18</span><span class="rounded-md p-1.5">19</span><span class="rounded-md p-1.5">20</span><span class="rounded-md p-1.5">21</span>
    <span class="rounded-md p-1.5">22</span><span class="rounded-md p-1.5">23</span><span class="rounded-md p-1.5">24</span><span class="rounded-md bg-zinc-900 p-1.5 text-zinc-50">25</span><span class="rounded-md p-1.5">26</span><span class="rounded-md p-1.5">27</span><span class="rounded-md p-1.5">28</span>
    <span class="rounded-md p-1.5">29</span><span class="rounded-md p-1.5">30</span>
  </div>
</div>`);

// Layout ------------------------------------------------------------------------------
d('sc-card', 'Card', 'preview', 'div', `
<div class="${CARD}">
  <div class="flex flex-col space-y-1.5 p-6">
    <h3 class="font-semibold leading-none tracking-tight">Card Title</h3>
    <p class="${MUTED}">Card Description</p>
  </div>
  <div class="p-6 pt-0">
    <p>Card Content</p>
  </div>
  <div class="flex items-center p-6 pt-0">
    ${btn('primary', 'Action')}
  </div>
</div>`);
d('sc-separator', 'Separator', 'dash', 'div', [`<div role="separator" class="h-px w-full shrink-0 bg-zinc-200"></div>`]);
d('sc-aspect-ratio', 'Aspect Ratio', 'screen-full', 'div', `
<div class="relative aspect-video w-full max-w-md overflow-hidden rounded-md bg-zinc-100">
  <img src="" alt="Photo" class="h-full w-full object-cover">
</div>`);
d('sc-resizable', 'Resizable', 'split-horizontal', 'div', `
<div class="flex h-[200px] max-w-md overflow-hidden rounded-lg border border-zinc-200">
  <div class="flex flex-1 resize-x items-center justify-center overflow-auto p-6"><span class="font-semibold">One</span></div>
  <div role="separator" aria-orientation="vertical" class="w-px cursor-col-resize bg-zinc-200"></div>
  <div class="flex flex-1 items-center justify-center p-6"><span class="font-semibold">Two</span></div>
</div>`);
d('sc-scroll-area', 'Scroll Area', 'list-flat', 'div', `
<div class="h-72 w-48 overflow-y-auto rounded-md border border-zinc-200">
  <div class="p-4">
    <h4 class="mb-4 text-sm font-medium leading-none">Tags</h4>
    <div class="text-sm">v1.2.0-beta.1</div>
    <div role="separator" class="my-2 h-px bg-zinc-200"></div>
    <div class="text-sm">v1.2.0-beta.2</div>
    <div role="separator" class="my-2 h-px bg-zinc-200"></div>
    <div class="text-sm">v1.2.0-beta.3</div>
  </div>
</div>`);
d('sc-sidebar', 'Sidebar', 'layout-sidebar-left', 'aside', `
<aside class="flex h-full min-h-[320px] w-64 flex-col border-r border-zinc-200 bg-zinc-50">
  <div class="p-4 text-sm font-semibold">Acme Inc</div>
  <nav class="flex-1 p-2">
    <div class="px-2 py-1.5 text-xs font-medium text-zinc-500">Application</div>
    <a href="#" class="${ITEM} bg-zinc-100 font-medium">Home</a>
    <a href="#" class="${ITEM}">Inbox</a>
    <a href="#" class="${ITEM}">Calendar</a>
    <a href="#" class="${ITEM}">Settings</a>
  </nav>
  <div class="border-t border-zinc-200 p-4 text-sm">Signed in as shadcn</div>
</aside>`);
d('sc-accordion', 'Accordion', 'fold', 'div', `
<div class="w-full">
  <details class="group border-b border-zinc-200" open>
    <summary class="flex cursor-pointer list-none items-center justify-between py-4 text-sm font-medium hover:underline">Is it accessible? ${CHEVRON}</summary>
    <div class="pb-4 text-sm">Yes. It adheres to the WAI-ARIA design pattern.</div>
  </details>
  <details class="group border-b border-zinc-200">
    <summary class="flex cursor-pointer list-none items-center justify-between py-4 text-sm font-medium hover:underline">Is it styled? ${CHEVRON}</summary>
    <div class="pb-4 text-sm">Yes. It comes with default styles that match the other components.</div>
  </details>
</div>`);
d('sc-collapsible', 'Collapsible', 'unfold', 'details', `
<details class="w-[350px] space-y-2" open>
  <summary class="flex cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold">@peduarte starred 3 repositories ${CHEVRON}</summary>
  <div class="rounded-md border border-zinc-200 px-4 py-2 font-mono text-sm">@radix-ui/primitives</div>
  <div class="rounded-md border border-zinc-200 px-4 py-2 font-mono text-sm">@radix-ui/colors</div>
</details>`);
d('sc-tabs', 'Tabs', 'versions', 'div', `
<div class="w-[400px]">
  <div role="tablist" class="inline-flex h-9 items-center rounded-lg bg-zinc-100 p-1 text-zinc-500">
    <button role="tab" aria-selected="true" class="inline-flex items-center rounded-md bg-white px-3 py-1 text-sm font-medium text-zinc-950 shadow">Account</button>
    <button role="tab" aria-selected="false" class="inline-flex items-center rounded-md px-3 py-1 text-sm font-medium">Password</button>
  </div>
  <div role="tabpanel" class="${CARD} mt-2 p-6">
    <h3 class="font-semibold">Account</h3>
    <p class="${MUTED}">Make changes to your account here.</p>
  </div>
</div>`);
d('sc-direction', 'Direction (RTL)', 'arrow-swap', 'div', `
<div dir="rtl" class="${CARD} p-6 text-right">
  <h3 class="font-semibold">مرحبا</h3>
  <p class="${MUTED}">Content in this block flows right to left.</p>
</div>`);

// Navigation --------------------------------------------------------------------------
d('sc-breadcrumb', 'Breadcrumb', 'chevron-right', 'nav', `
<nav aria-label="breadcrumb">
  <ol class="flex flex-wrap items-center gap-1.5 text-sm text-zinc-500">
    <li><a href="#" class="hover:text-zinc-950">Home</a></li>
    <li aria-hidden="true">/</li>
    <li><a href="#" class="hover:text-zinc-950">Components</a></li>
    <li aria-hidden="true">/</li>
    <li aria-current="page" class="font-normal text-zinc-950">Breadcrumb</li>
  </ol>
</nav>`);
d('sc-navigation-menu', 'Navigation Menu', 'menu', 'nav', `
<nav class="relative">
  <ul class="flex items-center gap-1">
    <li><button type="button" class="${BTN} ${V.ghost} bg-zinc-100">Getting started ${CHEVRON}</button></li>
    <li><button type="button" class="${BTN} ${V.ghost}">Components ${CHEVRON}</button></li>
    <li><a href="#" class="${BTN} ${V.ghost}">Docs</a></li>
  </ul>
  <div class="${POP} absolute left-0 top-11 z-10 grid w-[400px] gap-3">
    <a href="#" class="block rounded-md p-3 hover:bg-zinc-100"><div class="text-sm font-medium">Introduction</div><p class="${MUTED}">Re-usable components built with Tailwind CSS.</p></a>
    <a href="#" class="block rounded-md p-3 hover:bg-zinc-100"><div class="text-sm font-medium">Installation</div><p class="${MUTED}">How to install dependencies and structure your app.</p></a>
  </div>
</nav>`);
d('sc-menubar', 'Menubar', 'menu', 'div', `
<div role="menubar" class="flex h-9 w-fit items-center gap-1 rounded-md border border-zinc-200 bg-white p-1 shadow-sm">
  <button role="menuitem" class="rounded-sm bg-zinc-100 px-3 py-1 text-sm font-medium">File</button>
  <button role="menuitem" class="rounded-sm px-3 py-1 text-sm font-medium hover:bg-zinc-100">Edit</button>
  <button role="menuitem" class="rounded-sm px-3 py-1 text-sm font-medium hover:bg-zinc-100">View</button>
  <button role="menuitem" class="rounded-sm px-3 py-1 text-sm font-medium hover:bg-zinc-100">Help</button>
</div>`);
d('sc-pagination', 'Pagination', 'ellipsis', 'nav', `
<nav aria-label="pagination" class="mx-auto flex w-full justify-center">
  <ul class="flex items-center gap-1">
    <li><a href="#" class="${BTN} ${V.ghost} px-2.5">&lsaquo; Previous</a></li>
    <li><a href="#" class="${BTN} ${V.ghost} w-9 px-0">1</a></li>
    <li><a href="#" aria-current="page" class="${BTN} ${V.outline} w-9 px-0">2</a></li>
    <li><a href="#" class="${BTN} ${V.ghost} w-9 px-0">3</a></li>
    <li><span class="flex h-9 w-9 items-center justify-center">&hellip;</span></li>
    <li><a href="#" class="${BTN} ${V.ghost} px-2.5">Next &rsaquo;</a></li>
  </ul>
</nav>`);
d('sc-dropdown-menu', 'Dropdown Menu', 'triangle-down', 'div', `
<div class="relative inline-block">
  ${btn('outline', 'Open')}
  <div role="menu" class="${MENU} absolute left-0 top-11 z-10">
    <div class="px-2 py-1.5 text-sm font-semibold">My Account</div>
    <div role="separator" class="-mx-1 my-1 h-px bg-zinc-200"></div>
    <div role="menuitem" class="${ITEM} justify-between">Profile <span class="text-xs tracking-widest opacity-60">⇧⌘P</span></div>
    <div role="menuitem" class="${ITEM} justify-between">Settings <span class="text-xs tracking-widest opacity-60">⌘S</span></div>
    <div role="separator" class="-mx-1 my-1 h-px bg-zinc-200"></div>
    <div role="menuitem" class="${ITEM}">Log out</div>
  </div>
</div>`);
d('sc-context-menu', 'Context Menu', 'list-unordered', 'div', `
<div class="relative flex h-[150px] w-[300px] items-center justify-center rounded-md border border-dashed border-zinc-300 text-sm">
  Right click here
  <div role="menu" class="${MENU} absolute left-1/2 top-1/2 z-10 w-48">
    <div role="menuitem" class="${ITEM} justify-between">Back <span class="text-xs opacity-60">⌘[</span></div>
    <div role="menuitem" class="${ITEM} justify-between">Reload <span class="text-xs opacity-60">⌘R</span></div>
    <div role="separator" class="-mx-1 my-1 h-px bg-zinc-200"></div>
    <div role="menuitem" class="${ITEM}">Show Bookmarks</div>
  </div>
</div>`);
d('sc-command', 'Command', 'terminal', 'div', `
<div class="flex w-full max-w-md flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-md">
  <input placeholder="Type a command or search..." class="h-11 border-b border-zinc-200 bg-transparent px-3 text-sm outline-none">
  <div class="p-1">
    <div class="px-2 py-1.5 text-xs font-medium text-zinc-500">Suggestions</div>
    <div class="${ITEM} bg-zinc-100">Calendar</div>
    <div class="${ITEM}">Search Emoji</div>
    <div class="${ITEM}">Calculator</div>
    <div role="separator" class="-mx-1 my-1 h-px bg-zinc-200"></div>
    <div class="px-2 py-1.5 text-xs font-medium text-zinc-500">Settings</div>
    <div class="${ITEM} justify-between">Profile <span class="text-xs opacity-60">⌘P</span></div>
  </div>
</div>`);

// Overlays (shown open) ---------------------------------------------------------------
d('sc-dialog', 'Dialog', 'window', 'div', `
<div class="${OVERLAY}">
  <div role="dialog" aria-modal="true" class="relative grid w-full max-w-lg gap-4 rounded-lg border border-zinc-200 bg-white p-6 shadow-lg">
    <button type="button" aria-label="Close" class="absolute right-4 top-4 opacity-70 hover:opacity-100">${X}</button>
    <div class="flex flex-col gap-1.5">
      <h2 class="text-lg font-semibold leading-none tracking-tight">Edit profile</h2>
      <p class="${MUTED}">Make changes to your profile here. Click save when you're done.</p>
    </div>
    <div class="grid gap-2">
      <label for="name" class="${LABEL}">Name</label>
      <input id="name" value="Pedro Duarte" class="${INPUT}">
    </div>
    <div class="flex justify-end gap-2">
      ${btn('primary', 'Save changes')}
    </div>
  </div>
</div>`);
d('sc-alert-dialog', 'Alert Dialog', 'warning', 'div', `
<div class="${OVERLAY}">
  <div role="alertdialog" aria-modal="true" class="grid w-full max-w-lg gap-4 rounded-lg border border-zinc-200 bg-white p-6 shadow-lg">
    <div class="flex flex-col gap-2">
      <h2 class="text-lg font-semibold">Are you absolutely sure?</h2>
      <p class="${MUTED}">This action cannot be undone. This will permanently delete your account.</p>
    </div>
    <div class="flex justify-end gap-2">
      ${btn('outline', 'Cancel')}
      ${btn('primary', 'Continue')}
    </div>
  </div>
</div>`);
d('sc-sheet', 'Sheet', 'layout-sidebar-right', 'div', `
<div class="relative min-h-[360px] overflow-hidden rounded-lg bg-black/80">
  <div role="dialog" class="absolute inset-y-0 right-0 flex w-3/4 max-w-sm flex-col gap-4 border-l border-zinc-200 bg-white p-6 shadow-lg">
    <button type="button" aria-label="Close" class="absolute right-4 top-4 opacity-70">${X}</button>
    <h2 class="text-lg font-semibold">Edit profile</h2>
    <p class="${MUTED}">Make changes to your profile here.</p>
    <input value="@peduarte" class="${INPUT}">
    <div class="mt-auto">${btn('primary', 'Save changes', 'w-full')}</div>
  </div>
</div>`);
d('sc-drawer', 'Drawer', 'layout-panel', 'div', `
<div class="relative min-h-[360px] overflow-hidden rounded-lg bg-black/80">
  <div role="dialog" class="absolute inset-x-0 bottom-0 flex flex-col gap-4 rounded-t-[10px] border-t border-zinc-200 bg-white p-6">
    <div class="mx-auto h-2 w-[100px] rounded-full bg-zinc-200"></div>
    <div class="text-center">
      <h2 class="text-lg font-semibold">Move Goal</h2>
      <p class="${MUTED}">Set your daily activity goal.</p>
    </div>
    <div class="mx-auto flex w-full max-w-sm flex-col gap-2">
      ${btn('primary', 'Submit')}
      ${btn('outline', 'Cancel')}
    </div>
  </div>
</div>`);
d('sc-popover', 'Popover', 'comment', 'div', `
<div class="relative inline-block">
  ${btn('outline', 'Open popover')}
  <div class="${POP} absolute left-0 top-11 z-10 w-72">
    <h4 class="font-medium leading-none">Dimensions</h4>
    <p class="mt-1 ${MUTED}">Set the dimensions for the layer.</p>
  </div>
</div>`);
d('sc-tooltip', 'Tooltip', 'info', 'div', `
<div class="relative inline-block">
  ${btn('outline', 'Hover')}
  <div role="tooltip" class="absolute bottom-11 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-zinc-50">Add to library</div>
</div>`);
d('sc-hover-card', 'Hover Card', 'account', 'div', `
<div class="relative inline-block">
  <a href="#" class="text-sm font-medium underline-offset-4 hover:underline">@nextjs</a>
  <div class="${POP} absolute left-0 top-7 z-10 flex w-80 gap-4">
    <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-100 font-medium">VC</span>
    <div>
      <h4 class="text-sm font-semibold">@nextjs</h4>
      <p class="text-sm">The React Framework – created and maintained by @vercel.</p>
      <p class="mt-2 text-xs text-zinc-500">Joined December 2021</p>
    </div>
  </div>
</div>`);
d('sc-toast', 'Toast', 'bell', 'div', `
<div role="status" class="flex w-[356px] items-start justify-between gap-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-lg">
  <div>
    <div class="text-sm font-semibold">Event has been created</div>
    <div class="text-sm text-zinc-500">Sunday, December 03, 2023 at 9:00 AM</div>
  </div>
  ${btn('primary', 'Undo', 'h-8 px-3 text-xs')}
</div>`);

// Feedback ----------------------------------------------------------------------------
d('sc-alert', 'Alert', 'info', 'div', `
<div role="alert" class="relative w-full rounded-lg border border-zinc-200 px-4 py-3 text-sm">
  <h5 class="mb-1 font-medium leading-none tracking-tight">Heads up!</h5>
  <div class="text-sm text-zinc-600">You can add components to your app using the CLI.</div>
</div>`);
d('sc-alert-destructive', 'Alert · Destructive', 'error', 'div', `
<div role="alert" class="relative w-full rounded-lg border border-red-500/50 px-4 py-3 text-sm text-red-600">
  <h5 class="mb-1 font-medium leading-none tracking-tight">Error</h5>
  <div class="text-sm">Your session has expired. Please log in again.</div>
</div>`);
d('sc-progress', 'Progress', 'loading', 'div', `
<div role="progressbar" aria-valuenow="60" aria-valuemin="0" aria-valuemax="100" class="relative h-2 w-full max-w-sm overflow-hidden rounded-full bg-zinc-900/20">
  <div class="h-full w-[60%] bg-zinc-900"></div>
</div>`);
d('sc-skeleton', 'Skeleton', 'loading', 'div', `
<div class="flex items-center gap-4">
  <div class="h-12 w-12 animate-pulse rounded-full bg-zinc-200"></div>
  <div class="space-y-2">
    <div class="h-4 w-[250px] animate-pulse rounded-md bg-zinc-200"></div>
    <div class="h-4 w-[200px] animate-pulse rounded-md bg-zinc-200"></div>
  </div>
</div>`);
d('sc-spinner', 'Spinner', 'sync', 'span', `
<span role="status" aria-label="Loading" class="inline-flex">
  <svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>
</span>`);
d('sc-empty', 'Empty', 'inbox', 'div', `
<div class="flex min-h-[240px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-zinc-300 p-8 text-center">
  <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100">
    <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16v13H4zM9 3h6v4H9z"/></svg>
  </div>
  <div>
    <h3 class="text-lg font-medium">No projects yet</h3>
    <p class="${MUTED}">You haven't created any projects yet. Get started by creating your first project.</p>
  </div>
  ${btn('primary', 'Create project')}
</div>`);

// Data display ------------------------------------------------------------------------
d('sc-avatar', 'Avatar', 'account', 'span', [`<span class="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-100 text-sm font-medium">JM</span>`]);
d('sc-badge', 'Badge', 'tag', 'span', [`<span class="inline-flex items-center rounded-md border border-transparent bg-zinc-900 px-2.5 py-0.5 text-xs font-semibold text-zinc-50 shadow">Badge</span>`]);
d('sc-badge-outline', 'Badge · Outline', 'tag', 'span', [`<span class="inline-flex items-center rounded-md border border-zinc-200 px-2.5 py-0.5 text-xs font-semibold">Outline</span>`]);
d('sc-kbd', 'Kbd', 'keyboard', 'kbd', [`<kbd class="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-zinc-200 bg-zinc-100 px-1.5 font-mono text-[11px] font-medium text-zinc-500">⌘K</kbd>`]);
d('sc-item', 'Item', 'list-flat', 'div', `
<div class="flex w-full max-w-md items-center gap-4 rounded-md border border-zinc-200 p-4">
  <div class="flex-1">
    <div class="text-sm font-medium">Basic Item</div>
    <p class="${MUTED}">A simple item with title and description.</p>
  </div>
  ${btn('outline', 'Action', 'h-8 px-3 text-xs')}
</div>`);
d('sc-table', 'Table', 'table', 'div', `
<div class="relative w-full overflow-auto">
  <table class="w-full caption-bottom text-sm">
    <caption class="mt-4 text-sm text-zinc-500">A list of your recent invoices.</caption>
    <thead class="[&_tr]:border-b">
      <tr class="border-b border-zinc-200">
        <th class="h-10 px-2 text-left align-middle font-medium text-zinc-500">Invoice</th>
        <th class="h-10 px-2 text-left align-middle font-medium text-zinc-500">Status</th>
        <th class="h-10 px-2 text-right align-middle font-medium text-zinc-500">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr class="border-b border-zinc-200 hover:bg-zinc-100/50"><td class="p-2 font-medium">INV001</td><td class="p-2">Paid</td><td class="p-2 text-right">$250.00</td></tr>
      <tr class="border-b border-zinc-200 hover:bg-zinc-100/50"><td class="p-2 font-medium">INV002</td><td class="p-2">Pending</td><td class="p-2 text-right">$150.00</td></tr>
    </tbody>
  </table>
</div>`);
d('sc-data-table', 'Data Table', 'table', 'div', `
<div class="w-full">
  <div class="flex items-center justify-between gap-2 py-4">
    <input placeholder="Filter emails..." class="${INPUT} max-w-sm">
    ${btn('outline', 'Columns ' + CHEVRON)}
  </div>
  <div class="rounded-md border border-zinc-200">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-zinc-200">
          <th class="h-10 w-8 px-2"><input type="checkbox" aria-label="Select all" class="accent-zinc-900"></th>
          <th class="h-10 px-2 text-left font-medium text-zinc-500">Status</th>
          <th class="h-10 px-2 text-left font-medium text-zinc-500">Email ↕</th>
          <th class="h-10 px-2 text-right font-medium text-zinc-500">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr class="border-b border-zinc-200"><td class="p-2"><input type="checkbox" aria-label="Select row" class="accent-zinc-900"></td><td class="p-2">success</td><td class="p-2">ken99@example.com</td><td class="p-2 text-right font-medium">$316.00</td></tr>
        <tr><td class="p-2"><input type="checkbox" aria-label="Select row" class="accent-zinc-900"></td><td class="p-2">processing</td><td class="p-2">abe45@example.com</td><td class="p-2 text-right font-medium">$242.00</td></tr>
      </tbody>
    </table>
  </div>
  <div class="flex items-center justify-end gap-2 py-4">
    <span class="flex-1 ${MUTED}">0 of 2 row(s) selected.</span>
    ${btn('outline', 'Previous', 'h-8 px-3 text-xs')}
    ${btn('outline', 'Next', 'h-8 px-3 text-xs')}
  </div>
</div>`);
d('sc-carousel', 'Carousel', 'arrow-both', 'div', `
<div class="relative mx-12 w-full max-w-xs">
  <div class="flex snap-x snap-mandatory gap-4 overflow-x-auto">
    <div class="${CARD} flex aspect-square w-full shrink-0 snap-center items-center justify-center text-4xl font-semibold">1</div>
    <div class="${CARD} flex aspect-square w-full shrink-0 snap-center items-center justify-center text-4xl font-semibold">2</div>
    <div class="${CARD} flex aspect-square w-full shrink-0 snap-center items-center justify-center text-4xl font-semibold">3</div>
  </div>
  <button type="button" aria-label="Previous slide" class="${ICON_BTN} absolute -left-12 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full">&lsaquo;</button>
  <button type="button" aria-label="Next slide" class="${ICON_BTN} absolute -right-12 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full">&rsaquo;</button>
</div>`);
d('sc-chart', 'Chart', 'graph', 'div', `
<div class="${CARD} w-full max-w-md">
  <div class="p-6 pb-2">
    <h3 class="font-semibold leading-none tracking-tight">Bar Chart</h3>
    <p class="${MUTED}">January – June 2026</p>
  </div>
  <div class="flex h-48 items-end gap-3 px-6 pb-2">
    <div class="flex-1 rounded-t bg-zinc-900" style="height: 62%"></div>
    <div class="flex-1 rounded-t bg-zinc-900" style="height: 88%"></div>
    <div class="flex-1 rounded-t bg-zinc-900" style="height: 45%"></div>
    <div class="flex-1 rounded-t bg-zinc-900" style="height: 30%"></div>
    <div class="flex-1 rounded-t bg-zinc-900" style="height: 70%"></div>
    <div class="flex-1 rounded-t bg-zinc-900" style="height: 80%"></div>
  </div>
  <div class="flex gap-3 px-6 pb-6 text-center text-xs text-zinc-500">
    <span class="flex-1">Jan</span><span class="flex-1">Feb</span><span class="flex-1">Mar</span><span class="flex-1">Apr</span><span class="flex-1">May</span><span class="flex-1">Jun</span>
  </div>
</div>`);
d('sc-code-block', 'Code Block', 'code', 'figure', `
<figure class="overflow-hidden rounded-lg border border-zinc-200">
  <figcaption class="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-xs text-zinc-500">
    <span>button.tsx</span>
    <button type="button" class="rounded px-2 py-0.5 hover:bg-zinc-200">Copy</button>
  </figcaption>
  <pre class="overflow-x-auto bg-zinc-950 p-4 text-sm text-zinc-50"><code>npx shadcn@latest add button</code></pre>
</figure>`);
d('sc-typography', 'Typography', 'text-size', 'article', `
<article class="max-w-prose">
  <h1 class="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl">Taxing Laughter: The Joke Tax Chronicles</h1>
  <p class="leading-7 [&:not(:first-child)]:mt-6">Once upon a time, in a far-off land, there was a very lazy king who spent all day lounging on his throne.</p>
  <h2 class="mt-10 scroll-m-20 border-b border-zinc-200 pb-2 text-3xl font-semibold tracking-tight">The King's Plan</h2>
  <blockquote class="mt-6 border-l-2 border-zinc-300 pl-6 italic">"After all," he said, "everyone enjoys a good joke."</blockquote>
  <ul class="my-6 ml-6 list-disc [&>li]:mt-2">
    <li>1st level of puns: 5 gold coins</li>
    <li>2nd level of jokes: 10 gold coins</li>
  </ul>
  <p class="text-sm text-zinc-500">Enter your email address.</p>
</article>`);

// Chat & AI ---------------------------------------------------------------------------
d('sc-message', 'Message', 'comment', 'div', `
<div class="flex w-full max-w-lg items-start gap-3">
  <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-medium">AI</span>
  <div class="grid gap-1">
    <div class="text-xs font-medium text-zinc-500">Assistant</div>
    <div class="text-sm leading-6">Sure — here's a summary of the changes in this pull request.</div>
  </div>
</div>`);
d('sc-message-user', 'Message · User', 'comment', 'div', `
<div class="flex w-full max-w-lg justify-end">
  <div class="max-w-[80%] rounded-2xl bg-zinc-100 px-4 py-2 text-sm">Can you summarize this PR?</div>
</div>`);
d('sc-message-scroller', 'Message Scroller', 'comment-discussion', 'div', `
<div class="relative flex h-80 w-full max-w-lg flex-col rounded-lg border border-zinc-200">
  <div class="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
    <div class="ml-auto max-w-[80%] rounded-2xl bg-zinc-100 px-4 py-2 text-sm">Hi! What can you do?</div>
    <div class="max-w-[80%] text-sm leading-6">I can answer questions, write code and explain things.</div>
    <div class="ml-auto max-w-[80%] rounded-2xl bg-zinc-100 px-4 py-2 text-sm">Show me an example.</div>
  </div>
  <button type="button" aria-label="Scroll to latest" class="${ICON_BTN} absolute bottom-16 left-1/2 h-8 w-8 -translate-x-1/2 rounded-full">↓</button>
  <div class="flex gap-2 border-t border-zinc-200 p-3">
    <input placeholder="Send a message..." class="${INPUT}">
    ${btn('primary', 'Send')}
  </div>
</div>`);
d('sc-bubble', 'Bubble', 'comment', 'div', `
<div class="relative w-fit max-w-xs rounded-2xl border border-zinc-200 bg-white px-4 py-2 shadow-sm">
  <div class="text-sm">That looks great, ship it! 🚀</div>
  <div class="absolute -bottom-3 right-3 flex gap-0.5 rounded-full border border-zinc-200 bg-white px-1.5 py-0.5 text-xs shadow-sm">👍 2 ❤️ 1</div>
</div>`);
d('sc-attachment', 'Attachment', 'file', 'div', `
<div class="flex w-full max-w-sm items-center gap-3 rounded-lg border border-zinc-200 p-2 pr-3">
  <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-zinc-100">
    <svg class="h-5 w-5 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
  </div>
  <div class="min-w-0 flex-1">
    <div class="truncate text-sm font-medium">quarterly-report.pdf</div>
    <div class="text-xs text-zinc-500">PDF · 2.4 MB</div>
  </div>
  <button type="button" aria-label="Remove attachment" class="rounded p-1 text-zinc-500 hover:bg-zinc-100">${X}</button>
</div>`);
d('sc-marker', 'Marker', 'dash', 'div', `
<div role="separator" class="flex w-full items-center gap-3 text-xs text-zinc-500">
  <span class="h-px flex-1 bg-zinc-200"></span>
  <span>Today</span>
  <span class="h-px flex-1 bg-zinc-200"></span>
</div>`);
d('sc-questionnaire', 'Questionnaire', 'question', 'form', `
<form class="${CARD} grid w-full max-w-md gap-4 p-6">
  <div class="text-xs font-medium text-zinc-500">Question 1 of 3</div>
  <div>
    <h3 class="font-semibold">How often do you deploy?</h3>
    <p class="${MUTED}">Pick the option closest to your team.</p>
  </div>
  <div class="grid gap-2">
    <label class="flex cursor-pointer items-start gap-3 rounded-md border border-zinc-200 p-3 has-[:checked]:border-zinc-900"><input type="radio" name="q1" class="mt-0.5 accent-zinc-900" checked><span><span class="block text-sm font-medium">Daily</span><span class="text-sm text-zinc-500">Several times a day</span></span></label>
    <label class="flex cursor-pointer items-start gap-3 rounded-md border border-zinc-200 p-3 has-[:checked]:border-zinc-900"><input type="radio" name="q1" class="mt-0.5 accent-zinc-900"><span><span class="block text-sm font-medium">Weekly</span><span class="text-sm text-zinc-500">Once or twice a week</span></span></label>
  </div>
  <input placeholder="Other..." class="${INPUT}">
  <div class="flex justify-between gap-2">
    ${btn('ghost', 'Previous')}
    <div class="flex gap-2">${btn('outline', 'Skip')}${btn('primary', 'Next')}</div>
  </div>
</form>`);
d('sc-trace', 'Trace', 'debug-alt', 'ol', `
<ol class="grid w-full max-w-md gap-1 text-sm">
  <li class="flex items-center gap-2 py-1"><span class="text-zinc-500">✦</span><span class="font-medium">Thinking</span><span class="text-zinc-500">· 4s</span></li>
  <li class="flex items-center gap-2 py-1"><span class="text-zinc-500">⌕</span><span class="font-medium">Searched the web</span><span class="text-zinc-500">· 3 sources</span></li>
  <li>
    <details>
      <summary class="flex cursor-pointer list-none items-center gap-2 py-1"><span class="text-zinc-500">⚙</span><span class="font-medium">Ran tool: read_file</span><span class="ml-auto">${CHEVRON}</span></summary>
      <div class="ml-6 rounded-md bg-zinc-50 p-2 font-mono text-xs text-zinc-600">src/app/page.tsx (142 lines)</div>
    </details>
  </li>
  <li class="flex items-center gap-2 py-1 text-green-700">${CHECK}<span class="font-medium">Done</span></li>
</ol>`);

export const SHADCN_SNIPPETS = defs;

/** Elements bar sub-tabs for the shadcn/ui category. */
export const SHADCN_GROUPS: { name: string; items: string[] }[] = [
  { name: 'Actions', items: ['sc-button', 'sc-button-secondary', 'sc-button-outline', 'sc-button-ghost', 'sc-button-destructive', 'sc-button-link', '-', 'sc-button-group', 'sc-toggle', 'sc-toggle-group'] },
  { name: 'Forms', items: ['sc-input', 'sc-textarea', 'sc-label', 'sc-field', 'sc-input-group', 'sc-input-otp', '-', 'sc-checkbox', 'sc-radio-group', 'sc-switch', 'sc-slider', '-', 'sc-select', 'sc-native-select', 'sc-combobox', 'sc-date-picker', 'sc-calendar'] },
  { name: 'Layout', items: ['sc-card', 'sc-separator', 'sc-aspect-ratio', 'sc-resizable', 'sc-scroll-area', 'sc-sidebar', '-', 'sc-accordion', 'sc-collapsible', 'sc-tabs', 'sc-direction'] },
  { name: 'Navigation', items: ['sc-breadcrumb', 'sc-navigation-menu', 'sc-menubar', 'sc-pagination', '-', 'sc-dropdown-menu', 'sc-context-menu', 'sc-command'] },
  { name: 'Overlays', items: ['sc-dialog', 'sc-alert-dialog', 'sc-sheet', 'sc-drawer', '-', 'sc-popover', 'sc-tooltip', 'sc-hover-card', 'sc-toast'] },
  { name: 'Feedback', items: ['sc-alert', 'sc-alert-destructive', 'sc-progress', 'sc-skeleton', 'sc-spinner', 'sc-empty'] },
  { name: 'Data', items: ['sc-avatar', 'sc-badge', 'sc-badge-outline', 'sc-kbd', 'sc-item', '-', 'sc-table', 'sc-data-table', 'sc-carousel', 'sc-chart', 'sc-code-block', 'sc-typography'] },
  { name: 'Chat & AI', items: ['sc-message', 'sc-message-user', 'sc-message-scroller', 'sc-bubble', 'sc-attachment', '-', 'sc-marker', 'sc-questionnaire', 'sc-trace'] },
];
