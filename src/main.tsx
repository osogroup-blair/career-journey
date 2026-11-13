import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {useStore} from './store';
import {isServerConfigured} from './lib/auth';
import AuthGate from './components/AuthGate';

async function bootstrap() {
  const root = createRoot(document.getElementById('root')!);

  if (isServerConfigured) {
    // Auth resolves first; AuthGate swaps in the HttpDataStore and hydrates
    // once signed in, so nothing below it renders against stale local state.
    root.render(
      <StrictMode>
        <AuthGate>
          <App />
        </AuthGate>
      </StrictMode>,
    );
    return;
  }

  // Legacy local adapter fallback: behaves exactly as before.
  await useStore.getState().hydrate();
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

bootstrap();
