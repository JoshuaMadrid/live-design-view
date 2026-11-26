// Tailwind components for the Elements bar: plain HTML with utility classes (the Tailwind CDN
// script is added to <head> on first use). Covers the usual front-end kit — layout, navigation,
// content, buttons, forms, feedback, interactive pieces, page sections and shop blocks.
// Interactive pieces use built-in HTML (<details>, <dialog>, scroll snap), so they work without JS.

export interface TwDef {
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

const BTN = 'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold';
const PRIMARY = `${BTN} bg-indigo-600 text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600`;
const INPUT = 'block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500';
const LABEL = 'block text-sm font-medium text-gray-700';
const IMG = 'w-full rounded-lg bg-gray-100 object-cover';

export const TW_SNIPPETS: TwDef[] = [];
const d = (key: string, name: string, icon: string, tag: string, src: string | string[]) =>
  TW_SNIPPETS.push({ key, name, icon, tag, lines: Array.isArray(src) ? src : L(src) });

// Layout -------------------------------------------------------------------------------
d('tw-container', 'Container', 'layout-centered', 'div', '<div class="mx-auto max-w-6xl px-4"></div>');
d('tw-section', 'Section', 'symbol-structure', 'section', `
<section class="mx-auto max-w-6xl px-4 py-16">
  <h2 class="text-3xl font-bold tracking-tight">Section heading</h2>
  <p class="mt-4 text-gray-600">Section text.</p>
</section>`);
d('tw-flex', 'Flex Row', 'layout-panel-justify', 'div', `
<div class="flex items-center gap-4">
  <div>Item</div>
  <div>Item</div>
</div>`);
d('tw-stack', 'Stack', 'list-flat', 'div', `
<div class="flex flex-col gap-4">
  <div>Item</div>
  <div>Item</div>
  <div>Item</div>
</div>`);
d('tw-grid-2', 'Grid (2 col)', 'layout', 'div', `
<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
  <div class="rounded-lg border p-6">One</div>
  <div class="rounded-lg border p-6">Two</div>
</div>`);
d('tw-grid', 'Grid (3 col)', 'layout', 'div', `
<div class="grid grid-cols-1 gap-6 md:grid-cols-3">
  <div class="rounded-lg border p-6">One</div>
  <div class="rounded-lg border p-6">Two</div>
  <div class="rounded-lg border p-6">Three</div>
</div>`);
d('tw-grid-4', 'Grid (4 col)', 'layout', 'div', `
<div class="grid grid-cols-2 gap-6 md:grid-cols-4">
  <div class="rounded-lg border p-6">One</div>
  <div class="rounded-lg border p-6">Two</div>
  <div class="rounded-lg border p-6">Three</div>
  <div class="rounded-lg border p-6">Four</div>
</div>`);
d('tw-sidebar-layout', 'Sidebar + Main', 'layout-sidebar-left', 'div', `
<div class="grid gap-8 md:grid-cols-[16rem_1fr]">
  <aside class="rounded-lg bg-gray-50 p-6">Sidebar</aside>
  <main class="min-w-0">Main content</main>
</div>`);
d('tw-center', 'Centered', 'layout-centered', 'div', `
<div class="flex min-h-64 items-center justify-center">
  <p>Centered content</p>
</div>`);
d('tw-divider', 'Divider', 'dash', 'hr', '<hr class="my-8 border-gray-200">');
d('tw-divider-label', 'Divider with Label', 'dash', 'div', `
<div class="my-8 flex items-center gap-4 text-sm text-gray-500">
  <span class="h-px flex-1 bg-gray-200"></span>
  <span>or</span>
  <span class="h-px flex-1 bg-gray-200"></span>
</div>`);
d('tw-ratio', 'Video (16:9)', 'device-camera-video', 'div', `
<div class="aspect-video overflow-hidden rounded-lg bg-gray-100">
  <iframe class="h-full w-full" src="" title="Video" allowfullscreen></iframe>
</div>`);

// Navigation ---------------------------------------------------------------------------
d('tw-navbar', 'Navbar', 'compass', 'nav', `
<nav class="flex items-center justify-between border-b px-6 py-4">
  <a href="#" class="font-semibold">Brand</a>
  <div class="flex gap-6 text-sm">
    <a href="#" class="hover:underline">Features</a>
    <a href="#" class="hover:underline">Pricing</a>
  </div>
</nav>`);
d('tw-navbar-cta', 'Navbar with Button', 'compass', 'header', `
<header class="border-b bg-white">
  <nav class="mx-auto flex max-w-6xl items-center justify-between px-4 py-4" aria-label="Main">
    <a href="#" class="text-lg font-bold">Brand</a>
    <ul class="hidden gap-8 text-sm font-medium md:flex">
      <li><a href="#" class="hover:text-indigo-600">Home</a></li>
      <li><a href="#" class="hover:text-indigo-600">About</a></li>
      <li><a href="#" class="hover:text-indigo-600">Shop</a></li>
    </ul>
    <a href="#" class="${PRIMARY}">Sign up</a>
  </nav>
</header>`);
d('tw-breadcrumb', 'Breadcrumb', 'chevron-right', 'nav', `
<nav aria-label="Breadcrumb">
  <ol class="flex items-center gap-2 text-sm text-gray-500">
    <li><a href="#" class="hover:text-gray-900">Home</a></li>
    <li aria-hidden="true">/</li>
    <li><a href="#" class="hover:text-gray-900">Shop</a></li>
    <li aria-hidden="true">/</li>
    <li class="font-medium text-gray-900" aria-current="page">Product</li>
  </ol>
</nav>`);
d('tw-pagination', 'Pagination', 'ellipsis', 'nav', `
<nav class="flex items-center gap-1 text-sm" aria-label="Pagination">
  <a href="#" class="rounded-md px-3 py-2 hover:bg-gray-100">Previous</a>
  <a href="#" class="rounded-md bg-indigo-600 px-3 py-2 text-white" aria-current="page">1</a>
  <a href="#" class="rounded-md px-3 py-2 hover:bg-gray-100">2</a>
  <a href="#" class="rounded-md px-3 py-2 hover:bg-gray-100">3</a>
  <a href="#" class="rounded-md px-3 py-2 hover:bg-gray-100">Next</a>
</nav>`);
d('tw-tabs', 'Tabs', 'browser', 'nav', `
<nav class="flex gap-6 border-b text-sm font-medium" aria-label="Tabs">
  <a href="#" class="-mb-px border-b-2 border-indigo-600 px-1 py-3 text-indigo-600" aria-current="page">Overview</a>
  <a href="#" class="-mb-px border-b-2 border-transparent px-1 py-3 text-gray-500 hover:text-gray-700">Details</a>
  <a href="#" class="-mb-px border-b-2 border-transparent px-1 py-3 text-gray-500 hover:text-gray-700">Reviews</a>
</nav>`);
d('tw-pills', 'Pills', 'browser', 'nav', `
<nav class="flex gap-2 text-sm font-medium" aria-label="Sections">
  <a href="#" class="rounded-full bg-indigo-600 px-4 py-2 text-white" aria-current="page">All</a>
  <a href="#" class="rounded-full bg-gray-100 px-4 py-2 hover:bg-gray-200">Coffee</a>
  <a href="#" class="rounded-full bg-gray-100 px-4 py-2 hover:bg-gray-200">Tea</a>
</nav>`);
d('tw-sidebar-nav', 'Sidebar Nav', 'layout-sidebar-left', 'nav', `
<nav class="w-60 space-y-1 text-sm" aria-label="Sidebar">
  <a href="#" class="block rounded-md bg-gray-100 px-3 py-2 font-medium" aria-current="page">Dashboard</a>
  <a href="#" class="block rounded-md px-3 py-2 text-gray-600 hover:bg-gray-50">Orders</a>
  <a href="#" class="block rounded-md px-3 py-2 text-gray-600 hover:bg-gray-50">Customers</a>
  <a href="#" class="block rounded-md px-3 py-2 text-gray-600 hover:bg-gray-50">Settings</a>
</nav>`);
d('tw-skip-link', 'Skip Link', 'arrow-down', 'a', '<a href="#main" class="sr-only rounded-md bg-white px-4 py-2 focus:not-sr-only focus:absolute focus:left-4 focus:top-4">Skip to content</a>');
d('tw-footer', 'Footer', 'layout-panel', 'footer', `
<footer class="border-t px-6 py-8 text-center text-sm text-gray-500">
  <p>&copy; 2026 Company</p>
</footer>`);
d('tw-footer-cols', 'Footer with Columns', 'layout-panel', 'footer', `
<footer class="bg-gray-900 text-gray-300">
  <div class="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-4">
    <div>
      <p class="text-lg font-semibold text-white">Brand</p>
      <p class="mt-2 text-sm">A short line about the company.</p>
    </div>
    <div>
      <h3 class="text-sm font-semibold text-white">Shop</h3>
      <ul class="mt-3 space-y-2 text-sm">
        <li><a href="#" class="hover:text-white">Products</a></li>
        <li><a href="#" class="hover:text-white">Sale</a></li>
      </ul>
    </div>
    <div>
      <h3 class="text-sm font-semibold text-white">Company</h3>
      <ul class="mt-3 space-y-2 text-sm">
        <li><a href="#" class="hover:text-white">About</a></li>
        <li><a href="#" class="hover:text-white">Careers</a></li>
      </ul>
    </div>
    <div>
      <h3 class="text-sm font-semibold text-white">Help</h3>
      <ul class="mt-3 space-y-2 text-sm">
        <li><a href="#" class="hover:text-white">Shipping</a></li>
        <li><a href="#" class="hover:text-white">Contact</a></li>
      </ul>
    </div>
  </div>
  <p class="border-t border-gray-800 py-6 text-center text-xs">&copy; 2026 Company. All rights reserved.</p>
</footer>`);

// Content ------------------------------------------------------------------------------
d('tw-card', 'Card', 'preview', 'div', `
<div class="max-w-sm rounded-xl border bg-white p-6 shadow-sm">
  <h3 class="text-lg font-semibold">Card title</h3>
  <p class="mt-2 text-sm text-gray-600">Card description goes here.</p>
</div>`);
d('tw-card-image', 'Card with Image', 'preview', 'article', `
<article class="max-w-sm overflow-hidden rounded-xl border bg-white shadow-sm">
  <img src="" alt="Describe the image" class="aspect-video ${IMG} rounded-none">
  <div class="p-6">
    <h3 class="text-lg font-semibold">Card title</h3>
    <p class="mt-2 text-sm text-gray-600">Card description goes here.</p>
    <a href="#" class="mt-4 inline-block text-sm font-semibold text-indigo-600 hover:text-indigo-500">Read more &rarr;</a>
  </div>
</article>`);
d('tw-media', 'Horizontal Card', 'preview', 'div', `
<div class="flex gap-4 rounded-xl border bg-white p-4">
  <img src="" alt="Describe the image" class="h-24 w-24 flex-none ${IMG}">
  <div>
    <h3 class="font-semibold">Title</h3>
    <p class="mt-1 text-sm text-gray-600">Text beside an image, like a media object.</p>
  </div>
</div>`);
d('tw-list-group', 'List Group', 'list-unordered', 'ul', `
<ul class="divide-y rounded-lg border bg-white text-sm">
  <li class="px-4 py-3">First item</li>
  <li class="px-4 py-3">Second item</li>
  <li class="px-4 py-3">Third item</li>
</ul>`);
d('tw-dl', 'Description List', 'list-tree', 'dl', `
<dl class="divide-y text-sm">
  <div class="grid grid-cols-3 gap-4 py-3">
    <dt class="font-medium text-gray-900">Name</dt>
    <dd class="col-span-2 text-gray-600">Value</dd>
  </div>
  <div class="grid grid-cols-3 gap-4 py-3">
    <dt class="font-medium text-gray-900">Email</dt>
    <dd class="col-span-2 text-gray-600">name@example.com</dd>
  </div>
</dl>`);
d('tw-table', 'Table', 'table', 'div', `
<div class="overflow-x-auto rounded-lg border">
  <table class="min-w-full divide-y text-left text-sm">
    <thead class="bg-gray-50">
      <tr>
        <th scope="col" class="px-4 py-3 font-semibold">Name</th>
        <th scope="col" class="px-4 py-3 font-semibold">Role</th>
        <th scope="col" class="px-4 py-3 font-semibold">Status</th>
      </tr>
    </thead>
    <tbody class="divide-y bg-white">
      <tr><td class="px-4 py-3">Alex</td><td class="px-4 py-3">Designer</td><td class="px-4 py-3">Active</td></tr>
      <tr class="even:bg-gray-50"><td class="px-4 py-3">Sam</td><td class="px-4 py-3">Developer</td><td class="px-4 py-3">Away</td></tr>
    </tbody>
  </table>
</div>`);
d('tw-blockquote', 'Blockquote', 'quote', 'blockquote', `
<blockquote class="border-l-4 border-indigo-600 pl-4 italic text-gray-700">
  <p>“A quote that stands out from the text.”</p>
  <footer class="mt-2 text-sm not-italic text-gray-500">— Name</footer>
</blockquote>`);
d('tw-figure', 'Figure', 'device-camera', 'figure', `
<figure>
  <img src="" alt="Describe the image" class="aspect-video ${IMG}">
  <figcaption class="mt-2 text-sm text-gray-500">Caption</figcaption>
</figure>`);
d('tw-avatar', 'Avatar', 'account', 'img', '<img src="" alt="Name" class="h-10 w-10 rounded-full bg-gray-200 object-cover">');
d('tw-avatar-group', 'Avatar Group', 'organization', 'div', `
<div class="flex -space-x-2">
  <img src="" alt="Name" class="h-10 w-10 rounded-full bg-gray-200 ring-2 ring-white">
  <img src="" alt="Name" class="h-10 w-10 rounded-full bg-gray-300 ring-2 ring-white">
  <img src="" alt="Name" class="h-10 w-10 rounded-full bg-gray-400 ring-2 ring-white">
</div>`);
d('tw-kbd', 'Keyboard Key', 'keyboard', 'kbd', '<kbd class="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-mono text-xs">Ctrl</kbd>');
d('tw-code', 'Code Block', 'code', 'pre', `
<pre class="overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100"><code>&lt;p&gt;Hello&lt;/p&gt;</code></pre>`);

// Buttons & badges ---------------------------------------------------------------------
d('tw-button', 'Button', 'record-small', 'button', `<button type="button" class="${PRIMARY}">Button</button>`);
d('tw-button-secondary', 'Secondary Button', 'record-small', 'button', `<button type="button" class="${BTN} bg-gray-100 text-gray-900 hover:bg-gray-200">Button</button>`);
d('tw-button-outline', 'Outline Button', 'circle-large-outline', 'button', `<button type="button" class="${BTN} border border-gray-300 bg-white text-gray-900 hover:bg-gray-50">Button</button>`);
d('tw-button-link', 'Link Button', 'link', 'a', '<a href="#" class="text-sm font-semibold text-indigo-600 hover:text-indigo-500">Learn more &rarr;</a>');
d('tw-button-group', 'Button Group', 'symbol-array', 'div', `
<div class="inline-flex rounded-md shadow-sm" role="group">
  <button type="button" class="rounded-l-md border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50">Day</button>
  <button type="button" class="-ml-px border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50">Week</button>
  <button type="button" class="-ml-px rounded-r-md border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50">Month</button>
</div>`);
d('tw-button-icon', 'Icon Button', 'add', 'button', '<button type="button" class="inline-flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-500" aria-label="Add">+</button>');
d('tw-close', 'Close Button', 'close', 'button', '<button type="button" class="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Close">&times;</button>');
d('tw-badge', 'Badge', 'tag', 'span', '<span class="inline-flex items-center rounded-full bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700">Badge</span>');
d('tw-badge-status', 'Status Badge', 'circle-filled', 'span', `
<span class="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700">
  <span class="h-1.5 w-1.5 rounded-full bg-green-500"></span>
  Online
</span>`);

// Forms --------------------------------------------------------------------------------
d('tw-input', 'Input', 'symbol-string', 'div', `
<div>
  <label for="name" class="${LABEL}">Name</label>
  <input id="name" name="name" type="text" class="mt-1 ${INPUT}">
</div>`);
d('tw-textarea', 'Textarea', 'note', 'div', `
<div>
  <label for="message" class="${LABEL}">Message</label>
  <textarea id="message" name="message" rows="4" class="mt-1 ${INPUT}"></textarea>
</div>`);
d('tw-select', 'Select', 'chevron-down', 'div', `
<div>
  <label for="size" class="${LABEL}">Size</label>
  <select id="size" name="size" class="mt-1 ${INPUT}">
    <option>Small</option>
    <option>Medium</option>
    <option>Large</option>
  </select>
</div>`);
d('tw-checkbox', 'Checkbox', 'pass', 'label', `
<label class="flex items-center gap-2 text-sm">
  <input type="checkbox" name="agree" class="h-4 w-4 rounded border-gray-300 accent-indigo-600">
  I agree to the terms
</label>`);
d('tw-radio-group', 'Radio Group', 'list-selection', 'fieldset', `
<fieldset>
  <legend class="${LABEL}">Plan</legend>
  <div class="mt-2 space-y-2 text-sm">
    <label class="flex items-center gap-2"><input type="radio" name="plan" value="basic" class="h-4 w-4 accent-indigo-600" checked> Basic</label>
    <label class="flex items-center gap-2"><input type="radio" name="plan" value="pro" class="h-4 w-4 accent-indigo-600"> Pro</label>
  </div>
</fieldset>`);
d('tw-switch', 'Toggle Switch', 'settings', 'label', `
<label class="inline-flex cursor-pointer items-center gap-3 text-sm">
  <input type="checkbox" name="notify" class="peer sr-only">
  <span class="relative h-6 w-11 rounded-full bg-gray-200 transition after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:bg-indigo-600 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500"></span>
  Email me updates
</label>`);
d('tw-range', 'Range', 'settings', 'div', `
<div>
  <label for="volume" class="${LABEL}">Volume</label>
  <input id="volume" name="volume" type="range" class="mt-2 w-full accent-indigo-600">
</div>`);
d('tw-file', 'File Input', 'cloud-upload', 'div', `
<div>
  <label for="upload" class="${LABEL}">Upload a file</label>
  <input id="upload" name="upload" type="file" class="mt-1 block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100">
</div>`);
d('tw-input-group', 'Input Group', 'symbol-string', 'div', `
<div>
  <label for="price" class="${LABEL}">Price</label>
  <div class="mt-1 flex rounded-md shadow-sm">
    <span class="inline-flex items-center rounded-l-md border border-r-0 border-gray-300 bg-gray-50 px-3 text-sm text-gray-500">$</span>
    <input id="price" name="price" type="text" class="block w-full rounded-r-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
  </div>
</div>`);
d('tw-floating', 'Floating Label', 'symbol-string', 'div', `
<div class="relative">
  <input id="email-f" name="email" type="email" placeholder=" " class="peer block w-full rounded-md border border-gray-300 px-3 pb-2 pt-5 text-sm focus:border-indigo-500 focus:outline-none">
  <label for="email-f" class="absolute left-3 top-1.5 text-xs text-gray-500 transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-sm peer-focus:top-1.5 peer-focus:text-xs">Email address</label>
</div>`);
d('tw-input-error', 'Input with Error', 'error', 'div', `
<div>
  <label for="email-e" class="${LABEL}">Email</label>
  <input id="email-e" name="email" type="email" aria-invalid="true" aria-describedby="email-e-msg" class="mt-1 block w-full rounded-md border border-red-500 px-3 py-2 text-sm text-red-900 focus:outline-none focus:ring-1 focus:ring-red-500">
  <p id="email-e-msg" class="mt-1 text-sm text-red-600">Enter a valid email address.</p>
</div>`);
d('tw-search', 'Search Bar', 'search', 'form', `
<form role="search" class="flex gap-2">
  <label for="q" class="sr-only">Search</label>
  <input id="q" name="q" type="search" placeholder="Search" class="${INPUT}">
  <button type="submit" class="${PRIMARY}">Search</button>
</form>`);
d('tw-form', 'Form Layout', 'checklist', 'form', `
<form action="#" method="post" class="max-w-md space-y-4">
  <div>
    <label for="f-name" class="${LABEL}">Name</label>
    <input id="f-name" name="name" type="text" required class="mt-1 ${INPUT}">
  </div>
  <div>
    <label for="f-email" class="${LABEL}">Email</label>
    <input id="f-email" name="email" type="email" required class="mt-1 ${INPUT}">
  </div>
  <button type="submit" class="${PRIMARY}">Submit</button>
</form>`);
d('tw-contact-form', 'Contact Form', 'mail', 'form', `
<form action="#" method="post" class="grid max-w-xl gap-4 sm:grid-cols-2">
  <div>
    <label for="c-first" class="${LABEL}">First name</label>
    <input id="c-first" name="first" type="text" class="mt-1 ${INPUT}">
  </div>
  <div>
    <label for="c-last" class="${LABEL}">Last name</label>
    <input id="c-last" name="last" type="text" class="mt-1 ${INPUT}">
  </div>
  <div class="sm:col-span-2">
    <label for="c-email" class="${LABEL}">Email</label>
    <input id="c-email" name="email" type="email" required class="mt-1 ${INPUT}">
  </div>
  <div class="sm:col-span-2">
    <label for="c-msg" class="${LABEL}">Message</label>
    <textarea id="c-msg" name="message" rows="4" class="mt-1 ${INPUT}"></textarea>
  </div>
  <button type="submit" class="${PRIMARY} sm:col-span-2">Send message</button>
</form>`);

// Feedback -----------------------------------------------------------------------------
d('tw-alert', 'Alert', 'info', 'div', '<div class="rounded-md border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-800" role="status">Heads up! Something needs your attention.</div>');
d('tw-alert-info', 'Alert: Info', 'info', 'div', '<div class="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800" role="status"><strong class="font-semibold">Note:</strong> Some helpful information.</div>');
d('tw-alert-success', 'Alert: Success', 'pass-filled', 'div', '<div class="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800" role="status"><strong class="font-semibold">Saved.</strong> Your changes are live.</div>');
d('tw-alert-error', 'Alert: Error', 'error', 'div', '<div class="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert"><strong class="font-semibold">Error:</strong> Something went wrong.</div>');
d('tw-toast', 'Toast', 'bell', 'div', `
<div class="flex w-80 items-start gap-3 rounded-lg border bg-white p-4 shadow-lg" role="status">
  <div class="flex-1">
    <p class="text-sm font-semibold">Added to cart</p>
    <p class="mt-1 text-sm text-gray-600">Espresso Blend, 1 bag.</p>
  </div>
  <button type="button" class="text-gray-400 hover:text-gray-600" aria-label="Close">&times;</button>
</div>`);
d('tw-progress', 'Progress Bar', 'loading', 'div', `
<div>
  <div class="mb-1 flex justify-between text-sm"><span>Progress</span><span>60%</span></div>
  <div class="h-2 overflow-hidden rounded-full bg-gray-200" role="progressbar" aria-valuenow="60" aria-valuemin="0" aria-valuemax="100" aria-label="Progress">
    <div class="h-full w-3/5 rounded-full bg-indigo-600"></div>
  </div>
</div>`);
d('tw-spinner', 'Spinner', 'sync', 'div', '<div class="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600" role="status" aria-label="Loading"></div>');
d('tw-skeleton', 'Skeleton', 'loading', 'div', `
<div class="animate-pulse space-y-3" aria-hidden="true">
  <div class="h-4 w-3/4 rounded bg-gray-200"></div>
  <div class="h-4 rounded bg-gray-200"></div>
  <div class="h-4 w-5/6 rounded bg-gray-200"></div>
</div>`);
d('tw-empty', 'Empty State', 'inbox', 'div', `
<div class="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
  <h3 class="text-sm font-semibold">Nothing here yet</h3>
  <p class="mt-1 text-sm text-gray-500">Get started by adding your first item.</p>
  <button type="button" class="mt-4 ${PRIMARY}">Add item</button>
</div>`);
d('tw-tooltip', 'Tooltip', 'comment', 'span', `
<span class="group relative inline-block">
  <button type="button" class="underline decoration-dotted">Hover me</button>
  <span class="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100" role="tooltip">Tooltip text</span>
</span>`);

// Interactive (built-in HTML, no script) ------------------------------------------------
d('tw-accordion', 'Accordion', 'fold', 'div', `
<div class="divide-y rounded-lg border">
  <details class="group p-4" open>
    <summary class="flex cursor-pointer list-none items-center justify-between font-medium">First question<span class="transition group-open:rotate-45">+</span></summary>
    <p class="mt-3 text-sm text-gray-600">The answer.</p>
  </details>
  <details class="group p-4">
    <summary class="flex cursor-pointer list-none items-center justify-between font-medium">Second question<span class="transition group-open:rotate-45">+</span></summary>
    <p class="mt-3 text-sm text-gray-600">The answer.</p>
  </details>
</div>`);
d('tw-collapse', 'Collapse', 'unfold', 'details', `
<details class="rounded-lg border p-4">
  <summary class="cursor-pointer font-medium">Show more</summary>
  <p class="mt-3 text-sm text-gray-600">Hidden content.</p>
</details>`);
d('tw-dropdown', 'Dropdown', 'chevron-down', 'details', `
<details class="relative inline-block">
  <summary class="${BTN} cursor-pointer list-none border border-gray-300 bg-white">Options &#9662;</summary>
  <ul class="absolute right-0 z-10 mt-2 w-44 rounded-md border bg-white py-1 text-sm shadow-lg">
    <li><a href="#" class="block px-4 py-2 hover:bg-gray-50">Edit</a></li>
    <li><a href="#" class="block px-4 py-2 hover:bg-gray-50">Duplicate</a></li>
    <li><a href="#" class="block px-4 py-2 text-red-600 hover:bg-gray-50">Delete</a></li>
  </ul>
</details>`);
d('tw-modal', 'Modal', 'window', 'dialog', `
<dialog open class="w-full max-w-md rounded-xl p-6 shadow-xl backdrop:bg-black/40">
  <h2 class="text-lg font-semibold">Dialog title</h2>
  <p class="mt-2 text-sm text-gray-600">Dialog content.</p>
  <form method="dialog" class="mt-6 flex justify-end gap-2">
    <button class="${BTN} border border-gray-300 bg-white">Cancel</button>
    <button class="${PRIMARY}">Confirm</button>
  </form>
</dialog>`);
d('tw-offcanvas', 'Offcanvas Panel', 'layout-sidebar-right', 'aside', `
<aside class="fixed inset-y-0 right-0 z-20 w-80 border-l bg-white p-6 shadow-xl" aria-label="Panel">
  <div class="flex items-center justify-between">
    <h2 class="text-lg font-semibold">Panel</h2>
    <button type="button" class="text-gray-400 hover:text-gray-600" aria-label="Close">&times;</button>
  </div>
  <p class="mt-4 text-sm text-gray-600">Panel content.</p>
</aside>`);
d('tw-carousel', 'Carousel', 'arrow-swap', 'div', `
<div class="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4" aria-label="Gallery">
  <img src="" alt="Slide 1" class="aspect-video w-4/5 flex-none snap-center ${IMG}">
  <img src="" alt="Slide 2" class="aspect-video w-4/5 flex-none snap-center ${IMG}">
  <img src="" alt="Slide 3" class="aspect-video w-4/5 flex-none snap-center ${IMG}">
</div>`);

// Page sections ------------------------------------------------------------------------
d('tw-hero', 'Hero', 'star-empty', 'section', `
<section class="px-6 py-24 text-center">
  <h1 class="text-4xl font-bold tracking-tight sm:text-6xl">Build something great</h1>
  <p class="mx-auto mt-6 max-w-2xl text-lg text-gray-600">A short supporting sentence about the product.</p>
  <a href="#" class="mt-10 ${PRIMARY}">Get started</a>
</section>`);
d('tw-hero-split', 'Hero with Image', 'star-empty', 'section', `
<section class="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 md:grid-cols-2">
  <div>
    <h1 class="text-4xl font-bold tracking-tight sm:text-5xl">Headline that says what you do</h1>
    <p class="mt-6 text-lg text-gray-600">Supporting text with the main benefit.</p>
    <div class="mt-8 flex gap-4">
      <a href="#" class="${PRIMARY}">Get started</a>
      <a href="#" class="${BTN} border border-gray-300">Learn more</a>
    </div>
  </div>
  <img src="" alt="Describe the image" class="aspect-[4/3] ${IMG}">
</section>`);
d('tw-features', 'Feature Grid', 'symbol-misc', 'section', `
<section class="mx-auto max-w-6xl px-4 py-16">
  <h2 class="text-center text-3xl font-bold tracking-tight">Why people choose us</h2>
  <div class="mt-12 grid gap-8 md:grid-cols-3">
    <div>
      <h3 class="font-semibold">Fast</h3>
      <p class="mt-2 text-sm text-gray-600">One sentence about this feature.</p>
    </div>
    <div>
      <h3 class="font-semibold">Simple</h3>
      <p class="mt-2 text-sm text-gray-600">One sentence about this feature.</p>
    </div>
    <div>
      <h3 class="font-semibold">Friendly</h3>
      <p class="mt-2 text-sm text-gray-600">One sentence about this feature.</p>
    </div>
  </div>
</section>`);
d('tw-cta', 'Call to Action', 'megaphone', 'section', `
<section class="rounded-2xl bg-indigo-600 px-6 py-16 text-center text-white">
  <h2 class="text-3xl font-bold">Ready to start?</h2>
  <p class="mx-auto mt-4 max-w-xl text-indigo-100">One line that nudges the reader to act.</p>
  <a href="#" class="mt-8 inline-block rounded-md bg-white px-5 py-2.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-50">Get started</a>
</section>`);
d('tw-pricing', 'Pricing', 'credit-card', 'section', `
<section class="mx-auto grid max-w-5xl gap-6 px-4 py-16 md:grid-cols-3">
  <div class="rounded-2xl border p-8">
    <h3 class="font-semibold">Basic</h3>
    <p class="mt-4"><span class="text-4xl font-bold">$9</span><span class="text-sm text-gray-500">/month</span></p>
    <ul class="mt-6 space-y-2 text-sm text-gray-600"><li>One feature</li><li>Another feature</li></ul>
    <a href="#" class="mt-8 block rounded-md border px-4 py-2 text-center text-sm font-semibold hover:bg-gray-50">Choose Basic</a>
  </div>
  <div class="rounded-2xl border-2 border-indigo-600 p-8">
    <h3 class="font-semibold text-indigo-600">Pro</h3>
    <p class="mt-4"><span class="text-4xl font-bold">$29</span><span class="text-sm text-gray-500">/month</span></p>
    <ul class="mt-6 space-y-2 text-sm text-gray-600"><li>Everything in Basic</li><li>More features</li></ul>
    <a href="#" class="mt-8 block rounded-md bg-indigo-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-indigo-500">Choose Pro</a>
  </div>
  <div class="rounded-2xl border p-8">
    <h3 class="font-semibold">Team</h3>
    <p class="mt-4"><span class="text-4xl font-bold">$99</span><span class="text-sm text-gray-500">/month</span></p>
    <ul class="mt-6 space-y-2 text-sm text-gray-600"><li>Everything in Pro</li><li>Team seats</li></ul>
    <a href="#" class="mt-8 block rounded-md border px-4 py-2 text-center text-sm font-semibold hover:bg-gray-50">Choose Team</a>
  </div>
</section>`);
d('tw-testimonial', 'Testimonial', 'quote', 'figure', `
<figure class="mx-auto max-w-2xl text-center">
  <blockquote class="text-xl font-medium">“This changed how we work. Simple and fast.”</blockquote>
  <figcaption class="mt-6 flex items-center justify-center gap-3 text-sm">
    <img src="" alt="Name" class="h-10 w-10 rounded-full bg-gray-200">
    <span><strong class="font-semibold">Name</strong> · Role, Company</span>
  </figcaption>
</figure>`);
d('tw-testimonials', 'Testimonial Grid', 'quote', 'section', `
<section class="mx-auto grid max-w-6xl gap-6 px-4 py-16 md:grid-cols-3">
  <figure class="rounded-xl border p-6"><blockquote class="text-sm">“A short quote.”</blockquote><figcaption class="mt-4 text-sm font-semibold">Name</figcaption></figure>
  <figure class="rounded-xl border p-6"><blockquote class="text-sm">“A short quote.”</blockquote><figcaption class="mt-4 text-sm font-semibold">Name</figcaption></figure>
  <figure class="rounded-xl border p-6"><blockquote class="text-sm">“A short quote.”</blockquote><figcaption class="mt-4 text-sm font-semibold">Name</figcaption></figure>
</section>`);
d('tw-team', 'Team', 'organization', 'section', `
<section class="mx-auto max-w-6xl px-4 py-16">
  <h2 class="text-3xl font-bold tracking-tight">Our team</h2>
  <ul class="mt-10 grid gap-8 sm:grid-cols-2 md:grid-cols-4">
    <li><img src="" alt="Name" class="aspect-square ${IMG}"><h3 class="mt-4 font-semibold">Name</h3><p class="text-sm text-gray-500">Role</p></li>
    <li><img src="" alt="Name" class="aspect-square ${IMG}"><h3 class="mt-4 font-semibold">Name</h3><p class="text-sm text-gray-500">Role</p></li>
    <li><img src="" alt="Name" class="aspect-square ${IMG}"><h3 class="mt-4 font-semibold">Name</h3><p class="text-sm text-gray-500">Role</p></li>
    <li><img src="" alt="Name" class="aspect-square ${IMG}"><h3 class="mt-4 font-semibold">Name</h3><p class="text-sm text-gray-500">Role</p></li>
  </ul>
</section>`);
d('tw-stats', 'Stats', 'graph', 'dl', `
<dl class="mx-auto grid max-w-4xl gap-8 px-4 py-12 text-center sm:grid-cols-3">
  <div><dt class="text-sm text-gray-500">Customers</dt><dd class="mt-1 text-4xl font-bold">12k</dd></div>
  <div><dt class="text-sm text-gray-500">Countries</dt><dd class="mt-1 text-4xl font-bold">40</dd></div>
  <div><dt class="text-sm text-gray-500">Rating</dt><dd class="mt-1 text-4xl font-bold">4.9</dd></div>
</dl>`);
d('tw-logos', 'Logo Cloud', 'extensions', 'section', `
<section class="px-4 py-12">
  <p class="text-center text-sm font-semibold text-gray-500">Trusted by teams at</p>
  <div class="mt-6 flex flex-wrap items-center justify-center gap-10 opacity-70">
    <img src="" alt="Company" class="h-8 w-28 rounded bg-gray-200">
    <img src="" alt="Company" class="h-8 w-28 rounded bg-gray-200">
    <img src="" alt="Company" class="h-8 w-28 rounded bg-gray-200">
    <img src="" alt="Company" class="h-8 w-28 rounded bg-gray-200">
  </div>
</section>`);
d('tw-faq', 'FAQ', 'question', 'section', `
<section class="mx-auto max-w-3xl px-4 py-16">
  <h2 class="text-3xl font-bold tracking-tight">Questions</h2>
  <div class="mt-8 divide-y border-y">
    <details class="py-4"><summary class="cursor-pointer font-medium">A common question?</summary><p class="mt-2 text-sm text-gray-600">The answer.</p></details>
    <details class="py-4"><summary class="cursor-pointer font-medium">Another question?</summary><p class="mt-2 text-sm text-gray-600">The answer.</p></details>
  </div>
</section>`);
d('tw-newsletter', 'Newsletter', 'mail', 'section', `
<section class="rounded-2xl bg-gray-50 px-6 py-12 text-center">
  <h2 class="text-2xl font-bold">Get the newsletter</h2>
  <p class="mt-2 text-sm text-gray-600">One email a month. No spam.</p>
  <form class="mx-auto mt-6 flex max-w-md gap-2">
    <label for="nl-email" class="sr-only">Email address</label>
    <input id="nl-email" name="email" type="email" required placeholder="you@example.com" class="${INPUT}">
    <button type="submit" class="${PRIMARY}">Subscribe</button>
  </form>
</section>`);
d('tw-blog', 'Blog Cards', 'book', 'section', `
<section class="mx-auto grid max-w-6xl gap-8 px-4 py-16 md:grid-cols-3">
  <article><img src="" alt="Describe the image" class="aspect-video ${IMG}"><p class="mt-4 text-xs text-gray-500">Jan 1, 2026</p><h3 class="mt-1 font-semibold"><a href="#" class="hover:underline">Post title</a></h3><p class="mt-2 text-sm text-gray-600">A short summary.</p></article>
  <article><img src="" alt="Describe the image" class="aspect-video ${IMG}"><p class="mt-4 text-xs text-gray-500">Jan 1, 2026</p><h3 class="mt-1 font-semibold"><a href="#" class="hover:underline">Post title</a></h3><p class="mt-2 text-sm text-gray-600">A short summary.</p></article>
  <article><img src="" alt="Describe the image" class="aspect-video ${IMG}"><p class="mt-4 text-xs text-gray-500">Jan 1, 2026</p><h3 class="mt-1 font-semibold"><a href="#" class="hover:underline">Post title</a></h3><p class="mt-2 text-sm text-gray-600">A short summary.</p></article>
</section>`);
d('tw-404', '404 Page', 'warning', 'section', `
<section class="px-6 py-24 text-center">
  <p class="text-sm font-semibold text-indigo-600">404</p>
  <h1 class="mt-2 text-4xl font-bold tracking-tight">Page not found</h1>
  <p class="mt-4 text-gray-600">Sorry, we couldn't find that page.</p>
  <a href="index.html" class="mt-8 ${PRIMARY}">Go home</a>
</section>`);

// Shop ---------------------------------------------------------------------------------
d('tw-product-card', 'Product Card', 'package', 'article', `
<article class="group">
  <img src="" alt="Product photo" class="aspect-square ${IMG} group-hover:opacity-90">
  <h3 class="mt-4 text-sm text-gray-700"><a href="#">Product name</a></h3>
  <p class="mt-1 text-lg font-semibold">$18.00</p>
</article>`);
d('tw-product-grid', 'Product Grid', 'package', 'section', `
<section class="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-12 md:grid-cols-4">
  <article><img src="" alt="Product photo" class="aspect-square ${IMG}"><h3 class="mt-3 text-sm">Product</h3><p class="font-semibold">$18.00</p></article>
  <article><img src="" alt="Product photo" class="aspect-square ${IMG}"><h3 class="mt-3 text-sm">Product</h3><p class="font-semibold">$18.00</p></article>
  <article><img src="" alt="Product photo" class="aspect-square ${IMG}"><h3 class="mt-3 text-sm">Product</h3><p class="font-semibold">$18.00</p></article>
  <article><img src="" alt="Product photo" class="aspect-square ${IMG}"><h3 class="mt-3 text-sm">Product</h3><p class="font-semibold">$18.00</p></article>
</section>`);
d('tw-product-detail', 'Product Details', 'package', 'section', `
<section class="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-2">
  <img src="" alt="Product photo" class="aspect-square ${IMG}">
  <div>
    <h1 class="text-3xl font-bold">Product name</h1>
    <p class="mt-2 text-2xl">$18.00</p>
    <p class="mt-4 text-gray-600">A short description of the product.</p>
    <form class="mt-6 flex items-end gap-3">
      <div>
        <label for="qty" class="${LABEL}">Quantity</label>
        <input id="qty" name="qty" type="number" min="1" value="1" class="mt-1 w-20 rounded-md border border-gray-300 px-3 py-2 text-sm">
      </div>
      <button type="submit" class="${PRIMARY}">Add to cart</button>
    </form>
  </div>
</section>`);
d('tw-rating', 'Star Rating', 'star-full', 'p', '<p class="flex items-center gap-1 text-yellow-400" aria-label="4 out of 5 stars">★★★★<span class="text-gray-300">★</span><span class="ml-2 text-sm text-gray-500">(24 reviews)</span></p>');
d('tw-cart', 'Cart Summary', 'checklist', 'section', `
<section class="max-w-sm rounded-xl bg-gray-50 p-6" aria-label="Order summary">
  <h2 class="font-semibold">Order summary</h2>
  <dl class="mt-4 space-y-2 text-sm">
    <div class="flex justify-between"><dt>Subtotal</dt><dd>$36.00</dd></div>
    <div class="flex justify-between"><dt>Shipping</dt><dd>$5.00</dd></div>
    <div class="flex justify-between border-t pt-2 font-semibold"><dt>Total</dt><dd>$41.00</dd></div>
  </dl>
  <a href="#" class="mt-6 block rounded-md bg-indigo-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-indigo-500">Checkout</a>
</section>`);

export const TW_GROUPS: { name: string; items: string[] }[] = [
  { name: 'Layout', items: ['tw-container', 'tw-section', 'tw-flex', 'tw-stack', 'tw-grid-2', 'tw-grid', 'tw-grid-4', 'tw-sidebar-layout', 'tw-center', 'tw-divider', 'tw-divider-label', 'tw-ratio'] },
  { name: 'Navigation', items: ['tw-navbar', 'tw-navbar-cta', 'tw-breadcrumb', 'tw-pagination', 'tw-tabs', 'tw-pills', 'tw-sidebar-nav', 'tw-skip-link', 'tw-footer', 'tw-footer-cols'] },
  { name: 'Content', items: ['tw-card', 'tw-card-image', 'tw-media', 'tw-list-group', 'tw-dl', 'tw-table', 'tw-blockquote', 'tw-figure', 'tw-avatar', 'tw-avatar-group', 'tw-kbd', 'tw-code'] },
  { name: 'Buttons', items: ['tw-button', 'tw-button-secondary', 'tw-button-outline', 'tw-button-link', 'tw-button-group', 'tw-button-icon', 'tw-close', 'tw-badge', 'tw-badge-status'] },
  { name: 'Forms', items: ['tw-input', 'tw-textarea', 'tw-select', 'tw-checkbox', 'tw-radio-group', 'tw-switch', 'tw-range', 'tw-file', 'tw-input-group', 'tw-floating', 'tw-input-error', 'tw-search', 'tw-form', 'tw-contact-form'] },
  { name: 'Feedback', items: ['tw-alert', 'tw-alert-info', 'tw-alert-success', 'tw-alert-error', 'tw-toast', 'tw-progress', 'tw-spinner', 'tw-skeleton', 'tw-empty', 'tw-tooltip'] },
  { name: 'Interactive', items: ['tw-accordion', 'tw-collapse', 'tw-dropdown', 'tw-modal', 'tw-offcanvas', 'tw-carousel'] },
  { name: 'Sections', items: ['tw-hero', 'tw-hero-split', 'tw-features', 'tw-cta', 'tw-pricing', 'tw-testimonial', 'tw-testimonials', 'tw-team', 'tw-stats', 'tw-logos', 'tw-faq', 'tw-newsletter', 'tw-blog', 'tw-404'] },
  { name: 'Shop', items: ['tw-product-card', 'tw-product-grid', 'tw-product-detail', 'tw-rating', 'tw-cart'] },
];
