export interface MeasurementPoint {
  id: string
  /** 前の測定点から中心軸に沿った距離 [mm]。先頭は常に 0 として扱う */
  distance: number
  /** 入力された直径 [mm]。外径か内径かは ProfileSettings.diameterKind による */
  diameter: number
}

export type DiameterKind = 'outer' | 'inner'

export interface ProfileSettings {
  diameterKind: DiameterKind
  /** 板厚 [mm] */
  thickness: number
}

export interface Station {
  index: number
  /** 中心軸に沿った累積位置 [mm] */
  s: number
  outer: number
  inner: number
  /** 板厚中心の直径。展開図はこの径で計算する */
  mid: number
}

export interface ProfileIssue {
  pointIndex: number | null
  message: string
}

export interface Profile {
  stations: Station[]
  length: number
  /** 内径で計算した内容積 [mm³] */
  volume: number
}

export type ProfileResult = { ok: true; profile: Profile } | { ok: false; issues: ProfileIssue[] }

export function validateProfile(points: MeasurementPoint[], settings: ProfileSettings): ProfileIssue[] {
  const issues: ProfileIssue[] = []
  const t = settings.thickness
  if (!Number.isFinite(t) || t < 0) issues.push({ pointIndex: null, message: '板厚は 0 以上の数値で入力してください' })
  if (points.length < 2) issues.push({ pointIndex: null, message: '「＋ 測定点を追加」で次の点を入力してください' })

  points.forEach((p, i) => {
    if (i > 0 && Number.isNaN(p.distance)) {
      issues.push({ pointIndex: i, message: `測定点 ${i + 1}: 距離が未入力です` })
    } else if (i > 0 && !(Number.isFinite(p.distance) && p.distance > 0)) {
      issues.push({ pointIndex: i, message: `測定点 ${i + 1}: 距離は 0 より大きい数値にしてください` })
    }
    if (Number.isNaN(p.diameter)) {
      issues.push({ pointIndex: i, message: `測定点 ${i + 1}: 直径が未入力です` })
    } else if (!(Number.isFinite(p.diameter) && p.diameter > 0)) {
      issues.push({ pointIndex: i, message: `測定点 ${i + 1}: 直径は 0 より大きい数値にしてください` })
    } else if (settings.diameterKind === 'outer' && Number.isFinite(t) && p.diameter - 2 * t <= 0) {
      issues.push({ pointIndex: i, message: `測定点 ${i + 1}: 外径 ${p.diameter}mm は板厚 ${t}mm の 2 倍以下のため内径を計算できません` })
    }
  })
  return issues
}

export function toStations(points: MeasurementPoint[], settings: ProfileSettings): Station[] {
  const t = settings.thickness
  let s = 0
  return points.map((p, i) => {
    if (i > 0) s += p.distance
    const outer = settings.diameterKind === 'outer' ? p.diameter : p.diameter + 2 * t
    const inner = settings.diameterKind === 'inner' ? p.diameter : p.diameter - 2 * t
    return { index: i, s, outer, inner, mid: outer - t }
  })
}

/** 円すい台（d1 = d2 なら円柱）の体積 V = πL/12 (d1² + d1·d2 + d2²) */
export function frustumVolume(length: number, d1: number, d2: number): number {
  return ((Math.PI * length) / 12) * (d1 * d1 + d1 * d2 + d2 * d2)
}

export function innerVolume(stations: Station[]): number {
  let v = 0
  for (let i = 0; i + 1 < stations.length; i++) {
    const a = stations[i]
    const b = stations[i + 1]
    v += frustumVolume(b.s - a.s, a.inner, b.inner)
  }
  return v
}

export const mm3ToLiters = (v: number): number => v / 1e6

export function computeProfile(points: MeasurementPoint[], settings: ProfileSettings): ProfileResult {
  const issues = validateProfile(points, settings)
  if (issues.length > 0) return { ok: false, issues }
  const stations = toStations(points, settings)
  return {
    ok: true,
    profile: { stations, length: stations[stations.length - 1].s, volume: innerVolume(stations) },
  }
}

export type DiameterField = 'outer' | 'inner' | 'mid'

/** 位置 s の直径を測定点間の線形補間で求める。範囲外は端の値 */
export function diameterAt(stations: Station[], s: number, field: DiameterField): number {
  if (s <= stations[0].s) return stations[0][field]
  const last = stations[stations.length - 1]
  if (s >= last.s) return last[field]
  let lo = 0
  let hi = stations.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (stations[mid].s <= s) lo = mid
    else hi = mid
  }
  const a = stations[lo]
  const b = stations[hi]
  const u = (s - a.s) / (b.s - a.s)
  return a[field] + (b[field] - a[field]) * u
}
