import { describe, expect, it } from 'vitest'
import { computeFabrication } from './fabrication'
import { foldedAxis } from './fold'
import { computeProfile } from './profile'
import { SAMPLE_POINTS } from './sample'
import type { FabPiece } from './segmentation'
import { flatLength, spaceLength, unrollPiece, type UnrolledPiece } from './unroll'
import { distance, normalize, type Vec3 } from './vec3'

const prof = computeProfile(SAMPLE_POINTS.map((p, i) => ({ id: String(i), ...p })), { diameterKind: 'outer', thickness: 1 })
if (!prof.ok) throw new Error()
const stations = prof.profile.stations

function piece(over: Partial<FabPiece>): FabPiece {
  return {
    index: 0,
    s0: 0,
    s1: 100,
    length: 100,
    start: [0, 0, 0],
    dir: [1, 0, 0],
    u: [0, 1, 0],
    v: [0, 0, 1],
    r0: 20,
    r1: 20,
    d0Outer: 41,
    d1Outer: 41,
    n0: [1, 0, 0],
    n1: [1, 0, 0],
    ...over,
  }
}
const ok = (r: ReturnType<typeof unrollPiece>): UnrolledPiece => {
  if (!r.ok) throw new Error(r.error)
  return r.piece
}

describe('unrollPiece: 直角切断', () => {
  it('円柱は 2πr × L の長方形', () => {
    const u = ok(unrollPiece(piece({}), { seam: 180, allowance: 0 }))
    expect(u.kind).toBe('cylinder')
    expect(u.bbox.maxX).toBeCloseTo(2 * Math.PI * 20, 6)
    expect(u.bbox.maxY).toBeCloseTo(100, 6)
  })

  it('円すい台は両端の円弧長が 2πr0, 2πr1、母線長が √(L² + (r1 - r0)²)', () => {
    const u = ok(unrollPiece(piece({ r0: 45, r1: 62.5, length: 165, s1: 165 }), { seam: 180, allowance: 0 }))
    expect(u.kind).toBe('cone')
    expect(flatLength(u.edge0)).toBeCloseTo(2 * Math.PI * 45, 2)
    expect(flatLength(u.edge1)).toBeCloseTo(2 * Math.PI * 62.5, 2)
    expect(u.generatorMin).toBeCloseTo(Math.hypot(165, 17.5), 9)
    expect(u.generatorMax).toBeCloseTo(Math.hypot(165, 17.5), 9)
    expect(u.slantRadius1! - u.slantRadius0!).toBeCloseTo(Math.hypot(165, 17.5), 9)
  })

  it('縮径の円すい台も同じ精度で展開できる', () => {
    const u = ok(unrollPiece(piece({ r0: 62, r1: 12, length: 260, s1: 260 }), { seam: 180, allowance: 0 }))
    expect(flatLength(u.edge0)).toBeCloseTo(2 * Math.PI * 62, 1)
    expect(flatLength(u.edge1)).toBeCloseTo(2 * Math.PI * 12, 2)
  })
})

describe('unrollPiece: 斜め切断の等長性', () => {
  const tilt = (deg: number): Vec3 => normalize([Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180), 0])
  const cases: [string, Partial<FabPiece>][] = [
    ['円柱・片側 20°', { n1: tilt(20) }],
    ['円柱・両側', { n0: tilt(-15), n1: tilt(25) }],
    ['拡大円すい・両側', { r0: 30, r1: 50, n0: tilt(-10), n1: tilt(20), length: 120, s1: 120 }],
    ['縮小円すい・ねじれた面', { r0: 50, r1: 20, n0: normalize([1, 0.1, 0.2]), n1: normalize([1, -0.3, 0.15]), length: 150, s1: 150 }],
  ]
  for (const [name, over] of cases) {
    it(`${name}: 展開図の切断線の長さが 3D の切断線の長さと一致する`, () => {
      const u = ok(unrollPiece(piece(over), { seam: 180, allowance: 0, samples: 720 }))
      const rel0 = Math.abs(flatLength(u.edge0) - spaceLength(u.edge0_3d)) / spaceLength(u.edge0_3d)
      const rel1 = Math.abs(flatLength(u.edge1) - spaceLength(u.edge1_3d)) / spaceLength(u.edge1_3d)
      expect(rel0).toBeLessThan(1e-3)
      expect(rel1).toBeLessThan(1e-3)
    })
    it(`${name}: 各母線の長さが展開図と 3D で一致する`, () => {
      const u = ok(unrollPiece(piece(over), { seam: 180, allowance: 0, samples: 90 }))
      for (let j = 0; j < u.edge0.length; j++) {
        const flat = Math.hypot(u.edge1[j][0] - u.edge0[j][0], u.edge1[j][1] - u.edge0[j][1])
        expect(flat).toBeCloseTo(distance(u.edge0_3d[j], u.edge1_3d[j]), 6)
      }
    })
  }

  it('溶接線は指定した角度の母線に置かれる（0° = u 方向、90° = v 方向）', () => {
    for (const [deg, axis] of [[0, [0, 1, 0]], [90, [0, 0, 1]], [180, [0, -1, 0]]] as const) {
      const u = ok(unrollPiece(piece({ n1: tilt(30) }), { seam: deg, allowance: 0 }))
      const p0 = u.edge0_3d[0]
      expect(p0[1] * axis[1] + p0[2] * axis[2]).toBeCloseTo(20, 6)
    }
  })

  it('溶接用の余白は外形を広げ、溶接位置の線を残す', () => {
    const base = ok(unrollPiece(piece({}), { seam: 180, allowance: 0 }))
    const wide = ok(unrollPiece(piece({}), { seam: 180, allowance: 10 }))
    expect(wide.bbox.maxX - base.bbox.maxX).toBeCloseTo(10, 6)
    expect(wide.seamLine).not.toBeNull()
  })

  it('切断面が部品内で交差する場合はエラーを返す', () => {
    const r = unrollPiece(piece({ length: 10, s1: 10, n0: tilt(-60), n1: tilt(60) }), { seam: 180, allowance: 0 })
    expect(r.ok).toBe(false)
  })
})

describe('測定点で折った部品の継ぎ目', () => {
  it('同じ太さの円柱どうしを折った継ぎ目は、隣の部品とぴったり合う', () => {
    // 外径 125 の円柱区間（615〜765）を 2 つに分け、その間（690）で 30° 折る
    const pts = [...SAMPLE_POINTS.slice(0, 6), { distance: 75, diameter: 125 }, { distance: 75, diameter: 125 }, SAMPLE_POINTS[7]]
    const pr2 = computeProfile(pts.map((p, i) => ({ id: String(i), ...p })), { diameterKind: 'outer', thickness: 1 })
    if (!pr2.ok) throw new Error()
    const st = pr2.profile.stations
    const ax = foldedAxis(st, st.map((_, i) => (i === 6 ? { a: Math.PI / 6, b: 0 } : undefined)))
    const fabr = computeFabrication(st, ax, { seam: 180, allowance: 0 })
    expect(fabr.mismatch[5]).toBeLessThan(0.05)
  })

  it('直線のチャンバーは測定点の数 − 1 の 7 部品になる', () => {
    const fabr = computeFabrication(stations, foldedAxis(stations, []), { seam: 180, allowance: 0 })
    expect(fabr.unrolled).toHaveLength(7)
  })
})
