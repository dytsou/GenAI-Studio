import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initI18n, normalizeLanguage } from './i18n/i18n'

function getInitialLanguageFromSettings(): string | null {
  try {
    const raw = localStorage.getItem('chatgpt-settings-storage');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { language?: unknown } };
    const value = parsed.state?.language;
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

void initI18n(normalizeLanguage(getInitialLanguageFromSettings()))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
