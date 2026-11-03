import type { Centerline } from './centerline'
import { diameterAt, type Station } from './profile'
import type { FabPiece, FabResult } from './segmentation'
import { add, cross, dot, length as vlen, normalize, rotateAround, scale, sub, type Vec3 } from './vec3'

/**
 * 測定点での折れ。測定点 pointId の位置で、その先の区間の向きを (a, b) だけ変える。
 * a は側面内（上下）、b は左右方向の折れ角 [rad]。合計の折れ角は |(a, b)|。
 * 曲げは測定点でだけ起きるので、部品は必ず「測定点の数 − 1」個のまっすぐな円すい台になる。
 */
export interface Fold {
  id: string
  pointId: string
  a: number
  b: number
}

export const MAX_FOLD_DEG = 80
const DEG = Math.PI / 180

export const foldAngle = (f: Pick<Fold, 'a' | 'b'>): number => Math.hypot(f.a, f.b)
export const isFolded = (folds: Fold[]): boolean => folds.some((f) => foldAngle(f) > 1e-9)

/** 方向 phi（0° = 上, 90° = 手前, 180° = 下, 270° = 奥）と折れ角 theta から折れを作る */
export function foldFromParams(id: string, pointId: string, phiDeg: number, thetaDeg: number): Fold {
  const th = thetaDeg * DEG
  return { id, pointId, a: th * Math.cos(phiDeg * DEG), b: th * Math.sin(phiDeg * DEG) }
}

export function foldParams(f: Fold): { phiDeg: number; thetaDeg: number } {
  const th = foldAngle(f)
  return { phiDeg: th > 0 ? (Math.atan2(f.b, f.a) / DEG + 360) % 360 : 0, thetaDeg: th / DEG }
}

interface Frame3 {
  t: Vec3
  n: Vec3
  b: Vec3
}

function rotateFrame(f: Frame3, rot: Vec3): Frame3 {
  const ang = vlen(rot)
  if (ang < 1e-15) return f
  const axis = scale(rot, 1 / ang)
  const t = normalize(rotateAround(f.t, axis, ang))
  let n = rotateAround(f.n, axis, ang)
  n = normalize(sub(n, scale(t, dot(n, t))))
  return { t, n, b: cross(t, n) }
}

/** 区間（測定点 j → j+1）ごとの始点と向き。入口は原点で +x 向き、側面図の上方向は +y */
export interface FoldedAxis {
  starts: Vec3[]
  dirs: Vec3[]
}

/** foldAt[j] は測定点 j での折れ（なければ undefined）。先頭と末尾の測定点では折れない */
export function foldedAxis(stations: Station[], foldAt: (Pick<Fold, 'a' | 'b'> | undefined)[]): FoldedAxis {
  let f: Frame3 = { t: [1, 0, 0], n: [0, 1, 0], b: [0, 0, 1] }
  let p: Vec3 = [0, 0, 0]
  const starts: Vec3[] = []
  const dirs: Vec3[] = []
  for (let j = 0; j + 1 < stations.length; j++) {
    const fd = j > 0 ? foldAt[j] : undefined
    if (fd) f = rotateFrame(f, sub(scale(f.b, fd.a), scale(f.n, fd.b)))
    starts.push(p)
    dirs.push(f.t)
    p = add(p, scale(f.t, stations[j + 1].s - stations[j].s))
  }
  return { starts, dirs }
}

export function axisPoint(ax: FoldedAxis, stations: Station[], s: number): Vec3 {
  let j = 0
  while (j < ax.dirs.length - 1 && s > stations[j + 1].s) j++
  return add(ax.starts[j], scale(ax.dirs[j], s - stations[j].s))
}

/** 表示や検査に使う等間隔の点列。折れの角は点の間で少し丸まって見えるが、部品の計算には使わない */
export function buildFoldedCenterline(stations: Station[], ax: FoldedAxis, target = 2.5): Centerline {
  const L = stations[stations.length - 1].s
  const n = Math.max(1, Math.ceil(L / target))
  const h = L / n
  const points: Vec3[] = []
  for (let k = 0; k <= n; k++) points.push(axisPoint(ax, stations, k * h))
  return { segmentLength: h, points }
}

function rotationBetween(a: Vec3, b: Vec3, v: Vec3): Vec3 {
  const ax = cross(a, b)
  const s = vlen(ax)
  if (s < 1e-12) return v
  return rotateAround(v, scale(ax, 1 / s), Math.atan2(s, dot(a, b)))
}

/**
 * 区間ごとに 1 つの円すい台（円柱）部品を作る。継ぎ目の切断面は前後の軸の二等分面。
 * 部品の軸がそのまま設計の中心軸なので、設計形状とのずれは 0。
 */
export function buildFoldPieces(stations: Station[], ax: FoldedAxis): FabResult {
  const { dirs } = ax
  const ref: Vec3 = Math.abs(dirs[0][1]) < 0.9 ? [0, 1, 0] : [0, 0, 1]
  let u = normalize(sub(ref, scale(dirs[0], dot(ref, dirs[0]))))
  const pieces: FabPiece[] = []
  let maxFold = 0
  for (let i = 0; i < dirs.length; i++) {
    const d = dirs[i]
    if (i > 0) {
      u = normalize(rotationBetween(dirs[i - 1], d, u))
      maxFold = Math.max(maxFold, Math.acos(Math.min(1, dot(dirs[i - 1], d))))
    }
    const s0 = stations[i].s
    const s1 = stations[i + 1].s
    pieces.push({
      index: i,
      s0,
      s1,
      length: s1 - s0,
      start: ax.starts[i],
      dir: d,
      u,
      v: cross(d, u),
      r0: diameterAt(stations, s0, 'mid') / 2,
      r1: diameterAt(stations, s1, 'mid') / 2,
      d0Outer: stations[i].outer,
      d1Outer: stations[i + 1].outer,
      n0: i === 0 ? d : normalize(add(dirs[i - 1], d)),
      n1: i === dirs.length - 1 ? d : normalize(add(d, dirs[i + 1])),
    })
  }
  return {
    pieces,
    maxDeviation: 0,
    maxDeviationS: 0,
    endDeviation: 0,
    totalLength: pieces.reduce((acc, p) => acc + p.length, 0),
    maxMiterDeg: (maxFold * 180) / Math.PI / 2,
  }
}
