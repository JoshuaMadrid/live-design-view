// jQuery UI widgets. Each snippet is the
// widget markup plus a small init script. "{{n}}" becomes the next free number on the page
// (Accordion1, Accordion2 …) so several widgets of one kind can live on a page.
// The init waits for DOMContentLoaded, so it works whether jQuery loads in <head> or at the end of <body>.

export interface JqDef {
  key: string;
  name: string;
  icon: string;
  tag: string;
  lines: string[];
}

const init = (id: string, call: string) => [
  '<script>',
  "\twindow.addEventListener('DOMContentLoaded', function () {",
  `\t\tjQuery('#${id}').${call};`,
  '\t});',
  '</script>',
];

const defs: JqDef[] = [];
const d = (key: string, name: string, icon: string, tag: string, markup: string[], id: string, call: string) =>
  defs.push({ key, name, icon, tag, lines: [...markup, ...init(id, call)] });

d('jq-accordion', 'Accordion', 'fold', 'div', [
  '<div id="Accordion{{n}}">',
  '\t<h3>Section 1</h3>',
  '\t<div>',
  '\t\t<p>Content 1</p>',
  '\t</div>',
  '\t<h3>Section 2</h3>',
  '\t<div>',
  '\t\t<p>Content 2</p>',
  '\t</div>',
  '\t<h3>Section 3</h3>',
  '\t<div>',
  '\t\t<p>Content 3</p>',
  '\t</div>',
  '</div>',
], 'Accordion{{n}}', 'accordion({ heightStyle: "content" })');
d('jq-tabs', 'Tabs', 'versions', 'div', [
  '<div id="Tabs{{n}}">',
  '\t<ul>',
  '\t\t<li><a href="#tabs-{{n}}-1">Tab 1</a></li>',
  '\t\t<li><a href="#tabs-{{n}}-2">Tab 2</a></li>',
  '\t\t<li><a href="#tabs-{{n}}-3">Tab 3</a></li>',
  '\t</ul>',
  '\t<div id="tabs-{{n}}-1">',
  '\t\t<p>Content 1</p>',
  '\t</div>',
  '\t<div id="tabs-{{n}}-2">',
  '\t\t<p>Content 2</p>',
  '\t</div>',
  '\t<div id="tabs-{{n}}-3">',
  '\t\t<p>Content 3</p>',
  '\t</div>',
  '</div>',
], 'Tabs{{n}}', 'tabs()');
d('jq-datepicker', 'Datepicker', 'calendar', 'input', ['<input type="text" id="Datepicker{{n}}" placeholder="Pick a date">'], 'Datepicker{{n}}', 'datepicker()');
d('jq-progressbar', 'Progressbar', 'loading', 'div', ['<div id="Progressbar{{n}}"></div>'], 'Progressbar{{n}}', 'progressbar({ value: 50 })');
d('jq-dialog', 'Dialog', 'window', 'div', [
  '<div id="Dialog{{n}}" title="Dialog">',
  '\t<p>Dialog content</p>',
  '</div>',
], 'Dialog{{n}}', 'dialog({ autoOpen: true })');
d('jq-autocomplete', 'Autocomplete', 'search', 'input', ['<input type="text" id="Autocomplete{{n}}" placeholder="Type a language">'], 'Autocomplete{{n}}',
  'autocomplete({ source: ["ActionScript", "CSS", "HTML", "JavaScript", "jQuery", "PHP", "Python", "Ruby"] })');
d('jq-slider', 'Slider', 'settings', 'div', ['<div id="Slider{{n}}"></div>'], 'Slider{{n}}', 'slider({ value: 50 })');
d('jq-button', 'Button', 'record-small', 'button', ['<button type="button" id="Button{{n}}">Button</button>'], 'Button{{n}}', 'button()');
d('jq-buttonset', 'Buttonset', 'layout-panel-left', 'div', [
  '<div id="Buttonset{{n}}">',
  '\t<input type="radio" name="Buttonset{{n}}" id="Buttonset{{n}}-1" checked><label for="Buttonset{{n}}-1">Choice 1</label>',
  '\t<input type="radio" name="Buttonset{{n}}" id="Buttonset{{n}}-2"><label for="Buttonset{{n}}-2">Choice 2</label>',
  '\t<input type="radio" name="Buttonset{{n}}" id="Buttonset{{n}}-3"><label for="Buttonset{{n}}-3">Choice 3</label>',
  '</div>',
], 'Buttonset{{n}}', 'controlgroup()');
d('jq-checkbox-buttons', 'Checkbox Buttons', 'checklist', 'div', [
  '<div id="CheckboxButtons{{n}}">',
  '\t<label for="CheckboxButtons{{n}}-1">Option 1</label><input type="checkbox" id="CheckboxButtons{{n}}-1">',
  '\t<label for="CheckboxButtons{{n}}-2">Option 2</label><input type="checkbox" id="CheckboxButtons{{n}}-2">',
  '\t<label for="CheckboxButtons{{n}}-3">Option 3</label><input type="checkbox" id="CheckboxButtons{{n}}-3">',
  '</div>',
], 'CheckboxButtons{{n}} input', 'checkboxradio()');
d('jq-radio-buttons', 'Radio Buttons', 'circle-large-filled', 'div', [
  '<div id="RadioButtons{{n}}">',
  '\t<label for="RadioButtons{{n}}-1">Option 1</label><input type="radio" name="RadioButtons{{n}}" id="RadioButtons{{n}}-1" checked>',
  '\t<label for="RadioButtons{{n}}-2">Option 2</label><input type="radio" name="RadioButtons{{n}}" id="RadioButtons{{n}}-2">',
  '\t<label for="RadioButtons{{n}}-3">Option 3</label><input type="radio" name="RadioButtons{{n}}" id="RadioButtons{{n}}-3">',
  '</div>',
], 'RadioButtons{{n}} input', 'checkboxradio()');

export const JQUERY_UI_SNIPPETS = defs;
export const JQUERY_UI_ITEMS = ['jq-accordion', 'jq-tabs', 'jq-dialog', '-', 'jq-datepicker', 'jq-autocomplete', 'jq-slider', 'jq-progressbar', '-', 'jq-button', 'jq-buttonset', 'jq-checkbox-buttons', 'jq-radio-buttons'];

export const JQUERY_URL = 'https://code.jquery.com/jquery-3.7.1.min.js';
export const JQUERY_UI_JS = 'https://code.jquery.com/ui/1.14.1/jquery-ui.min.js';
export const JQUERY_UI_CSS = 'https://code.jquery.com/ui/1.14.1/themes/base/jquery-ui.css';
