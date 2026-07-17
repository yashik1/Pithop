import React from 'react';
import ReactDOM from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import App from './App';
import { initTheme } from './lib/theme';
import { initI18n } from './lib/i18n';

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

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
