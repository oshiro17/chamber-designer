import { distance, lerp, normalize, sub, type Vec3 } from './vec3'

/** 中心軸を等長セグメントの折れ線で表す。points[k] は弧長 s = k * segmentLength の位置 */
export interface Centerline {
  segmentLength: number
  points: Vec3[]
}

export const DEFAULT_SEGMENT_LENGTH = 5

/** x 軸正方向に伸びる直線の中心軸。全長が割り切れるようにセグメント長を調整する */
export function createStraightCenterline(totalLength: number, targetSegment = DEFAULT_SEGMENT_LENGTH): Centerline {
  if (!(totalLength > 0)) throw new Error('中心軸の全長は 0 より大きくしてください')
  const n = Math.max(1, Math.ceil(totalLength / targetSegment))
  const segmentLength = totalLength / n
  const points: Vec3[] = []
  for (let k = 0; k <= n; k++) points.push([k * segmentLength, 0, 0])
  return { segmentLength, points }
}

export const nominalLength = (c: Centerline): number => c.segmentLength * (c.points.length - 1)

export function measuredLength(c: Centerline): number {
  let l = 0
  for (let k = 0; k + 1 < c.points.length; k++) l += distance(c.points[k], c.points[k + 1])
  return l
}

/** 各セグメント長と規定長との差の最大値 [mm] */
export function maxSegmentError(c: Centerline): number {
  let e = 0
  for (let k = 0; k + 1 < c.points.length; k++) {
    e = Math.max(e, Math.abs(distance(c.points[k], c.points[k + 1]) - c.segmentLength))
  }
  return e
}

function locate(c: Centerline, s: number): { k: number; u: number } {
  const n = c.points.length - 1
  const x = Math.min(Math.max(s / c.segmentLength, 0), n)
  const k = Math.min(Math.floor(x), n - 1)
  return { k, u: x - k }
}

export function pointAt(c: Centerline, s: number): Vec3 {
  const { k, u } = locate(c, s)
  return lerp(c.points[k], c.points[k + 1], u)
}

export function tangentAt(c: Centerline, s: number): Vec3 {
  const { k } = locate(c, s)
  return normalize(sub(c.points[k + 1], c.points[k]))
}
