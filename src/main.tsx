import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './lawguild-premium.css'
import App from './App.tsx'

// Check if the current window is an MSAL popup window.
// If it is, we bypass mounting the React app. This prevents a second React app 
// and MSAL instance from initializing inside the popup, resolving "block_nested_popups".
const isMsalPopup = typeof window !== 'undefined' && 
  window.opener && 
  window.name && 
  (window.name.includes('msal') || window.name.includes('ms-id'));

if (isMsalPopup) {
  console.log('MSAL Popup window detected. Bypassing React app mount to prevent nested initialization.');
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
