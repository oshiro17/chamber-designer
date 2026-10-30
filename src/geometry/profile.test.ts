import { describe, expect, it } from 'vitest'
import { computeProfile, diameterAt, frustumVolume, mm3ToLiters, type MeasurementPoint, type ProfileSettings } from './profile'
import { SAMPLE_POINTS } from './sample'

const pts = (list: Omit<MeasurementPoint, 'id'>[]): MeasurementPoint[] => list.map((p, i) => ({ id: String(i), ...p }))
const inner: ProfileSettings = { diameterKind: 'inner', thickness: 1 }
const outer: ProfileSettings = { diameterKind: 'outer', thickness: 1 }

function numericVolume(points: MeasurementPoint[], settings: ProfileSettings, steps = 200_000): number {
  const r = computeProfile(points, settings)
  if (!r.ok) throw new Error('invalid')
  const { stations, length } = r.profile
  const h = length / steps
  let v = 0
  for (let k = 0; k < steps; k++) {
    const d = diameterAt(stations, (k + 0.5) * h, 'inner')
    v += (Math.PI * d * d * h) / 4
  }
  return v
}

describe('frustumVolume', () => {
  it('円柱の公式と一致する', () => {
    expect(frustumVolume(100, 40, 40)).toBeCloseTo(Math.PI * 20 * 20 * 100, 6)
  })
  it('円すい（d2 = 0）の公式と一致する', () => {
    expect(frustumVolume(90, 60, 0)).toBeCloseTo((Math.PI * 30 * 30 * 90) / 3, 6)
  })
})

describe('computeProfile（初期サンプル）', () => {
  const points = pts(SAMPLE_POINTS)

  it('全長は 1025mm', () => {
    const r = computeProfile(points, inner)
    expect(r.ok && r.profile.length).toBe(1025)
  })

  it('累積位置', () => {
    const r = computeProfile(points, inner)
    if (!r.ok) throw new Error()
    expect(r.profile.stations.map((s) => s.s)).toEqual([0, 150, 190, 320, 450, 615, 765, 1025])
  })

  it('直径を内径として扱った体積が数値積分と一致する', () => {
    const r = computeProfile(points, inner)
    if (!r.ok) throw new Error()
    expect(r.profile.volume).toBeCloseTo(numericVolume(points, inner), 0)
    expect(mm3ToLiters(r.profile.volume)).toBeCloseTo(5.7127, 4)
  })

  it('外径入力では板厚 2 枚分を引いた内径で体積を計算する', () => {
    const r = computeProfile(points, outer)
    if (!r.ok) throw new Error()
    expect(r.profile.stations[0]).toMatchObject({ outer: 40, inner: 38, mid: 39 })
    expect(r.profile.volume).toBeCloseTo(numericVolume(points, outer), 0)
  })
})

describe('validateProfile', () => {
  it('測定点が 1 点だけならエラー', () => {
    expect(computeProfile(pts([{ distance: 0, diameter: 40 }]), inner).ok).toBe(false)
  })
  it('未入力（NaN）は「未入力」としてエラーにする', () => {
    const r = computeProfile(pts([{ distance: 0, diameter: 40 }, { distance: NaN, diameter: NaN }]), inner)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues.map((i) => i.message).join()).toContain('未入力')
  })
  it('距離 0 や負の値はエラー', () => {
    const r = computeProfile(pts([{ distance: 0, diameter: 40 }, { distance: 0, diameter: 40 }]), inner)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues[0].pointIndex).toBe(1)
  })
  it('外径が板厚の 2 倍以下ならエラー', () => {
    const r = computeProfile(pts([{ distance: 0, diameter: 2 }, { distance: 10, diameter: 40 }]), outer)
    expect(r.ok).toBe(false)
  })
  it('先頭点の距離は無視して 0 から始める', () => {
    const r = computeProfile(pts([{ distance: 999, diameter: 40 }, { distance: 10, diameter: 40 }]), inner)
    expect(r.ok && r.profile.length).toBe(10)
  })
})
