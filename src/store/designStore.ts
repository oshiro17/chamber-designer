import { create } from 'zustand'
import { buildFoldedCenterline, foldAngle, foldedAxis, foldFromParams, isFolded, MAX_FOLD_DEG, type Fold, type FoldedAxis } from '../geometry/fold'
import type { FabricationSettings } from '../geometry/fabrication'
import { computeProfile, type DiameterKind, type MeasurementPoint, type Station } from '../geometry/profile'
import { checkShape } from '../geometry/shapeCheck'
import type { PrintSettings } from '../output/layout'
import { defaultDesign, newId, type Design } from './design'

export type Tab = 'dimension' | 'bend' | 'unroll' | 'output'

/** 3D の視点。横 = バイクの側面（手前側）から見た向き */
export type ViewDir = 'iso' | 'side' | 'back' | 'top' | 'front'

/** 曲げの入力手順。折る測定点を選ぶ → 方向を決定 → 角度を決定。index は測定点の番号（0 始まり） */
export type BendDraft =
  | { step: 'pick'; index: number | null }
  | { step: 'dir'; index: number; phiDeg: number }
  | { step: 'amount'; index: number; phiDeg: number; thetaDeg: number }

interface State {
  design: Design
  tab: Tab
  draft: BendDraft | null
  fitNonce: number
  viewDir: ViewDir
  /** 組み立て演出の開始時刻（performance.now()）。再生していなければ null */
  assembleAt: number | null
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
  pickPoint: (index: number) => void
  pickS: (s: number) => void
  confirmPick: () => void
  setPhi: (deg: number) => void
  confirmDir: () => void
  setAmount: (patch: { thetaDeg?: number }) => void
  confirmAmount: () => void
  cancelBend: () => void
  removeBend: (id: string) => void
  removeAllBends: () => void

  setOrient: (patch: Partial<Design['orient']>) => void
  setName: (name: string) => void
  setFabrication: (patch: Partial<FabricationSettings>) => void
  setPrint: (patch: Partial<PrintSettings>) => void
  setTab: (t: Tab) => void
  fit: (dir?: ViewDir) => void
  playAssemble: () => void
  say: (text: string) => void
}

const LOCKED = '曲げがあるため寸法は変更できません。寸法を変える場合は「曲げ」タブで曲げをすべて削除してください'

const profileOf = (d: Design) => computeProfile(d.points, { diameterKind: d.diameterKind, thickness: d.thickness })

export function draftFold(d: Design, draft: BendDraft | null): Fold | null {
  if (!draft || draft.step !== 'amount') return null
  return foldFromParams('draft', d.points[draft.index].id, draft.phiDeg, draft.thetaDeg)
}

/** 測定点ごとの折れ。同じ測定点の折れは extra で置き換える */
export function foldsByIndex(d: Design, extra: Fold | null = null): (Fold | undefined)[] {
  const all = extra ? [...d.folds.filter((f) => f.pointId !== extra.pointId), extra] : d.folds
  return d.points.map((p) => all.find((f) => f.pointId === p.id))
}

export function axisOf(d: Design, stations: Station[], extra: Fold | null = null): FoldedAxis {
  return foldedAxis(stations, foldsByIndex(d, extra))
}

/** 先頭と末尾以外の測定点（折れる位置）の番号 */
export const foldablePoints = (d: Design): number[] => d.points.map((_, i) => i).filter((i) => i > 0 && i < d.points.length - 1)

/** 折れを加えても製作できる形状かを調べる。問題があれば理由を返す */
export function bendProblem(d: Design, f: Fold): string | null {
  const pr = profileOf(d)
  if (!pr.ok) return '寸法にエラーがあります'
  if (foldAngle(f) > (MAX_FOLD_DEG * Math.PI) / 180 + 1e-9) return `折れ角は ${MAX_FOLD_DEG}° までにしてください`
  const stations = pr.profile.stations
  const chk = checkShape(buildFoldedCenterline(stations, axisOf(d, stations, f)), stations)
  return chk.issues.find((i) => i.level === 'error')?.message ?? null
}

export const useDesignStore = create<State>((set, get) => {
  const edit = (fn: (d: Design) => Design) => set({ design: fn(get().design), message: '' })
  const locked = () => {
    if (isFolded(get().design.folds)) {
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
    viewDir: 'iso',
    assembleAt: null,
    message: '',

    addPoint: () => {
      if (locked()) return
      edit((d) => ({ ...d, points: [...d.points, { id: newId(), distance: NaN, diameter: NaN }] }))
    },
    // 区間を二等分して測定点を足すだけなので、折れがあっても形と長さは変わらない
    insertAfter: (index) => {
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

    startBend: () => set({ draft: { step: 'pick', index: null }, message: '折る測定点を選んでください（3D をタップしても選べます）' }),
    pickPoint: (index) => {
      const { draft, design } = get()
      if (draft?.step !== 'pick' || !foldablePoints(design).includes(index)) return
      set({ draft: { step: 'pick', index }, message: `測定点 ${index + 1} を選びました。よければ［決定］` })
    },
    pickS: (s) => {
      const { design } = get()
      const pr = profileOf(design)
      const cand = foldablePoints(design)
      if (!pr.ok || cand.length === 0) return
      const best = cand.reduce((a, b) => (Math.abs(pr.profile.stations[b].s - s) < Math.abs(pr.profile.stations[a].s - s) ? b : a))
      get().pickPoint(best)
    },
    confirmPick: () => {
      const dr = get().draft
      if (dr?.step !== 'pick' || dr.index === null) return
      set({ draft: { step: 'dir', index: dr.index, phiDeg: 0 }, message: '曲げる方向を決めてください（矢印の向きに曲がります）' })
    },
    setPhi: (phiDeg) => {
      const dr = get().draft
      if (dr?.step === 'dir') set({ draft: { ...dr, phiDeg: ((phiDeg % 360) + 360) % 360 } })
    },
    confirmDir: () => {
      const dr = get().draft
      if (dr?.step !== 'dir') return
      set({ draft: { step: 'amount', index: dr.index, phiDeg: dr.phiDeg, thetaDeg: 15 }, message: '曲げる角度を決めてください' })
    },
    setAmount: (patch) => {
      const dr = get().draft
      if (dr?.step === 'amount') set({ draft: { ...dr, ...patch } })
    },
    confirmAmount: () => {
      const { draft, design } = get()
      const f = draftFold(design, draft)
      if (!f) return
      const problem = bendProblem(design, f)
      if (problem) {
        set({ message: problem })
        return
      }
      set({
        design: { ...design, folds: [...design.folds.filter((x) => x.pointId !== f.pointId), { ...f, id: newId('f') }] },
        draft: null,
        message: '曲げを追加しました',
      })
    },
    cancelBend: () => set({ draft: null, message: '' }),
    removeBend: (id) => edit((d) => ({ ...d, folds: d.folds.filter((f) => f.id !== id) })),
    removeAllBends: () => edit((d) => ({ ...d, folds: [] })),

    setName: (name) => edit((d) => ({ ...d, name })),
    setOrient: (patch) => edit((d) => ({ ...d, orient: { ...d.orient, ...patch } })),
    setFabrication: (patch) => edit((d) => ({ ...d, fabrication: { ...d.fabrication, ...patch } })),
    setPrint: (patch) => edit((d) => ({ ...d, print: { ...d.print, ...patch } })),
    setTab: (tab) => set({ tab, draft: null, message: '' }),
    playAssemble: () => set({ assembleAt: performance.now() }),
    fit: (dir) => set((st) => ({ fitNonce: st.fitNonce + 1, viewDir: dir ?? st.viewDir })),
    say: (message) => set({ message }),
  }
})
