import { parseDesign, type Design } from './design'

/** 名前を付けて保存した設計の一覧。ブラウザ内（localStorage）に保存する */
export interface SavedDesign {
  id: string
  name: string
  savedAt: string
  design: Design
}

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>

const KEY = 'chamber-designer:library:v1'

export function listSaved(storage: Storage = localStorage): SavedDesign[] {
  try {
    const raw = JSON.parse(storage.getItem(KEY) ?? '[]') as unknown
    if (!Array.isArray(raw)) return []
    const out: SavedDesign[] = []
    for (const e of raw as Record<string, unknown>[]) {
      const r = parseDesign(e.design)
      if (r.ok && typeof e.name === 'string' && typeof e.id === 'string') {
        out.push({ id: e.id, name: e.name, savedAt: String(e.savedAt ?? ''), design: r.design })
      }
    }
    return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  } catch {
    return []
  }
}

/** 同じ名前があれば上書きする。保存できなかった場合は例外を投げる */
export function saveNamed(name: string, design: Design, storage: Storage = localStorage, now = new Date()): SavedDesign {
  const list = listSaved(storage)
  const same = list.find((e) => e.name === name)
  const entry: SavedDesign = { id: same?.id ?? `s${now.getTime().toString(36)}`, name, savedAt: now.toISOString(), design }
  storage.setItem(KEY, JSON.stringify([entry, ...list.filter((e) => e.name !== name)]))
  return entry
}

export function deleteSaved(id: string, storage: Storage = localStorage): void {
  storage.setItem(KEY, JSON.stringify(listSaved(storage).filter((e) => e.id !== id)))
}
