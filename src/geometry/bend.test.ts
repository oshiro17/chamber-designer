import { describe, expect, it } from 'vitest'
import { bendCumulative, buildBentCenterline, handleFits, handleFromParams, handleMinRadius, handleParams, type BendHandle } from './bend'
import { maxSegmentError, measuredLength, pointAt } from './centerline'
import { computeProfile } from './profile'
import { SAMPLE_POINTS } from './sample'
import { checkShape } from './shapeCheck'
import { distance, dot, normalize, sub } from './vec3'

const L = 1025
const r = computeProfile(SAMPLE_POINTS.map((p, i) => ({ id: String(i), ...p })), { diameterKind: 'outer', thickness: 1 })
if (!r.ok) throw new Error()
const stations = r.profile.stations
const h = (s: number, a: number, b = 0, width = 200): BendHandle => ({ id: `h${s}`, s, width, a, b })

describe('bendCumulative', () => {
  it('分布の範囲外で 0 と 1、中心で 0.5', () => {
    expect(bendCumulative(0, 100, 50)).toBe(0)
    expect(bendCumulative(200, 100, 50)).toBe(1)
    expect(bendCumulative(100, 100, 50)).toBeCloseTo(0.5, 12)
  })
})

describe('buildBentCenterline: 曲げても中心軸長を維持する', () => {
  const cases: [string, BendHandle[]][] = [
    ['直線', []],
    ['上へ 60°', [h(300, Math.PI / 3)]],
    ['上下 S 字', [h(250, 0.8), h(700, -1.1, 0, 300)]],
    ['3D（上と左右の複合）', [h(250, 0.6, 0.5), h(600, -0.4, 0.9, 250), h(880, 0.3, -0.7, 150)]],
  ]
  for (const [name, hs] of cases) {
    it(name, () => {
      const c = buildBentCenterline(L, hs)
      expect(measuredLength(c)).toBeCloseTo(L, 6)
      expect(maxSegmentError(c)).toBeLessThan(1e-6)
      expect(c.points[0]).toEqual([0, 0, 0])
    })
  }

  it('入口の向きは常に +x', () => {
    const c = buildBentCenterline(L, [h(150, 1.0, 0.5, 200)])
    const t0 = normalize(sub(c.points[1], c.points[0]))
    expect(t0[0]).toBeGreaterThan(0.9999)
  })

  it('曲げ点 1 つで出口側の向きが指定角だけ変わる', () => {
    const c = buildBentCenterline(L, [h(400, Math.PI / 2)])
    const n = c.points.length
    const tEnd = normalize(sub(c.points[n - 1], c.points[n - 2]))
    expect(Math.acos(dot(tEnd, [1, 0, 0]))).toBeCloseTo(Math.PI / 2, 3)
    expect(tEnd[1]).toBeGreaterThan(0.999)
  })

  it('a だけの曲げは側面 (XY 平面) 内に留まる', () => {
    const c = buildBentCenterline(L, [h(300, 0.8), h(700, -0.5)])
    for (const p of c.points) expect(Math.abs(p[2])).toBeLessThan(1e-9)
  })

  it('測定点の弧長位置は曲げても変わらない（曲げ前後で pointAt の弧長が一致）', () => {
    const c = buildBentCenterline(L, [h(400, 1.2, 0.3)])
    for (const st of stations) {
      const k = st.s / c.segmentLength
      const lo = Math.floor(k)
      let arc = 0
      for (let i = 0; i < lo; i++) arc += distance(c.points[i], c.points[i + 1])
      if (lo < c.points.length - 1) arc += distance(c.points[lo], pointAt(c, st.s))
      expect(arc).toBeCloseTo(st.s, 6)
    }
  })

  it('最小曲げ半径の理論値と離散計算が一致する', () => {
    const hd = h(500, 1.0, 0, 300)
    const chk = checkShape(buildBentCenterline(L, [hd]), stations)
    expect(chk.minRadius).toBeCloseTo(handleMinRadius(hd), -1)
  })
})

describe('handleFromParams', () => {
  it('方向 0° は上、90° は手前（+z）に曲がる', () => {
    const up = buildBentCenterline(L, [handleFromParams('u', 500, 0, 45, 200)])
    const side = buildBentCenterline(L, [handleFromParams('s', 500, 90, 45, 200)])
    const end = (c: ReturnType<typeof buildBentCenterline>) => c.points[c.points.length - 1]
    expect(end(up)[1]).toBeGreaterThan(100)
    expect(Math.abs(end(up)[2])).toBeLessThan(1e-9)
    expect(end(side)[2]).toBeGreaterThan(100)
    expect(Math.abs(end(side)[1])).toBeLessThan(1e-6)
  })

  it('指定した半径が最小曲げ半径になり、パラメータを読み戻せる', () => {
    const h = handleFromParams('x', 500, 135, 60, 180)
    expect(handleMinRadius(h)).toBeCloseTo(180, 9)
    const p = handleParams(h)
    expect(p.phiDeg).toBeCloseTo(135, 9)
    expect(p.thetaDeg).toBeCloseTo(60, 9)
    expect(p.radius).toBeCloseTo(180, 9)
    const chk = checkShape(buildBentCenterline(L, [h]), stations)
    expect(chk.minRadius).toBeCloseTo(180, -1)
  })

  it('曲げ範囲が端からはみ出す場合は handleFits が false', () => {
    expect(handleFits(handleFromParams('a', 500, 0, 30, 200), L)).toBe(true)
    expect(handleFits(handleFromParams('b', 50, 0, 30, 200), L)).toBe(false)
  })
})

describe('checkShape', () => {
  it('直線は問題なし', () => {
    const chk = checkShape(buildBentCenterline(L, []), stations)
    expect(chk.ok).toBe(true)
    expect(chk.issues).toHaveLength(0)
  })

  it('外径の半分以下の曲げ半径はエラー', () => {
    const chk = checkShape(buildBentCenterline(L, [h(690, 2.5, 0, 100)]), stations)
    expect(chk.ok).toBe(false)
  })

  it('外径未満の曲げ半径は警告のみ', () => {
    const chk = checkShape(buildBentCenterline(L, [h(690, 1.0, 0, 200)]), stations)
    expect(chk.ok).toBe(true)
    expect(chk.issues.some((i) => i.level === 'warning')).toBe(true)
  })

  it('大きく巻き込んで自分に重なる形状はエラー', () => {
    const hs = [h(200, 2.9, 0, 300), h(600, 2.9, 0, 300)]
    const chk = checkShape(buildBentCenterline(L, hs), stations)
    expect(chk.ok).toBe(false)
  })
})
