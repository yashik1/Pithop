// OAuth landing page script for the popup sign-in flow: hand the auth
// response (tokens or error, carried in the URL hash/query) back to the app
// window that opened this popup, then close. Target '*' because the opener
// may be on a different origin (www vs bare domain, preview vs prod); it
// only trusts a message whose source is this popup window.
// External file (not inline) so the Content-Security-Policy can stay
// `script-src 'self'` with no unsafe-inline.
try {
  if (window.opener) {
    window.opener.postMessage({ type: 'pithop-auth', hash: location.hash, search: location.search }, '*');
  }
} catch (e) {}
window.close();
