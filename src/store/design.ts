import type { Fold } from '../geometry/fold'
import type { FabricationSettings } from '../geometry/fabrication'
import type { DiameterKind, MeasurementPoint } from '../geometry/profile'
import type { PrintSettings } from '../output/layout'

export interface Design {
  version: 1
  /** チャンバーの名前（例: RZ421）。型紙の中央に印刷する */
  name: string
  points: MeasurementPoint[]
  diameterKind: DiameterKind
  thickness: number
  /** 測定点での折れ */
  folds: Fold[]
  /** 表示上のチャンバー全体の向き [deg]。入口を中心に、奥行きの軸（z）→ 横の軸（x）の順に回す。形と寸法は変わらない */
  orient: { zDeg: number; xDeg: number }
  fabrication: FabricationSettings
  print: PrintSettings
}

let seq = 0
// crypto.randomUUID は http の LAN アクセスでは使えないため自前で採番する
export const newId = (prefix = 'p'): string => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`

export function defaultDesign(): Design {
  return {
    version: 1,
    name: '',
    // 未入力は NaN。入口の 1 点だけから始める
    points: [{ id: newId(), distance: 0, diameter: NaN }],
    diameterKind: 'outer',
    thickness: 1,
    folds: [],
    orient: { zDeg: 0, xDeg: 0 },
    fabrication: { seam: 180, allowance: 0 },
    print: { orientation: 'landscape', margin: 10, overlap: 15 },
  }
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
/** 未入力（NaN）は JSON で null になるため NaN に戻す */
const numOrBlank = (v: unknown): number | null => (v === null ? NaN : isNum(v) ? v : null)

function orientOf(raw: unknown): Design['orient'] {
  const o = (raw ?? {}) as Record<string, unknown>
  return { zDeg: isNum(o.zDeg) ? o.zDeg : 0, xDeg: isNum(o.xDeg) ? o.xDeg : 0 }
}

/** 溶接線の角度だけを読み込む。以前の 'inner' / 'outer' は初期値にし、溶接用の余白は設定をなくしたので 0 にする */
function fabricationOf(base: Design, raw: unknown): Design['fabrication'] {
  const f = (raw ?? {}) as Record<string, unknown>
  return { seam: isNum(f.seam) ? f.seam : base.fabrication.seam, allowance: 0 }
}

/** 保存データを読み込む。型が合わない項目があれば理由付きで失敗させる */
export function parseDesign(raw: unknown): { ok: true; design: Design } | { ok: false; error: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: '形式が正しくありません' }
  const d = raw as Record<string, unknown>
  if (d.version !== 1) return { ok: false, error: '対応していないバージョンです' }
  const base = defaultDesign()
  if (!Array.isArray(d.points) || d.points.length < 1) return { ok: false, error: '測定点がありません' }
  const points: MeasurementPoint[] = []
  for (const p of d.points as Record<string, unknown>[]) {
    const distance = numOrBlank(p.distance)
    const diameter = numOrBlank(p.diameter)
    if (distance === null || diameter === null) return { ok: false, error: '測定点の距離・直径が数値ではありません' }
    points.push({ id: typeof p.id === 'string' ? p.id : newId(), distance, diameter })
  }
  const folds: Fold[] = []
  for (const f of (Array.isArray(d.folds) ? d.folds : []) as Record<string, unknown>[]) {
    if (typeof f.pointId !== 'string' || !isNum(f.a) || !isNum(f.b)) return { ok: false, error: '曲げのデータが正しくありません' }
    folds.push({ id: typeof f.id === 'string' ? f.id : newId('f'), pointId: f.pointId, a: f.a, b: f.b })
  }
  // 以前の滑らかな曲げは、中心に最も近い測定点（先頭・末尾以外）での折れに置き換える
  for (const b of (Array.isArray(d.bends) ? d.bends : []) as Record<string, unknown>[]) {
    if (!isNum(b.s) || !isNum(b.a) || !isNum(b.b) || points.length < 3) continue
    let acc = 0
    const pos = points.map((p, i) => (i === 0 ? 0 : (acc += Number.isFinite(p.distance) ? p.distance : 0)))
    let best = 1
    for (let i = 1; i < points.length - 1; i++) if (Math.abs(pos[i] - b.s) < Math.abs(pos[best] - b.s)) best = i
    if (!folds.some((f) => f.pointId === points[best].id)) folds.push({ id: newId('f'), pointId: points[best].id, a: b.a, b: b.b })
  }
  return {
    ok: true,
    design: {
      version: 1,
      name: typeof d.name === 'string' ? d.name : '',
      points,
      diameterKind: d.diameterKind === 'inner' ? 'inner' : 'outer',
      thickness: isNum(d.thickness) ? d.thickness : base.thickness,
      folds,
      orient: orientOf(d.orient),
      fabrication: fabricationOf(base, d.fabrication),
      print: { ...base.print, ...(d.print as object) },
    },
  }
}
