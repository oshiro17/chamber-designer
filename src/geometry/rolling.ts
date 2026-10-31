import type { FabPiece } from './segmentation'
import type { UnrolledPiece } from './unroll'
import { add, cross, dot, length, normalize, scale, sub, type Vec3 } from './vec3'

/** 型紙が丸まって筒になる演出のための、部品ごとの円筒座標 */
export interface RollData {
  /** 溶接線からの円周方向の角度 [rad]（0〜2π） */
  phiRel: number[]
  /** 各母線の両端の軸方向位置と半径 */
  t0: number[]
  t1: number[]
  r0: number[]
  r1: number[]
  start: Vec3
  dir: Vec3
  /** 型紙の中央（溶接線の反対側）の向きと、その 90° 先の向き */
  m: Vec3
  mp: Vec3
}

export function rollData(u: UnrolledPiece, p: FabPiece): RollData {
  const n = u.edge0_3d.length
  const toCyl = (x: Vec3) => {
    const rel = sub(x, p.start)
    const t = dot(rel, p.dir)
    return { t, radial: sub(rel, scale(p.dir, t)) }
  }
  const seamDir = normalize(toCyl(u.edge0_3d[0]).radial)
  const m = scale(seamDir, -1)
  const d: RollData = { phiRel: [], t0: [], t1: [], r0: [], r1: [], start: p.start, dir: p.dir, m, mp: cross(p.dir, m) }
  for (let i = 0; i < n; i++) {
    const a = toCyl(u.edge0_3d[i])
    const b = toCyl(u.edge1_3d[i])
    d.phiRel.push((2 * Math.PI * i) / (n - 1))
    d.t0.push(a.t)
    d.t1.push(b.t)
    d.r0.push(length(a.radial))
    d.r1.push(length(b.radial))
  }
  return d
}

/**
 * 丸め具合 progress（0 = 平ら、1 = 筒）での頂点位置を out に書き込む。
 * 型紙の中央を固定したまま、半径 r / progress の円弧に巻き付ける。progress = 1 で展開計算の 3D 形状と一致する。
 * 並びは母線ごとに [始端, 終端] の順（部品メッシュの頂点順と同じ）。
 */
export function rolledPositions(d: RollData, progress: number, out: Float32Array): void {
  const k = Math.min(Math.max(progress, 1e-3), 1)
  const put = (j: number, t: number, r: number, psi: number) => {
    // 円弧の中心は中央の点から m 方向に半径 r/k 内側。k = 1 で軸上になる
    const R = r / k
    const radial = add(scale(d.m, r - R + R * Math.cos(psi)), scale(d.mp, R * Math.sin(psi)))
    const x = add(add(d.start, scale(d.dir, t)), radial)
    out[j] = x[0]
    out[j + 1] = x[1]
    out[j + 2] = x[2]
  }
  for (let i = 0; i < d.phiRel.length; i++) {
    const psi = (d.phiRel[i] - Math.PI) * k
    put(i * 6, d.t0[i], d.r0[i], psi)
    put(i * 6 + 3, d.t1[i], d.r1[i], psi)
  }
}
