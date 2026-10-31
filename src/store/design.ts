import type { BendHandle } from '../geometry/bend'
import type { FabricationSettings } from '../geometry/fabrication'
import type { DiameterKind, MeasurementPoint } from '../geometry/profile'
import type { PrintSettings } from '../output/layout'

export interface Design {
  version: 1
  points: MeasurementPoint[]
  diameterKind: DiameterKind
  thickness: number
  bends: BendHandle[]
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
    // 未入力は NaN。入口の 1 点だけから始める
    points: [{ id: newId(), distance: 0, diameter: NaN }],
    diameterKind: 'outer',
    thickness: 1,
    bends: [],
    orient: { zDeg: 0, xDeg: 0 },
    fabrication: { mode: 'auto', maxAngleDeg: 12, count: 12, seam: 180, allowance: 0 },
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

/** 以前の保存データの溶接線（'inner' / 'outer'）は角度の初期値に置き換える */
function fabricationOf(base: Design, raw: unknown): Design['fabrication'] {
  const f = { ...base.fabrication, ...(raw as object) }
  return { ...f, seam: isNum(f.seam) ? f.seam : base.fabrication.seam }
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
  const bends: BendHandle[] = []
  for (const b of (Array.isArray(d.bends) ? d.bends : []) as Record<string, unknown>[]) {
    if (!isNum(b.s) || !isNum(b.width) || !isNum(b.a) || !isNum(b.b)) return { ok: false, error: '曲げのデータが正しくありません' }
    bends.push({ id: typeof b.id === 'string' ? b.id : newId('b'), s: b.s, width: b.width, a: b.a, b: b.b })
  }
  return {
    ok: true,
    design: {
      version: 1,
      points,
      diameterKind: d.diameterKind === 'inner' ? 'inner' : 'outer',
      thickness: isNum(d.thickness) ? d.thickness : base.thickness,
      bends,
      orient: orientOf(d.orient),
      fabrication: fabricationOf(base, d.fabrication),
      print: { ...base.print, ...(d.print as object) },
    },
  }
}
