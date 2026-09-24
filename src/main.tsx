import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

/*
 * The service worker keeps a deploy from leaving the home-screen app black and
 * keeps the recordings for offline use — see `public/sw.js`. Only in the
 * published build: in development it would sit between the browser and Vite
 * and serve yesterday's code to a page that is being edited.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Without it the app works as it always did; nothing to tell the player.
    })
  })
}
