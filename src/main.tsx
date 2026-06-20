import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './lawguild-premium.css'
import App from './App.tsx'

// Check if the current window is an MSAL popup window or redirect callback.
// IMPORTANT: Only treat as MSAL popup if window.opener exists (actual popup window),
// OR if the URL contains MSAL-specific query params with a client_info or session_state field.
// Do NOT rely solely on 'code=' or 'state=' in hash/search as these can appear in normal routing.
const isMsalPopup = typeof window !== 'undefined' && (
  // Case 1: A named popup window opened by MSAL
  (window.opener != null && window.name && (window.name.includes('msal') || window.name.includes('ms-id'))) ||
  // Case 2: Redirect-mode auth callback — only trigger if BOTH code AND session_state are present (MSAL-specific)
  (window.location.search.includes('code=') && window.location.search.includes('session_state=')) ||
  // Case 3: MSAL error redirect
  (window.location.search.includes('error=') && window.location.search.includes('error_description='))
);

if (isMsalPopup) {
  console.log('MSAL Popup window detected. Bypassing React app mount to prevent nested initialization.');
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
