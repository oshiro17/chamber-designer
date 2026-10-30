import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useDesignStore } from './store/designStore'
import { loadSaved, startAutosave } from './store/persist'

const saved = loadSaved()
if (saved) useDesignStore.setState({ design: saved })
startAutosave()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
