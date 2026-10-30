import type { Centerline } from './centerline'
import { add, cross, dot, length as vlen, normalize, rotateAround, scale, sub, type Vec3 } from './vec3'

/**
 * 曲げ点。位置 s を中心に幅 width の範囲へ曲率を滑らかに分布させる。
 * (a, b) は局所フレームでの曲げ角 [rad]。a は側面内（上下）、b は左右方向。合計の曲げ角は |(a, b)|。
 */
export interface BendHandle {
  id: string
  s: number
  width: number
  a: number
  b: number
}

export const BEND_SEGMENT = 2.5
export const MIN_BEND_WIDTH = 20
export const MAX_BEND_ANGLE = Math.PI * 0.95

export const bendAngle = (h: BendHandle): number => Math.hypot(h.a, h.b)

/** 二乗余弦の曲率分布の累積値。範囲外では 0 または 1 */
export function bendCumulative(s: number, center: number, width: number): number {
  const x = s - center
  if (x <= -width / 2) return 0
  if (x >= width / 2) return 1
  return (x + width / 2) / width + Math.sin((2 * Math.PI * x) / width) / (2 * Math.PI)
}

/** 曲げ点の分布が中心軸の範囲に収まるよう位置と幅を補正する */
export function clampHandle(h: BendHandle, totalLength: number): BendHandle {
  const width = Math.min(Math.max(h.width, MIN_BEND_WIDTH), totalLength)
  const s = Math.min(Math.max(h.s, width / 2), totalLength - width / 2)
  const ang = Math.hypot(h.a, h.b)
  const k = ang > MAX_BEND_ANGLE ? MAX_BEND_ANGLE / ang : 1
  return { ...h, s, width, a: h.a * k, b: h.b * k }
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

export function segmentCount(totalLength: number, target = BEND_SEGMENT): number {
  return Math.max(1, Math.ceil(totalLength / target))
}

/**
 * 曲率の分布を弧長に沿って積分し、中心軸の点列を作る。
 * 各セグメントは単位接線 × 固定長で進むため、曲げ方に関係なくセグメント長と全長は変わらない。
 * 入口は原点で +x 向き、側面図の上方向は +y。
 */
export function buildBentCenterline(totalLength: number, handles: BendHandle[], upTo = totalLength): Centerline {
  const n = segmentCount(totalLength)
  const h = totalLength / n
  const last = Math.min(n, Math.ceil(upTo / h - 1e-9))
  let f: Frame3 = { t: [1, 0, 0], n: [0, 1, 0], b: [0, 0, 1] }
  let p: Vec3 = [0, 0, 0]
  const points: Vec3[] = [p]
  let prevMid = 0
  for (let k = 0; k < last; k++) {
    const mid = (k + 0.5) * h
    let rot: Vec3 = [0, 0, 0]
    for (const hd of handles) {
      const dG = bendCumulative(mid, hd.s, hd.width) - bendCumulative(prevMid, hd.s, hd.width)
      if (dG !== 0) rot = add(rot, scale(sub(scale(f.b, hd.a), scale(f.n, hd.b)), dG))
    }
    f = rotateFrame(f, rot)
    prevMid = mid
    p = add(p, scale(f.t, h))
    points.push(p)
  }
  return { segmentLength: h, points }
}

const DEG = Math.PI / 180

/**
 * 曲げ方向・曲げ角・曲げ半径から曲げ点を作る。
 * 方向 phi はその位置での軸まわりの角度で、0° が上、90° が手前（+z）、180° が下、270° が奥。
 * 半径 R は曲げの中央での最小曲げ半径で、二乗余弦分布では範囲 width = 2θR になる。
 */
export function handleFromParams(id: string, s: number, phiDeg: number, thetaDeg: number, radius: number): BendHandle {
  const th = thetaDeg * DEG
  const ph = phiDeg * DEG
  return { id, s, width: th > 0 ? 2 * th * radius : MIN_BEND_WIDTH, a: th * Math.cos(ph), b: th * Math.sin(ph) }
}

export function handleParams(h: BendHandle): { phiDeg: number; thetaDeg: number; radius: number } {
  const th = bendAngle(h)
  const phi = (Math.atan2(h.b, h.a) / DEG + 360) % 360
  return { phiDeg: th > 0 ? phi : 0, thetaDeg: th / DEG, radius: th > 0 ? h.width / (2 * th) : Infinity }
}

/** 曲げ範囲が中心軸の両端からはみ出さないか */
export function handleFits(h: BendHandle, totalLength: number): boolean {
  return h.width >= MIN_BEND_WIDTH && h.s - h.width / 2 >= -1e-9 && h.s + h.width / 2 <= totalLength + 1e-9 && bendAngle(h) <= MAX_BEND_ANGLE
}

export const isBent = (handles: BendHandle[]): boolean => handles.some((h) => bendAngle(h) > 1e-9)

/** 曲げ点の最小曲げ半径の理論値。二乗余弦分布の最大曲率は 2θ / width */
export const handleMinRadius = (h: BendHandle): number => (bendAngle(h) > 0 ? h.width / (2 * bendAngle(h)) : Infinity)
