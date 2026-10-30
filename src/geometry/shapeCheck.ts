import { maxSegmentError, measuredLength, nominalLength, type Centerline } from './centerline'
import { diameterAt, type Station } from './profile'
import { distance, dot, normalize, sub } from './vec3'

export interface ShapeIssue {
  level: 'error' | 'warning'
  message: string
  s?: number
}

export interface ShapeCheck {
  /** 中心軸の最小曲げ半径 [mm]（直線なら Infinity） */
  minRadius: number
  minRadiusS: number
  /** 曲げ半径 / その位置の外径 の最小値 */
  minRatio: number
  minRatioS: number
  /** 実測した中心軸長と規定長との差 [mm] */
  lengthError: number
  maxSegmentError: number
  issues: ShapeIssue[]
  ok: boolean
}

/** 曲げ半径 / 外径 がこれ未満なら警告 */
export const WARN_RATIO = 1.0

export function nodeRadii(c: Centerline): number[] {
  const r: number[] = [Infinity]
  for (let k = 1; k + 1 < c.points.length; k++) {
    const t0 = normalize(sub(c.points[k], c.points[k - 1]))
    const t1 = normalize(sub(c.points[k + 1], c.points[k]))
    const ang = Math.acos(Math.min(1, Math.max(-1, dot(t0, t1))))
    r.push(ang > 1e-12 ? c.segmentLength / ang : Infinity)
  }
  r.push(Infinity)
  return r
}

export function checkShape(c: Centerline, stations: Station[]): ShapeCheck {
  const issues: ShapeIssue[] = []
  const radii = nodeRadii(c)
  let minRadius = Infinity
  let minRadiusS = 0
  let minRatio = Infinity
  let minRatioS = 0
  let folded: number | null = null
  radii.forEach((R, k) => {
    if (!Number.isFinite(R)) return
    const s = k * c.segmentLength
    const D = diameterAt(stations, s, 'outer')
    if (R < minRadius) {
      minRadius = R
      minRadiusS = s
    }
    if (R / D < minRatio) {
      minRatio = R / D
      minRatioS = s
    }
    if (R <= D / 2 && folded === null) folded = s
  })

  if (folded !== null) {
    issues.push({
      level: 'error',
      s: folded,
      message: `s=${(folded as number).toFixed(0)}mm 付近の曲げ半径が外径の半分以下です。曲げの内側で管壁が重なるため製作できません`,
    })
  } else if (minRatio < WARN_RATIO) {
    issues.push({
      level: 'warning',
      s: minRatioS,
      message: `s=${minRatioS.toFixed(0)}mm 付近の曲げ半径が ${minRadius.toFixed(0)}mm（外径の ${minRatio.toFixed(2)} 倍）と小さく、製作が難しい可能性があります`,
    })
  }

  const overlap = findOverlap(c, stations)
  if (overlap) {
    issues.push({
      level: 'error',
      s: overlap.s1,
      message: `s=${overlap.s1.toFixed(0)}mm と s=${overlap.s2.toFixed(0)}mm の部分が接触・交差しています`,
    })
  }

  const lengthError = Math.abs(measuredLength(c) - nominalLength(c))
  return {
    minRadius,
    minRadiusS,
    minRatio,
    minRatioS,
    lengthError,
    maxSegmentError: maxSegmentError(c),
    issues,
    ok: !issues.some((i) => i.level === 'error'),
  }
}

/**
 * 中心軸上で十分離れた 2 点の外表面が重ならないかを調べる。
 * 弧長差が 2(r1 + r2) 以下の組は同じ曲がりの連続部分として、曲げ半径のチェックに任せる。
 */
export function findOverlap(c: Centerline, stations: Station[]): { s1: number; s2: number } | null {
  const stride = Math.max(1, Math.round(5 / c.segmentLength))
  const idx: number[] = []
  for (let k = 0; k < c.points.length; k += stride) idx.push(k)
  if (idx[idx.length - 1] !== c.points.length - 1) idx.push(c.points.length - 1)
  const s = idx.map((k) => k * c.segmentLength)
  const r = s.map((x) => diameterAt(stations, x, 'outer') / 2)
  for (let i = 0; i < idx.length; i++) {
    for (let j = i + 1; j < idx.length; j++) {
      const rr = r[i] + r[j]
      if (s[j] - s[i] <= 2 * rr) continue
      if (distance(c.points[idx[i]], c.points[idx[j]]) < rr) return { s1: s[i], s2: s[j] }
    }
  }
  return null
}
