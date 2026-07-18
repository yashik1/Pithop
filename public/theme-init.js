// Apply the stored theme + language direction before first paint.
// External file (not inline) so the Content-Security-Policy can stay
// `script-src 'self'` with no unsafe-inline.
try {
  var m = localStorage.getItem('sq-theme');
  var dark = m === 'dark' || ((m === null || m === 'auto') && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  var lang = localStorage.getItem('sq-lang') || (navigator.language || 'en').slice(0, 2);
  var rtl = ['ar', 'he', 'fa', 'ur'];
  if (rtl.indexOf(lang) !== -1) document.documentElement.dir = 'rtl';
} catch (e) {}
