import type { FabPiece } from './segmentation'
import { add, distance, dot, scale, type Vec3 } from './vec3'

export type Pt = [number, number]

export interface UnrollOptions {
  /** 円周方向の分割数 */
  samples?: number
  /**
   * 溶接線（丸めたときの縦の合わせ目）を置く角度 [deg]。部品の基準向き u から v 側へ測る。
   * u, v は隣の部品へねじれずに受け渡しているため、全部品で同じ角度にすると溶接線が一本につながる。
   * 入口では 0° が上、90° が手前、180° が下、270° が奥。
   */
  seam: number
  /** 継ぎ目に付ける溶接用の余白 [mm]。0 なら突き合わせ溶接 */
  allowance: number
}

export interface Mark {
  /** 円周方向の基準角 [deg]。隣の部品の同じ角度の印と合わせる */
  angleDeg: number
  label: string
  at0: Pt
  in0: Pt
  at1: Pt
  in1: Pt
}

export interface UnrolledPiece {
  index: number
  kind: 'cylinder' | 'cone'
  /** 切断線（閉じた多角形）。外側から見た向きで、y は排気の流れ方向 */
  outline: Pt[]
  /** 余白がある場合の溶接位置（折り線ではなく溶接の目安線） */
  seamLine: [Pt, Pt] | null
  edge0: Pt[]
  edge1: Pt[]
  marks: Mark[]
  /** 3D の切断線。展開精度の検証と 3D プレビューに使う */
  edge0_3d: Vec3[]
  edge1_3d: Vec3[]
  generatorMin: number
  generatorMax: number
  seamLength: number
  /** 円すいの展開半径（頂点から）。円柱は null */
  slantRadius0: number | null
  slantRadius1: number | null
  bbox: { minX: number; minY: number; maxX: number; maxY: number }
}

export type UnrollResult = { ok: true; piece: UnrolledPiece } | { ok: false; error: string }

const MARK_LABELS = ['A', 'B', 'C', 'D']

/**
 * 両端を平面で切った円すい台（円柱）を板厚中心の面で展開する。
 * 各母線と切断面の交点を解析的に求め、円すいは頂点まわりの扇形、円柱は長方形へ等長に写す。
 */
export function unrollPiece(p: FabPiece, opts: UnrollOptions): UnrollResult {
  const N = opts.samples ?? 240
  const L = p.length
  const k = (p.r1 - p.r0) / L
  const isCyl = Math.abs(k) < 1e-9
  const dn0 = dot(p.dir, p.n0)
  const dn1 = dot(p.dir, p.n1)
  const dirAt = (phi: number): Vec3 => add(scale(p.u, Math.cos(phi)), scale(p.v, Math.sin(phi)))

  const params = (phi: number) => {
    const e = dirAt(phi)
    const en0 = dot(e, p.n0)
    const en1 = dot(e, p.n1)
    const den0 = dn0 + k * en0
    const den1 = dn1 + k * en1
    if (den0 <= 1e-9 || den1 <= 1e-9) return null
    const t0 = (-p.r0 * en0) / den0
    const t1 = (L * dn1 - p.r0 * en1) / den1
    return { e, t0, t1 }
  }

  const M = 720
  for (let j = 0; j < M; j++) {
    if (!params((2 * Math.PI * j) / M)) {
      return { ok: false, error: `部品 ${p.index + 1}: 切断面が部品の軸とほぼ平行になり、展開できません。分割数を増やしてください` }
    }
  }
  const seamPhi = (((opts.seam * Math.PI) / 180) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)

  const ta = isCyl ? 0 : -p.r0 / k
  const slant = Math.sqrt(1 + k * k)
  const sinA = Math.abs(k) / slant
  const rAt = (t: number) => p.r0 + k * t
  const flow = k > 0 ? 1 : -1

  const toFlat = (phiRel: number, t: number, betaMid: number): Pt => {
    if (isCyl) return [p.r0 * phiRel, t]
    const rho = Math.abs(t - ta) * slant
    const beta = phiRel * sinA - betaMid
    return [rho * Math.sin(beta), flow * rho * Math.cos(beta)]
  }
  const betaMid = Math.PI * sinA

  const edge0: Pt[] = []
  const edge1: Pt[] = []
  const edge0_3d: Vec3[] = []
  const edge1_3d: Vec3[] = []
  let gMin = Infinity
  let gMax = -Infinity
  const at = (phiRel: number) => {
    const q = params(seamPhi + phiRel)!
    if (!(q.t1 - q.t0 > 1e-6)) return null
    if (!isCyl && ((q.t0 - ta) * (q.t1 - ta) <= 0 || (q.t0 - ta) * (0 - ta) <= 0)) return null
    return q
  }
  for (let j = 0; j <= N; j++) {
    const phiRel = (2 * Math.PI * j) / N
    const q = at(phiRel)
    if (!q) return { ok: false, error: `部品 ${p.index + 1}: 両端の切断面が部品の内部で交差しています。分割数を減らすか曲げを緩めてください` }
    edge0.push(toFlat(phiRel, q.t0, betaMid))
    edge1.push(toFlat(phiRel, q.t1, betaMid))
    edge0_3d.push(add(add(p.start, scale(p.dir, q.t0)), scale(q.e, rAt(q.t0))))
    edge1_3d.push(add(add(p.start, scale(p.dir, q.t1)), scale(q.e, rAt(q.t1))))
    const g = (q.t1 - q.t0) * slant
    gMin = Math.min(gMin, g)
    gMax = Math.max(gMax, g)
  }

  // 同じ部品を流れ方向に置いたとき y が増えるようにそろえ、最小 y を 0 にする
  const marks: Mark[] = []
  const twoPi = 2 * Math.PI
  for (let m = 0; m < 4; m++) {
    const absPhi = (m * Math.PI) / 2
    const rel = (((absPhi - seamPhi) % twoPi) + twoPi) % twoPi
    const q = at(rel)!
    const tick = Math.min(8, (q.t1 - q.t0) / 4)
    marks.push({
      angleDeg: m * 90,
      label: MARK_LABELS[m],
      at0: toFlat(rel, q.t0, betaMid),
      in0: toFlat(rel, q.t0 + tick / slant, betaMid),
      at1: toFlat(rel, q.t1, betaMid),
      in1: toFlat(rel, q.t1 - tick / slant, betaMid),
    })
  }

  let seamLine: [Pt, Pt] | null = null
  let outline: Pt[]
  const e0end = edge0[N]
  const e1end = edge1[N]
  if (opts.allowance > 0) {
    const gx = e1end[0] - e0end[0]
    const gy = e1end[1] - e0end[1]
    const gl = Math.hypot(gx, gy)
    const off: Pt = [(gy / gl) * opts.allowance, (-gx / gl) * opts.allowance]
    seamLine = [e0end, e1end]
    outline = [...edge0, [e0end[0] + off[0], e0end[1] + off[1]], [e1end[0] + off[0], e1end[1] + off[1]], ...[...edge1].reverse()]
  } else {
    outline = [...edge0, ...[...edge1].reverse()]
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of outline) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  const shift = (q: Pt): Pt => [q[0] - minX, q[1] - minY]
  const sh = (arr: Pt[]) => arr.map(shift)

  return {
    ok: true,
    piece: {
      index: p.index,
      kind: isCyl ? 'cylinder' : 'cone',
      outline: sh(outline),
      seamLine: seamLine ? [shift(seamLine[0]), shift(seamLine[1])] : null,
      edge0: sh(edge0),
      edge1: sh(edge1),
      marks: marks.map((m) => ({ ...m, at0: shift(m.at0), in0: shift(m.in0), at1: shift(m.at1), in1: shift(m.in1) })),
      edge0_3d,
      edge1_3d,
      generatorMin: gMin,
      generatorMax: gMax,
      seamLength: distance(edge0_3d[N], edge1_3d[N]),
      slantRadius0: isCyl ? null : Math.abs(0 - ta) * slant,
      slantRadius1: isCyl ? null : Math.abs(L - ta) * slant,
      bbox: { minX: 0, minY: 0, maxX: maxX - minX, maxY: maxY - minY },
    },
  }
}

export function flatLength(pts: Pt[]): number {
  let l = 0
  for (let i = 0; i + 1 < pts.length; i++) l += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
  return l
}

export function spaceLength(pts: Vec3[]): number {
  let l = 0
  for (let i = 0; i + 1 < pts.length; i++) l += distance(pts[i], pts[i + 1])
  return l
}

/** 継ぎ目で隣り合う 2 部品の切断線の最大のずれ [mm]（同じ基準角どうしで比較） */
export function jointMismatch(a: UnrolledPiece, aPiece: FabPiece, b: UnrolledPiece, bPiece: FabPiece, samples = 120): number {
  const pa = pointsByAngle(a.edge1_3d, aPiece)
  const pb = pointsByAngle(b.edge0_3d, bPiece)
  let worst = 0
  for (let j = 0; j < samples; j++) {
    const phi = (2 * Math.PI * j) / samples
    worst = Math.max(worst, distance(pa(phi), pb(phi)))
  }
  return worst
}

/** 3D の切断線を、部品の基準角 phi で引けるようにする */
function pointsByAngle(edge: Vec3[], p: FabPiece): (phi: number) => Vec3 {
  const withAngle = edge.slice(0, -1).map((q) => {
    const rel: Vec3 = [q[0] - p.start[0], q[1] - p.start[1], q[2] - p.start[2]]
    const ang = Math.atan2(dot(rel, p.v), dot(rel, p.u))
    return { ang: ang < 0 ? ang + 2 * Math.PI : ang, q }
  })
  withAngle.sort((x, y) => x.ang - y.ang)
  return (phi: number) => {
    const n = withAngle.length
    let i = withAngle.findIndex((w) => w.ang > phi)
    if (i < 0) i = 0
    const b = withAngle[i]
    const a = withAngle[(i - 1 + n) % n]
    let span = b.ang - a.ang
    let off = phi - a.ang
    if (span <= 0) span += 2 * Math.PI
    if (off < 0) off += 2 * Math.PI
    const t = Math.min(Math.max(off / span, 0), 1)
    return [a.q[0] + (b.q[0] - a.q[0]) * t, a.q[1] + (b.q[1] - a.q[1]) * t, a.q[2] + (b.q[2] - a.q[2]) * t]
  }
}
