/* global jQuery */
(function ($) {
  'use strict';
  // Marker read by the extension's integration tests to confirm jQuery loaded and ran.
  window.testSiteReady = 'jquery-' + $.fn.jquery;

  $(function () {
    $('#year').text(new Date().getFullYear());
    $('#cta').on('click', function () {
      $('#details').toggleClass('is-open');
    });
  });
})(jQuery);
