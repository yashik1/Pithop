import React from 'react';
import ReactDOM from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import './polish.css';
import './trip-polish.css';
import './mobile-trip.css';
import App from './App';
import { initTheme } from './lib/theme';
import { initI18n } from './lib/i18n';
import { handleAuthPopupHandoff } from './lib/auth';

// If this is the Google sign-in popup landing back on the app, hand the result
// to the opener and close instead of booting the whole app inside the popup.
if (!handleAuthPopupHandoff()) {
  initTheme();
  initI18n();

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
      {/* Vercel Web Analytics: cookieless, anonymous visit/referrer counts.
          No-ops in local/dev and on non-Vercel hosts. */}
      <Analytics />
    </React.StrictMode>,
  );
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
