import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useDesignStore } from './store/designStore'
import { loadSaved, startAutosave } from './store/persist'

const saved = loadSaved()
if (saved) useDesignStore.setState({ design: saved })
startAutosave()

// スマホでキーボードが出ると見える範囲（visualViewport）が縮むので、画面の高さをそれに合わせる
const vv = window.visualViewport
if (vv) {
  const fit = () => {
    document.documentElement.style.setProperty('--app-h', `${vv.height}px`)
    window.scrollTo(0, 0)
  }
  vv.addEventListener('resize', fit)
  fit()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
