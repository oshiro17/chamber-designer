import { parseDesign, type Design } from './design'
import { useDesignStore } from './designStore'

const KEY = 'chamber-designer:v3'

export function loadSaved(): Design | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const r = parseDesign(JSON.parse(raw))
    return r.ok ? r.design : null
  } catch {
    return null
  }
}

/** 設計データが変わるたびにブラウザへ保存する */
export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  return useDesignStore.subscribe((st, prev) => {
    if (st.design === prev.design) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(useDesignStore.getState().design))
      } catch {
        /* 保存できない環境（プライベートブラウズ等）では自動保存しない */
      }
    }, 600)
  })
}

export function downloadBlob(name: string, data: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
