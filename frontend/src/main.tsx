import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './fontImports'
import './index.css'
import App from './App.tsx'
import { FeedbackProvider } from './components/FeedbackProvider.tsx'
import { startObservability } from './services/observability.ts'

const stopObservability = startObservability()
if (import.meta.hot) import.meta.hot.dispose(stopObservability)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FeedbackProvider>
      <App />
    </FeedbackProvider>
  </StrictMode>,
)

// Register service worker for PWA support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('SW registration failed:', err);
    });
  });
}
