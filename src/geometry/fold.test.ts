import { describe, expect, it } from 'vitest'
import { measuredLength } from './centerline'
import { computeFabrication } from './fabrication'
import { axisPoint, buildFoldedCenterline, buildFoldPieces, foldedAxis, foldFromParams, foldParams } from './fold'
import { computeProfile } from './profile'
import { SAMPLE_POINTS } from './sample'
import { checkShape } from './shapeCheck'
import { add, distance, dot, scale, type Vec3 } from './vec3'

const pr = computeProfile(SAMPLE_POINTS.map((p, i) => ({ id: String(i), ...p })), { diameterKind: 'outer', thickness: 1 })
if (!pr.ok) throw new Error()
const { stations, length: L } = pr.profile
const at = (folds: Record<number, { phi: number; theta: number }>) =>
  stations.map((_, i) => (folds[i] ? foldFromParams('f', String(i), folds[i].phi, folds[i].theta) : undefined))

describe('foldedAxis', () => {
  it('折れがなければ x 軸上の直線', () => {
    const ax = foldedAxis(stations, at({}))
    for (const d of ax.dirs) expect(d).toEqual([1, 0, 0])
    expect(axisPoint(ax, stations, L)[0]).toBeCloseTo(L, 9)
  })

  it('方向 0° は上、90° は手前（+z）に、指定した角度だけ折れる', () => {
    const up = foldedAxis(stations, at({ 4: { phi: 0, theta: 30 } }))
    const side = foldedAxis(stations, at({ 4: { phi: 90, theta: 30 } }))
    const ang = (a: Vec3, b: Vec3) => (Math.acos(Math.min(1, dot(a, b))) * 180) / Math.PI
    expect(ang(up.dirs[3], up.dirs[4])).toBeCloseTo(30, 9)
    expect(up.dirs[4][1]).toBeGreaterThan(0.49)
    expect(side.dirs[4][2]).toBeGreaterThan(0.49)
    // 折れる測定点より前の区間は変わらない
    expect(up.dirs[3]).toEqual([1, 0, 0])
  })

  it('各区間の長さは測定点の間隔のまま', () => {
    const ax = foldedAxis(stations, at({ 3: { phi: 0, theta: 25 }, 5: { phi: 120, theta: 40 } }))
    for (let j = 0; j + 1 < ax.starts.length; j++) {
      expect(distance(ax.starts[j], ax.starts[j + 1])).toBeCloseTo(stations[j + 1].s - stations[j].s, 9)
    }
  })

  it('方向と角度を読み戻せる', () => {
    const p = foldParams(foldFromParams('f', 'p', 135, 22))
    expect(p.phiDeg).toBeCloseTo(135, 9)
    expect(p.thetaDeg).toBeCloseTo(22, 9)
  })
})

describe('buildFoldPieces: 部品は必ず「測定点の数 − 1」個', () => {
  const cases: [string, Record<number, { phi: number; theta: number }>][] = [
    ['直線', {}],
    ['1 か所で上へ 30°', { 5: { phi: 0, theta: 30 } }],
    ['3D に 3 か所', { 2: { phi: 0, theta: 15 }, 4: { phi: 90, theta: 25 }, 6: { phi: 200, theta: 35 } }],
  ]
  for (const [name, folds] of cases) {
    it(name, () => {
      const ax = foldedAxis(stations, at(folds))
      const fab = buildFoldPieces(stations, ax)
      expect(fab.pieces).toHaveLength(stations.length - 1)
      expect(fab.totalLength).toBeCloseTo(L, 9)
      fab.pieces.forEach((p, i) => {
        expect(p.s0).toBe(stations[i].s)
        expect(p.s1).toBe(stations[i + 1].s)
        // 部品の終点が次の部品の始点に一致する（設計とのずれ 0）
        if (i + 1 < fab.pieces.length) expect(distance(add(p.start, scale(p.dir, p.length)), fab.pieces[i + 1].start)).toBeLessThan(1e-9)
      })
      expect(fab.maxDeviation).toBe(0)
    })
  }

  it('継ぎ目の折れ角は指定した角度で、折れていない継ぎ目は 0°', () => {
    const fab = buildFoldPieces(stations, foldedAxis(stations, at({ 5: { phi: 0, theta: 30 } })))
    expect(fab.maxMiterDeg * 2).toBeCloseTo(30, 9)
    expect(fab.pieces[2].n1).toEqual(fab.pieces[2].dir)
  })
})

describe('展開と溶接線', () => {
  it('折った形でも全部品を展開でき、溶接線が継ぎ目でつながる', () => {
    const ax = foldedAxis(stations, at({ 4: { phi: 0, theta: 25 }, 6: { phi: 90, theta: 20 } }))
    const f = computeFabrication(stations, ax, { seam: 180, allowance: 0 })
    expect(f.errors).toEqual([])
    expect(f.unrolled).toHaveLength(stations.length - 1)
    for (let i = 0; i + 1 < f.unrolled.length; i++) {
      expect(distance(f.unrolled[i].edge1_3d[0], f.unrolled[i + 1].edge0_3d[0])).toBeLessThanOrEqual(f.mismatch[i] + 1e-6)
    }
  })
})

describe('表示用の点列と形状チェック', () => {
  it('点列は測定点の位置を通る', () => {
    const ax = foldedAxis(stations, at({ 5: { phi: 0, theta: 30 } }))
    const c = buildFoldedCenterline(stations, ax)
    expect(c.points[c.points.length - 1]).toEqual(axisPoint(ax, stations, L))
    expect(measuredLength(c)).toBeLessThanOrEqual(L + 1e-9)
  })

  it('大きく折り返して自分に重なる形はエラー', () => {
    const ax = foldedAxis(stations, at({ 4: { phi: 0, theta: 80 }, 5: { phi: 0, theta: 80 }, 6: { phi: 0, theta: 80 } }))
    expect(checkShape(buildFoldedCenterline(stations, ax), stations).ok).toBe(false)
  })

  it('ゆるい折れは問題なし', () => {
    const ax = foldedAxis(stations, at({ 5: { phi: 0, theta: 30 } }))
    expect(checkShape(buildFoldedCenterline(stations, ax), stations).ok).toBe(true)
  })
})
