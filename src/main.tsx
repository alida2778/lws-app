import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './lawguild-premium.css'
import App from './App.tsx'

// Block React from mounting inside an MSAL popup window.
// We only check window.opener — if this window was opened by another window (popup),
// we skip mounting. MSAL's own code will handle the auth response and close the popup.
// We do NOT block based on URL params (code=, state=) because in Redirect Mode, 
// those params appear in the MAIN window and must be processed by the app.
const isInsidePopup = typeof window !== 'undefined' && window.opener != null;

if (isInsidePopup) {
  // This is a popup window opened by MSAL. Don't mount React.
  // MSAL's handleRedirectPromise will pick up the auth response and postMessage it back.
  console.log('[LWS] Running inside popup window — skipping React mount.');
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
