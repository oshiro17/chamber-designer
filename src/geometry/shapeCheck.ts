import type { Centerline } from './centerline'
import { diameterAt, type Station } from './profile'
import { distance } from './vec3'

export interface ShapeIssue {
  level: 'error' | 'warning'
  message: string
  s?: number
}

export interface ShapeCheck {
  issues: ShapeIssue[]
  ok: boolean
}

/** 折った形がチャンバー自身と接触・交差していないかを調べる */
export function checkShape(c: Centerline, stations: Station[]): ShapeCheck {
  const issues: ShapeIssue[] = []
  const overlap = findOverlap(c, stations)
  if (overlap) {
    issues.push({
      level: 'error',
      s: overlap.s1,
      message: `s=${overlap.s1.toFixed(0)}mm と s=${overlap.s2.toFixed(0)}mm の部分が接触・交差しています`,
    })
  }
  return { issues, ok: !issues.some((i) => i.level === 'error') }
}

/**
 * 中心軸上で十分離れた 2 点の外表面が重ならないかを調べる。
 * 弧長差が 2(r1 + r2) 以下の組は継ぎ目をはさんだ隣どうしとして除く。
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
