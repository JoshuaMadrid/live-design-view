import { SHADCN_GROUPS, SHADCN_SNIPPETS } from './shadcn';
import { TW_GROUPS, TW_SNIPPETS } from './tailwind';
import { JQUERY_UI_CSS, JQUERY_UI_ITEMS, JQUERY_UI_JS, JQUERY_UI_SNIPPETS, JQUERY_URL } from './jqueryui';
/**
 * Starter snippets for the Elements panel.
 * Lines are joined with "\n"; a leading "\t" means "one indent unit deeper"
 * and is converted to the document's own indentation when inserted.
 */
export interface Snippet {
  /** key used in messages ("p", "ul", "input-email", …) */
  key: string;
  /** element tag the snippet creates */
  tag: string;
  /** label shown in the Elements panel */
  name: string;
  /** icon id understood by the Elements panel (codicon name, or "tag:<text>") */
  icon: string;
  lines: string[];
  /** Page-level assets the snippet needs; added to <head> once (e.g. the Tailwind CDN script). */
  requires?: AssetId[];
  /** Snippet has several top-level elements, so it can't be used to Wrap. */
  noWrap?: boolean;
  /**
   * How it's placed: 'head' goes straight into <head> (meta, link…); 'inline' goes into the
   * selected element's text (characters, date). Default: Before/After/Wrap/Nest popover.
   */
  place?: 'head' | 'inline';
  /** Where the snippet came from: built in, or a user snippet file. */
  source?: 'builtin' | 'user';
}

export type AssetId = 'tailwind' | 'react' | 'jqueryui';

/** <head> assets, and how to detect that a page already has them. */
export const HEAD_ASSETS: Record<AssetId, { detect: RegExp; lines: string[] }> = {
  tailwind: {
    detect: /cdn\.tailwindcss\.com|tailwind(?:\.min)?\.css|\/tailwind[^"']*\.css/i,
    lines: ['<script src="https://cdn.tailwindcss.com/3.4.17"></script>'],
  },
  // Placement is special-cased in ensureHeadAssets: jQuery UI goes right after the page's own jQuery.
  jqueryui: {
    detect: /jquery-ui(?:\.min)?\.js/i,
    lines: [`<script src="${JQUERY_URL}"></script>`, `<link rel="stylesheet" href="${JQUERY_UI_CSS}">`, `<script src="${JQUERY_UI_JS}"></script>`],
  },
  react: {
    detect: /react-dom(?:@[^/]+)?\/umd|react-dom\.(?:production|development)/i,
    lines: [
      '<script crossorigin src="https://unpkg.com/react@18.3.1/umd/react.development.js"></script>',
      '<script crossorigin src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js"></script>',
      '<script src="https://unpkg.com/@babel/standalone@7.26.4/babel.min.js"></script>',
    ],
  },
};

const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';

const defs: Snippet[] = [];
const s = (
  key: string,
  name: string,
  icon: string,
  lines: string[] | string,
  tag = key.split('-')[0],
  extra: Partial<Snippet> = {},
) => {
  defs.push({ key, tag, name, icon, lines: Array.isArray(lines) ? lines : [lines], source: 'builtin', ...extra });
};
const tw = (key: string, name: string, icon: string, lines: string[] | string, tag: string, extra: Partial<Snippet> = {}) =>
  s(key, name, icon, lines, tag, { requires: ['tailwind'], ...extra });

// Common
s('div', 'Div', 'tag:div', '<div></div>');
s('img', 'Image', 'file-media', '<img src="" alt="">');
s('p', 'Paragraph', 'tag:P', `<p>${LOREM}</p>`);
for (let i = 1; i <= 6; i++) s(`h${i}`, `Heading : H${i}`, `tag:H${i}`, `<h${i}>Heading ${i}</h${i}>`);
s('table', 'Table', 'table', [
  '<table>',
  '\t<thead>',
  '\t\t<tr>',
  '\t\t\t<th>Heading</th>',
  '\t\t\t<th>Heading</th>',
  '\t\t</tr>',
  '\t</thead>',
  '\t<tbody>',
  '\t\t<tr>',
  '\t\t\t<td>Cell</td>',
  '\t\t\t<td>Cell</td>',
  '\t\t</tr>',
  '\t</tbody>',
  '</table>',
]);
s('figure', 'Figure', 'device-camera', ['<figure>', '\t<img src="" alt="">', '\t<figcaption>Caption</figcaption>', '</figure>']);
s('ul', 'Unordered List', 'list-unordered', ['<ul>', '\t<li>List item</li>', '\t<li>List item</li>', '</ul>']);
s('ol', 'Ordered List', 'list-ordered', ['<ol>', '\t<li>List item</li>', '\t<li>List item</li>', '</ol>']);
s('li', 'List Item', 'tag:li', '<li>List item</li>');
s('a', 'Hyperlink', 'link', '<a href="#">Link text</a>');
// Structure
s('header', 'Header', 'layout-panel-off', ['<header>', '\t<h1>Site title</h1>', '</header>']);
s('nav', 'Navigation', 'compass', ['<nav>', '\t<a href="#">Home</a>', '\t<a href="#">About</a>', '</nav>']);
s('main', 'Main', 'layout', '<main></main>');
s('aside', 'Aside', 'layout-sidebar-right-off', ['<aside>', `\t<p>${LOREM}</p>`, '</aside>']);
s('article', 'Article', 'note', ['<article>', '\t<h2>Article title</h2>', `\t<p>${LOREM}</p>`, '</article>']);
s('section', 'Section', 'symbol-structure', ['<section>', '\t<h2>Section heading</h2>', '</section>']);
s('footer', 'Footer', 'layout-panel', ['<footer>', '\t<p>&copy; 2026</p>', '</footer>']);
// Text
s('span', 'Span', 'tag:span', '<span>Text</span>');
s('strong', 'Strong', 'bold', '<strong>Bold text</strong>');
s('em', 'Emphasis', 'italic', '<em>Emphasized text</em>');
s('blockquote', 'Blockquote', 'quote', ['<blockquote>', `\t<p>${LOREM}</p>`, '</blockquote>']);
s('hr', 'Horizontal Rule', 'dash', '<hr>');
// Media
s('video', 'Video', 'device-camera-video', '<video src="" controls></video>');
s('iframe', 'IFrame', 'browser', '<iframe src="" title="" width="560" height="315"></iframe>');
// Form
s('form', 'Form', 'checklist', ['<form action="#" method="post">', '\t<button type="submit">Submit</button>', '</form>']);
s('input', 'Text', 'symbol-string', '<input type="text" name="" placeholder="">');
s('input-email', 'Email', 'mail', '<input type="email" name="" placeholder="">');
s('input-password', 'Password', 'lock', '<input type="password" name="">');
s('textarea', 'Text Area', 'note', '<textarea name="" rows="4"></textarea>');
s('select', 'Select', 'chevron-down', ['<select name="">', '\t<option value="1">Option 1</option>', '\t<option value="2">Option 2</option>', '</select>']);
s('input-checkbox', 'Checkbox', 'pass', '<input type="checkbox" name="" value="">');
s('input-radio', 'Radio Button', 'circle-large-outline', '<input type="radio" name="" value="">');
s('label', 'Label', 'tag', '<label for="">Label</label>');
s('button', 'Button', 'record-small', '<button type="button">Button</button>');
s('button-submit', 'Submit Button', 'check', '<button type="submit">Submit</button>');

// More HTML
s('script', 'Script', 'file-code', ['<script>', '\t', '</script>'], 'script', { noWrap: true });
s('comment', 'Comment', 'comment', '<!-- Comment -->', 'div', { noWrap: true });
s('a-email', 'Email Link', 'mail', '<a href="mailto:name@example.com">name@example.com</a>', 'a');
s('audio', 'HTML5 Audio', 'unmute', '<audio src="" controls></audio>', 'audio');
s('canvas', 'Canvas', 'symbol-color', '<canvas id="canvas" width="300" height="150"></canvas>', 'canvas');
s('picture', 'Picture', 'file-media', ['<picture>', '\t<source srcset="" media="(min-width: 800px)">', '\t<img src="" alt="">', '</picture>'], 'picture');
s('br', 'Line Break', 'newline', '<br>', 'br', { place: 'inline' });
s('nbsp', 'Non-Breaking Space', 'whitespace', '&nbsp;', 'span', { place: 'inline', noWrap: true });
s('date', 'Date', 'calendar', '', 'span', { place: 'inline', noWrap: true });
// Head
const head = (key: string, name: string, icon: string, line: string, tag = 'meta') => s(key, name, icon, line, tag, { place: 'head', noWrap: true });
head('meta', 'Meta', 'tag', '<meta name="" content="">');
head('meta-keywords', 'Keywords', 'key', '<meta name="keywords" content="">');
head('meta-description', 'Description', 'comment-discussion', '<meta name="description" content="">');
head('meta-viewport', 'Viewport', 'device-desktop', '<meta name="viewport" content="width=device-width, initial-scale=1.0">');
head('base', 'Base', 'home', '<base href="">', 'base');
head('link', 'Link (stylesheet)', 'link-external', '<link rel="stylesheet" href="">', 'link');
// Characters
const ch = (key: string, name: string, entity: string) => s(key, name, 'symbol-key', entity, 'span', { place: 'inline', noWrap: true });
ch('char-copy', 'Copyright ©', '&copy;');
ch('char-reg', 'Registered ®', '&reg;');
ch('char-trade', 'Trademark ™', '&trade;');
ch('char-euro', 'Euro €', '&euro;');
ch('char-pound', 'Pound £', '&pound;');
ch('char-yen', 'Yen ¥', '&yen;');
ch('char-mdash', 'Em Dash —', '&mdash;');
ch('char-ndash', 'En Dash –', '&ndash;');
ch('char-hellip', 'Ellipsis …', '&hellip;');
ch('char-ldquo', 'Left Quote “', '&ldquo;');
ch('char-rdquo', 'Right Quote ”', '&rdquo;');
ch('char-middot', 'Middle Dot ·', '&middot;');
ch('char-times', 'Multiply ×', '&times;');
// More form controls (form controls list)
const inp = (type: string, name: string, icon: string, extra = '') => s(`input-${type}`, name, icon, `<input type="${type}" name=""${extra}>`, 'input');
inp('url', 'Url', 'globe', ' placeholder="https://"');
inp('tel', 'Tel', 'device-mobile', ' placeholder=""');
inp('search', 'Search', 'search', ' placeholder="Search"');
inp('number', 'Number', 'symbol-number', ' min="0" step="1"');
inp('range', 'Range', 'settings', ' min="0" max="100"');
inp('color', 'Color', 'symbol-color', ' value="#000000"');
inp('month', 'Month', 'calendar');
inp('week', 'Week', 'calendar');
inp('date', 'Date', 'calendar');
inp('time', 'Time', 'clock');
inp('datetime-local', 'Date Time Local', 'history');
inp('file', 'File', 'file');
inp('hidden', 'Hidden', 'eye-closed', ' value=""');
s('input-image', 'Image Button', 'file-media', '<input type="image" src="" alt="Submit">', 'input');
s('button-reset', 'Reset Button', 'discard', '<button type="reset">Reset</button>', 'button');
s('radio-group', 'Radio Group', 'list-selection', [
  '<fieldset>',
  '\t<legend>Choose one</legend>',
  '\t<label><input type="radio" name="group1" value="1"> Option 1</label>',
  '\t<label><input type="radio" name="group1" value="2"> Option 2</label>',
  '</fieldset>',
], 'fieldset');
s('checkbox-group', 'Checkbox Group', 'checklist', [
  '<fieldset>',
  '\t<legend>Choose any</legend>',
  '\t<label><input type="checkbox" name="group2" value="1"> Option 1</label>',
  '\t<label><input type="checkbox" name="group2" value="2"> Option 2</label>',
  '</fieldset>',
], 'fieldset');
s('fieldset', 'Fieldset', 'symbol-namespace', ['<fieldset>', '\t<legend>Legend</legend>', '</fieldset>']);
s('datalist', 'Datalist', 'list-flat', ['<datalist id="options">', '\t<option value="Option 1">', '\t<option value="Option 2">', '</datalist>']);

// Tailwind (utility classes; the Tailwind CDN script is added to <head> on first use; list in tailwind.ts)
for (const t of TW_SNIPPETS) tw(t.key, t.name, t.icon, t.lines, t.tag);

// shadcn/ui look (static HTML + Tailwind; full list in shadcn.ts)
for (const sc of SHADCN_SNIPPETS) tw(sc.key, sc.name, sc.icon, sc.lines, sc.tag);

// jQuery UI widgets (markup + init script; two top-level elements, so they can't wrap)
for (const j of JQUERY_UI_SNIPPETS) s(j.key, j.name, j.icon, j.lines, j.tag, { requires: ['jqueryui'], noWrap: true });

// React (UMD + Babel standalone from a CDN; components live in <script type="text/babel">)
const r = (key: string, name: string, icon: string, lines: string[]) =>
  s(key, name, icon, lines, 'div', { requires: ['react'], noWrap: true });
r('react-app', 'React App Root', 'symbol-namespace', [
  '<div id="root"></div>',
  '<script type="text/babel">',
  '\tfunction App() {',
  '\t\treturn <h1>Hello from React</h1>;',
  '\t}',
  "\tReactDOM.createRoot(document.getElementById('root')).render(<App />);",
  '</script>',
]);
r('react-counter', 'Counter (useState)', 'symbol-event', [
  '<div id="counter"></div>',
  '<script type="text/babel">',
  '\tfunction Counter() {',
  '\t\tconst [count, setCount] = React.useState(0);',
  '\t\treturn <button onClick={() => setCount(count + 1)}>Clicked {count} times</button>;',
  '\t}',
  "\tReactDOM.createRoot(document.getElementById('counter')).render(<Counter />);",
  '</script>',
]);
r('react-list', 'List from Data', 'list-unordered', [
  '<div id="list"></div>',
  '<script type="text/babel">',
  "\tconst items = ['Alpha', 'Beta', 'Gamma'];",
  '\tfunction List() {',
  '\t\treturn <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>;',
  '\t}',
  "\tReactDOM.createRoot(document.getElementById('list')).render(<List />);",
  '</script>',
]);

export const SNIPPETS: Record<string, Snippet> = Object.fromEntries(defs.map((d) => [d.key, d]));

export interface InsertCategory {
  name: string;
  /** Sub-tabs (shown under the category tabs); `items` is then the first group's items. */
  groups?: { name: string; items: string[] }[];
  /** Show text labels next to the icons (for categories with many look-alike icons). */
  labels?: boolean;
  /** snippet keys; "-" draws a divider; "heading" is the H1–H6 row with a level picker */
  items: string[];
}

export const INSERT_CATEGORIES: InsertCategory[] = [
  {
    name: 'HTML',
    items: [
      'div', 'img', 'p', 'heading', 'table', 'figure', 'ul', 'ol', 'li', 'a', '-',
      'header', 'nav', 'main', 'aside', 'article', 'section', 'footer', '-',
      'meta', 'meta-keywords', 'meta-description', 'meta-viewport', 'base', 'link', 'script', 'a-email', '-',
      'video', 'audio', 'canvas', 'picture', 'iframe', '-',
      'hr', 'date', 'nbsp', 'br', 'comment',
    ],
  },
  {
    name: 'Form',
    items: [
      'form', 'input', 'input-email', 'input-password', 'input-url', 'input-tel', 'input-search', 'input-number', 'input-range',
      'input-color', '-', 'input-month', 'input-week', 'input-date', 'input-time', 'input-datetime-local', '-',
      'textarea', 'button', 'button-submit', 'button-reset', 'input-file', 'input-image', 'input-hidden', '-',
      'select', 'datalist', 'input-radio', 'radio-group', 'input-checkbox', 'checkbox-group', 'fieldset', 'label',
    ],
  },
  {
    name: 'Tailwind',
    items: TW_GROUPS[0].items,
    groups: TW_GROUPS,
    labels: true,
  },
  {
    name: 'shadcn/ui',
    items: SHADCN_GROUPS[0].items,
    groups: SHADCN_GROUPS,
    labels: true,
  },
  { name: 'jQuery UI', items: JQUERY_UI_ITEMS, labels: true },
  { name: 'React', items: ['react-app', 'react-counter', 'react-list'] },
  { name: 'Text', items: ['heading', 'p', 'span', 'strong', 'em', 'a', 'blockquote', 'hr', 'br', '-', 'ul', 'ol', 'li'] },
  {
    name: 'Characters',
    items: ['char-copy', 'char-reg', 'char-trade', '-', 'char-euro', 'char-pound', 'char-yen', '-', 'char-mdash', 'char-ndash', 'char-hellip', 'char-ldquo', 'char-rdquo', 'char-middot', 'char-times', 'nbsp'],
  },
];

/** Adds or replaces a snippet at runtime (user snippets from the Snippets panel). */
export function registerSnippet(sn: Snippet) {
  SNIPPETS[sn.key] = sn;
}

export function unregisterSnippets(prefix: string) {
  for (const k of Object.keys(SNIPPETS)) if (k.startsWith(prefix)) delete SNIPPETS[k];
}
