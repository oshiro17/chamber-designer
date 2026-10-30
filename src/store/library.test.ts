import { describe, expect, it } from 'vitest'
import { SAMPLE_POINTS } from '../geometry/sample'
import { defaultDesign, newId } from './design'
import { deleteSaved, listSaved, saveNamed } from './library'

function memoryStorage() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

const sample = () => ({ ...defaultDesign(), points: SAMPLE_POINTS.map((p) => ({ id: newId(), ...p })) })

describe('名前を付けて保存', () => {
  it('保存した設計を一覧から読み戻せる（新しい順）', () => {
    const st = memoryStorage()
    saveNamed('KX125 純正', sample(), st, new Date('2026-10-30T10:00:00Z'))
    saveNamed('試作 2', defaultDesign(), st, new Date('2026-10-31T10:00:00Z'))
    const list = listSaved(st)
    expect(list.map((e) => e.name)).toEqual(['試作 2', 'KX125 純正'])
    expect(list[1].design.points).toHaveLength(8)
    expect(list[0].design.points[0].diameter).toBeNaN()
  })

  it('同じ名前で保存すると上書きされ、件数は増えない', () => {
    const st = memoryStorage()
    saveNamed('KX125 純正', defaultDesign(), st, new Date('2026-10-30T10:00:00Z'))
    saveNamed('KX125 純正', sample(), st, new Date('2026-10-31T10:00:00Z'))
    const list = listSaved(st)
    expect(list).toHaveLength(1)
    expect(list[0].design.points).toHaveLength(8)
  })

  it('削除できる', () => {
    const st = memoryStorage()
    const e = saveNamed('消すもの', sample(), st)
    deleteSaved(e.id, st)
    expect(listSaved(st)).toHaveLength(0)
  })

  it('壊れたデータがあっても一覧は空として扱う', () => {
    const st = memoryStorage()
    st.setItem('chamber-designer:library:v1', '{broken')
    expect(listSaved(st)).toEqual([])
  })
})
