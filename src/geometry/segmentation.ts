import { pointAt, type Centerline } from './centerline'
import { nodeRadii } from './shapeCheck'
import { diameterAt, type Station } from './profile'
import { add, cross, distance, dot, length as vlen, normalize, rotateAround, scale, sub, type Vec3 } from './vec3'

export interface SegmentationSettings {
  mode: 'auto' | 'count'
  /** 自動分割で隣り合う部品の軸がなす角の上限 [deg] */
  maxAngleDeg: number
  /** 分割数指定モードの部品数 */
  count: number
}

/** 区間 [s0, s1] での中心軸の曲がり角の合計 [rad] */
function turningProfile(c: Centerline): number[] {
  const radii = nodeRadii(c)
  const cum = [0]
  for (let k = 1; k < c.points.length; k++) {
    const R = radii[k - 1]
    cum.push(cum[k - 1] + (Number.isFinite(R) ? c.segmentLength / R : 0))
  }
  return cum
}

function cumAt(c: Centerline, cum: number[], s: number): number {
  const x = Math.min(Math.max(s / c.segmentLength, 0), cum.length - 1)
  const k = Math.min(Math.floor(x), cum.length - 2)
  return cum[k] + (cum[k + 1] - cum[k]) * (x - k)
}

/** 累積曲がり角が t になる位置を二分探索で求める */
function sAtCum(c: Centerline, cum: number[], t: number, lo: number, hi: number): number {
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (cumAt(c, cum, mid) < t) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** 直径の傾きが変わる測定点（円すい台の境界） */
export function taperBreaks(stations: Station[]): number[] {
  const out = [stations[0].s]
  for (let i = 1; i + 1 < stations.length; i++) {
    const a = stations[i - 1]
    const b = stations[i]
    const n = stations[i + 1]
    const k0 = (b.mid - a.mid) / (b.s - a.s)
    const k1 = (n.mid - b.mid) / (n.s - b.s)
    if (Math.abs(k0 - k1) > 1e-9) out.push(b.s)
  }
  out.push(stations[stations.length - 1].s)
  return out
}

export interface CutPlan {
  cuts: number[]
  /** 直径の折れ点の数から決まる最小部品数 */
  minCount: number
}

/**
 * 切断位置を決める。直径の折れ点では必ず切り、その間は曲がり角が均等になるよう分ける。
 * 曲がりのない区間は 1 部品のまま。
 */
export function planCuts(c: Centerline, stations: Station[], settings: SegmentationSettings): CutPlan {
  const breaks = taperBreaks(stations)
  const cum = turningProfile(c)
  const spans = breaks.slice(0, -1).map((s0, i) => {
    const s1 = breaks[i + 1]
    return { s0, s1, turn: cumAt(c, cum, s1) - cumAt(c, cum, s0), m: 1 }
  })
  const minCount = spans.length

  const build = () => {
    const cuts: number[] = [breaks[0]]
    const spanOf: number[] = []
    spans.forEach((sp, si) => {
      const c0 = cumAt(c, cum, sp.s0)
      for (let j = 1; j < sp.m; j++) {
        cuts.push(sp.turn > 1e-9 ? sAtCum(c, cum, c0 + (sp.turn * j) / sp.m, sp.s0, sp.s1) : sp.s0 + ((sp.s1 - sp.s0) * j) / sp.m)
      }
      cuts.push(sp.s1)
      for (let j = 0; j < sp.m; j++) spanOf.push(si)
    })
    return { cuts, spanOf }
  }

  if (settings.mode === 'auto') {
    const maxA = (Math.max(settings.maxAngleDeg, 1) * Math.PI) / 180
    for (const sp of spans) sp.m = Math.max(1, Math.ceil(sp.turn / maxA - 1e-9))
    // 弦の向きは曲率が一様でない部品で中央の接線からずれるため、継ぎ目の角度で確かめながら分割を増やす
    for (let iter = 0; iter < 400; iter++) {
      const { cuts, spanOf } = build()
      const dirs = cuts.slice(0, -1).map((s0, i) => normalize(sub(pointAt(c, cuts[i + 1]), pointAt(c, s0))))
      let worst = -1
      let worstAng = maxA
      for (let i = 1; i < dirs.length; i++) {
        const ang = Math.acos(Math.min(1, dot(dirs[i - 1], dirs[i])))
        if (ang > worstAng + 1e-9) {
          worstAng = ang
          worst = i
        }
      }
      if (worst < 0) break
      const a = spans[spanOf[worst - 1]]
      const b = spans[spanOf[worst]]
      const pick = a.turn / a.m >= b.turn / b.m ? a : b
      if (pick.turn < 1e-9) break
      pick.m++
    }
  } else {
    let extra = Math.max(0, Math.round(settings.count) - minCount)
    while (extra-- > 0) {
      let best = spans[0]
      for (const sp of spans) if (sp.turn / sp.m > best.turn / best.m) best = sp
      if (best.turn < 1e-9) {
        let longest = spans[0]
        for (const sp of spans) if ((sp.s1 - sp.s0) / sp.m > (longest.s1 - longest.s0) / longest.m) longest = sp
        best = longest
      }
      best.m++
    }
  }

  return { cuts: build().cuts, minCount }
}

export interface FabPiece {
  index: number
  s0: number
  s1: number
  /** 部品の軸長 = 設計中心軸の弧長 s1 - s0 */
  length: number
  start: Vec3
  dir: Vec3
  /** 円周方向の基準。隣の部品とは継ぎ目をまたいで平行移動で対応させる */
  u: Vec3
  v: Vec3
  /** 板厚中心の半径 */
  r0: number
  r1: number
  /** 外径 */
  d0Outer: number
  d1Outer: number
  /** 始端・終端の切断面の法線（軸方向を向く） */
  n0: Vec3
  n1: Vec3
}

export interface FabResult {
  pieces: FabPiece[]
  /** 製作形状の中心軸と設計中心軸の最大の位置ずれ [mm] */
  maxDeviation: number
  maxDeviationS: number
  /** 出口位置のずれ [mm] */
  endDeviation: number
  /** 製作形状の中心軸長の合計 */
  totalLength: number
  maxMiterDeg: number
}

function rotationBetween(a: Vec3, b: Vec3, v: Vec3): Vec3 {
  const ax = cross(a, b)
  const s = vlen(ax)
  if (s < 1e-12) return v
  return rotateAround(v, scale(ax, 1 / s), Math.atan2(s, dot(a, b)))
}

/**
 * 切断位置ごとに直線の円すい台（円柱）部品を作る。
 * 各部品の軸長は設計の弧長と等しくし、向きは設計中心軸の弦の向きに合わせる。
 * 継ぎ目の切断面は前後の軸の二等分面（エビ管と同じ構成）。
 */
export function buildPieces(c: Centerline, stations: Station[], cuts: number[]): FabResult {
  const dirs: Vec3[] = []
  for (let i = 0; i + 1 < cuts.length; i++) dirs.push(normalize(sub(pointAt(c, cuts[i + 1]), pointAt(c, cuts[i]))))

  const ref: Vec3 = Math.abs(dirs[0][1]) < 0.9 ? [0, 1, 0] : [0, 0, 1]
  let u = normalize(sub(ref, scale(dirs[0], dot(ref, dirs[0]))))
  let start: Vec3 = pointAt(c, cuts[0])
  const pieces: FabPiece[] = []
  let maxMiter = 0
  for (let i = 0; i < dirs.length; i++) {
    const d = dirs[i]
    if (i > 0) {
      u = normalize(rotationBetween(dirs[i - 1], d, u))
      maxMiter = Math.max(maxMiter, Math.acos(Math.min(1, dot(dirs[i - 1], d))))
    }
    const s0 = cuts[i]
    const s1 = cuts[i + 1]
    const n0 = i === 0 ? d : normalize(add(dirs[i - 1], d))
    const n1 = i === dirs.length - 1 ? d : normalize(add(d, dirs[i + 1]))
    pieces.push({
      index: i,
      s0,
      s1,
      length: s1 - s0,
      start,
      dir: d,
      u,
      v: cross(d, u),
      r0: diameterAt(stations, s0, 'mid') / 2,
      r1: diameterAt(stations, s1, 'mid') / 2,
      d0Outer: diameterAt(stations, s0, 'outer'),
      d1Outer: diameterAt(stations, s1, 'outer'),
      n0,
      n1,
    })
    start = add(start, scale(d, s1 - s0))
  }

  let maxDeviation = 0
  let maxDeviationS = 0
  const total = cuts[cuts.length - 1]
  const n = Math.max(200, Math.ceil(total / 2))
  let pi = 0
  for (let k = 0; k <= n; k++) {
    const s = (total * k) / n
    while (pi < pieces.length - 1 && s > pieces[pi].s1) pi++
    const p = pieces[pi]
    const q = add(p.start, scale(p.dir, s - p.s0))
    const dev = distance(q, pointAt(c, s))
    if (dev > maxDeviation) {
      maxDeviation = dev
      maxDeviationS = s
    }
  }
  const last = pieces[pieces.length - 1]
  return {
    pieces,
    maxDeviation,
    maxDeviationS,
    endDeviation: distance(add(last.start, scale(last.dir, last.length)), pointAt(c, total)),
    totalLength: pieces.reduce((acc, p) => acc + p.length, 0),
    maxMiterDeg: (maxMiter * 180) / Math.PI / 2,
  }
}
