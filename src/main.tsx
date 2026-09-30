import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import './styles/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createIdbStore } from './save/idbStore';
import { Root } from './ui/root/Root';
import { preventZoomGestures } from './ui/preventZoom';

preventZoomGestures();

if (import.meta.env.PROD) {
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Missing #root element');

// Game sessions start from a tap in the profile picker (never from an effect), so
// StrictMode's double effects can't start two games.
createRoot(rootEl).render(
  <StrictMode>
    <Root store={createIdbStore()} />
  </StrictMode>,
);
