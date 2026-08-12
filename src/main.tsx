import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {useStore} from './store';
import {isFirebaseConfigured} from './lib/firebase';
import AuthGate from './components/AuthGate';

async function bootstrap() {
  const root = createRoot(document.getElementById('root')!);

  if (isFirebaseConfigured) {
    // Auth resolves first; AuthGate swaps in the FirestoreDataStore and hydrates
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

  // Local mode (default until Firebase env vars are set): behaves exactly as before.
  await useStore.getState().hydrate();
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

bootstrap();
