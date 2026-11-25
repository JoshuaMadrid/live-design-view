// Applies the Live Design UI theme (Modern / Canvas / Graphite / VS Code) to this webview.
(function () {
  window.addEventListener('message', (ev) => {
    if (ev.data && ev.data.type === 'ldTheme') document.body.setAttribute('data-ld-theme', ev.data.theme);
  });
})();
