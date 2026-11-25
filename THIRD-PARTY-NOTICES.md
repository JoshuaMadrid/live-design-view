# Third-party notices

Live Design View includes or bundles the following open-source software. Each remains under its own license.

| Package | Version | License | Where it's used |
|---|---|---|---|
| [axe-core](https://github.com/dequelabs/axe-core) | 4.14.0 | MPL-2.0 | `media/vendor/axe.min.js`, shipped unmodified; runs the accessibility audit. Source: https://github.com/dequelabs/axe-core/tree/v4.14.0 |
| [@vscode/codicons](https://github.com/microsoft/vscode-codicons) | 0.0.46 | CC-BY-4.0 (icons), MIT (code) | `media/codicons/` icon font |
| [parse5](https://github.com/inikulin/parse5) | 8.1.1 | MIT | HTML parsing (bundled) |
| [entities](https://github.com/fb55/entities) | 9.0.0 | BSD-2-Clause | used by parse5 (bundled) |
| [postcss](https://github.com/postcss/postcss) | 8.5.33 | MIT | CSS parsing (bundled) |
| [nanoid](https://github.com/ai/nanoid) | 3.3.20 | MIT | used by postcss (bundled) |
| [picocolors](https://github.com/alexeyraspopov/picocolors) | 1.1.1 | ISC | used by postcss (bundled) |
| [source-map-js](https://github.com/7rulnik/source-map-js) | 1.2.4 | BSD-3-Clause | used by postcss (bundled) |

Snippets reference these libraries by URL (they are loaded from their CDNs into your page, not shipped with the extension): Tailwind CSS (MIT), React and ReactDOM (MIT), Babel standalone (MIT), jQuery and jQuery UI (MIT). The "Run Lighthouse Report" command runs Google Lighthouse (Apache-2.0) through `npx`.

## Trademarks

Live Design View is an independent project. It is not affiliated with, endorsed by, or sponsored by the owners of any product mentioned in this extension or its documentation. Tailwind CSS, React, jQuery, jQuery UI, shadcn/ui, axe, Lighthouse, Chrome, and Visual Studio Code are trademarks or names of their respective owners and are used only to identify compatibility.
