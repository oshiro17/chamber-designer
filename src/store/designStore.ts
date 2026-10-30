import { create } from 'zustand'
import { buildBentCenterline, handleFits, handleFromParams, isBent, type BendHandle } from '../geometry/bend'
import type { FabricationSettings } from '../geometry/fabrication'
import { computeProfile, diameterAt, type DiameterKind, type MeasurementPoint } from '../geometry/profile'
import { checkShape } from '../geometry/shapeCheck'
import type { PrintSettings } from '../output/layout'
import { defaultDesign, newId, type Design } from './design'

export type Tab = 'dimension' | 'bend' | 'unroll' | 'output'

/** 曲げの入力手順。位置をタップ → 方向を決定 → 角度と半径を決定 */
export type BendDraft =
  | { step: 'pick'; s: number | null }
  | { step: 'dir'; s: number; phiDeg: number }
  | { step: 'amount'; s: number; phiDeg: number; thetaDeg: number; radius: number }

interface State {
  design: Design
  tab: Tab
  draft: BendDraft | null
  fitNonce: number
  message: string

  addPoint: () => void
  insertAfter: (index: number) => void
  updatePoint: (index: number, patch: Partial<Omit<MeasurementPoint, 'id'>>) => void
  removePoint: (index: number) => void
  setDiameterKind: (kind: DiameterKind) => void
  setThickness: (t: number) => void
  clearAll: () => void
  loadDesign: (d: Design, name: string) => void

  startBend: () => void
  pickS: (s: number) => void
  confirmPick: () => void
  setPhi: (deg: number) => void
  confirmDir: () => void
  setAmount: (patch: { thetaDeg?: number; radius?: number }) => void
  confirmAmount: () => void
  cancelBend: () => void
  removeBend: (id: string) => void
  removeAllBends: () => void

  setFabrication: (patch: Partial<FabricationSettings>) => void
  setPrint: (patch: Partial<PrintSettings>) => void
  setTab: (t: Tab) => void
  fit: () => void
  say: (text: string) => void
}

const LOCKED = '曲げがあるため寸法は変更できません。寸法を変える場合は「曲げ」タブで曲げをすべて削除してください'

const profileOf = (d: Design) => computeProfile(d.points, { diameterKind: d.diameterKind, thickness: d.thickness })

export function draftHandle(draft: BendDraft | null): BendHandle | null {
  if (!draft || draft.step !== 'amount') return null
  return handleFromParams('draft', draft.s, draft.phiDeg, draft.thetaDeg, draft.radius)
}

/** 曲げを追加しても製作できる形状かを調べる。問題があれば理由を返す */
export function bendProblem(d: Design, h: BendHandle): string | null {
  const pr = profileOf(d)
  if (!pr.ok) return '寸法にエラーがあります'
  const L = pr.profile.length
  if (!handleFits(h, L)) return '曲げる範囲がチャンバーの端からはみ出します。角度か半径を小さくしてください'
  const chk = checkShape(buildBentCenterline(L, [...d.bends, h]), pr.profile.stations)
  return chk.issues.find((i) => i.level === 'error')?.message ?? null
}

export const useDesignStore = create<State>((set, get) => {
  const edit = (fn: (d: Design) => Design) => set({ design: fn(get().design), message: '' })
  const locked = () => {
    if (isBent(get().design.bends)) {
      set({ message: LOCKED })
      return true
    }
    return false
  }

  return {
    design: defaultDesign(),
    tab: 'dimension',
    draft: null,
    fitNonce: 0,
    message: '',

    addPoint: () => {
      if (locked()) return
      edit((d) => ({ ...d, points: [...d.points, { id: newId(), distance: NaN, diameter: NaN }] }))
    },
    insertAfter: (index) => {
      if (locked()) return
      edit((d) => {
        const cur = d.points[index]
        const next = d.points[index + 1]
        if (!next) return { ...d, points: [...d.points, { id: newId(), distance: NaN, diameter: NaN }] }
        // 次の点までの区間を二等分し、以降の点の累積位置は変えない
        const half = next.distance / 2
        const points = [...d.points]
        points.splice(index + 1, 1, { id: newId(), distance: half, diameter: (cur.diameter + next.diameter) / 2 }, { ...next, distance: next.distance - half })
        return { ...d, points }
      })
    },
    updatePoint: (index, patch) => {
      if (locked()) return
      edit((d) => ({ ...d, points: d.points.map((p, i) => (i === index ? { ...p, ...patch } : p)) }))
    },
    removePoint: (index) => {
      if (locked()) return
      edit((d) => {
        if (d.points.length <= 1) return d
        const points = d.points.filter((_, i) => i !== index)
        // 削除した点の距離を次の点へ足し、以降の点の累積位置を保つ
        if (index > 0 && index < d.points.length - 1) points[index] = { ...points[index], distance: points[index].distance + d.points[index].distance }
        if (index === 0) points[0] = { ...points[0], distance: 0 }
        return { ...d, points }
      })
    },
    setDiameterKind: (diameterKind) => {
      if (locked()) return
      edit((d) => ({ ...d, diameterKind }))
    },
    setThickness: (thickness) => {
      if (locked()) return
      edit((d) => ({ ...d, thickness }))
    },
    clearAll: () => set({ design: defaultDesign(), draft: null, message: 'すべてクリアしました' }),
    loadDesign: (design, name) => set({ design, draft: null, message: `「${name}」を開きました` }),

    startBend: () => set({ draft: { step: 'pick', s: null }, message: '曲げたい位置の中心をタップしてください' }),
    pickS: (s) => {
      const dr = get().draft
      if (dr?.step === 'pick') set({ draft: { step: 'pick', s }, message: `位置 s = ${s.toFixed(0)}mm を選びました。よければ［決定］` })
    },
    confirmPick: () => {
      const dr = get().draft
      if (dr?.step !== 'pick' || dr.s === null) return
      set({ draft: { step: 'dir', s: dr.s, phiDeg: 0 }, message: '曲げる方向を決めてください（矢印の向きに曲がります）' })
    },
    setPhi: (phiDeg) => {
      const dr = get().draft
      if (dr?.step === 'dir') set({ draft: { ...dr, phiDeg: ((phiDeg % 360) + 360) % 360 } })
    },
    confirmDir: () => {
      const dr = get().draft
      if (dr?.step !== 'dir') return
      const pr = profileOf(get().design)
      const D = pr.ok ? diameterAt(pr.profile.stations, dr.s, 'outer') : 50
      set({
        draft: { step: 'amount', s: dr.s, phiDeg: dr.phiDeg, thetaDeg: 30, radius: Math.round(D * 1.5) },
        message: '曲げる角度と半径を決めてください',
      })
    },
    setAmount: (patch) => {
      const dr = get().draft
      if (dr?.step === 'amount') set({ draft: { ...dr, ...patch } })
    },
    confirmAmount: () => {
      const { draft, design } = get()
      const h = draftHandle(draft)
      if (!h) return
      const problem = bendProblem(design, h)
      if (problem) {
        set({ message: problem })
        return
      }
      set({
        design: { ...design, bends: [...design.bends, { ...h, id: newId('b') }].sort((x, y) => x.s - y.s) },
        draft: null,
        message: '曲げを追加しました',
      })
    },
    cancelBend: () => set({ draft: null, message: '' }),
    removeBend: (id) => edit((d) => ({ ...d, bends: d.bends.filter((h) => h.id !== id) })),
    removeAllBends: () => edit((d) => ({ ...d, bends: [] })),

    setFabrication: (patch) => edit((d) => ({ ...d, fabrication: { ...d.fabrication, ...patch } })),
    setPrint: (patch) => edit((d) => ({ ...d, print: { ...d.print, ...patch } })),
    setTab: (tab) => set({ tab, draft: null, message: '' }),
    fit: () => set((st) => ({ fitNonce: st.fitNonce + 1 })),
    say: (message) => set({ message }),
  }
})
