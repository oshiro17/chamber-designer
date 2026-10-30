import { describe, expect, it } from 'vitest'
import { buildBentCenterline, type BendHandle } from './bend'
import { computeFabrication } from './fabrication'
import { computeProfile } from './profile'
import { SAMPLE_POINTS } from './sample'
import { buildPieces, planCuts, taperBreaks, type FabPiece } from './segmentation'
import { flatLength, jointMismatch, spaceLength, unrollPiece, type UnrolledPiece } from './unroll'
import { distance, normalize, type Vec3 } from './vec3'

const prof = computeProfile(SAMPLE_POINTS.map((p, i) => ({ id: String(i), ...p })), { diameterKind: 'outer', thickness: 1 })
if (!prof.ok) throw new Error()
const stations = prof.profile.stations
const L = prof.profile.length

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

describe('planCuts / buildPieces', () => {
  const handles: BendHandle[] = [
    { id: 'a', s: 250, width: 220, a: 0.9, b: 0 },
    { id: 'b', s: 700, width: 300, a: -1.0, b: 0.4 },
  ]
  const c = buildBentCenterline(L, handles)

  it('直径の折れ点では必ず切断する', () => {
    const { cuts } = planCuts(c, stations, { mode: 'auto', maxAngleDeg: 10, count: 0 })
    for (const b of taperBreaks(stations)) expect(cuts.some((s) => Math.abs(s - b) < 1e-9)).toBe(true)
  })

  it('自動分割では継ぎ目で隣り合う部品の軸の角度が指定角以下になる', () => {
    const { cuts } = planCuts(c, stations, { mode: 'auto', maxAngleDeg: 10, count: 0 })
    const fab = buildPieces(c, stations, cuts)
    for (let i = 1; i < fab.pieces.length; i++) {
      const a = fab.pieces[i - 1].dir
      const b = fab.pieces[i].dir
      const ang = (Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) * 180) / Math.PI
      expect(ang).toBeLessThan(10 + 1e-6)
    }
  })

  it('部品の軸長の合計は設計の全長と一致する', () => {
    const { cuts } = planCuts(c, stations, { mode: 'count', maxAngleDeg: 10, count: 20 })
    const fab = buildPieces(c, stations, cuts)
    expect(fab.pieces).toHaveLength(20)
    expect(fab.totalLength).toBeCloseTo(L, 9)
  })

  it('分割を細かくすると設計形状とのずれが小さくなる', () => {
    const coarse = buildPieces(c, stations, planCuts(c, stations, { mode: 'auto', maxAngleDeg: 20, count: 0 }).cuts)
    const fine = buildPieces(c, stations, planCuts(c, stations, { mode: 'auto', maxAngleDeg: 5, count: 0 }).cuts)
    expect(fine.maxDeviation).toBeLessThan(coarse.maxDeviation)
  })

  it('同径の円柱部の継ぎ目は隣の部品とぴったり合う', () => {
    const cc = buildBentCenterline(L, [{ id: 'x', s: 690, width: 140, a: 0.8, b: 0 }])
    const fab = buildPieces(cc, stations, planCuts(cc, stations, { mode: 'auto', maxAngleDeg: 10, count: 0 }).cuts)
    const cyl = fab.pieces.filter((p) => p.s0 >= 615 && p.s1 <= 765)
    expect(cyl.length).toBeGreaterThan(1)
    const a = ok(unrollPiece(cyl[0], { seam: 180, allowance: 0 }))
    const b = ok(unrollPiece(cyl[1], { seam: 180, allowance: 0 }))
    expect(jointMismatch(a, cyl[0], b, cyl[1])).toBeLessThan(0.05)
  })

  it('全部品で同じ角度にすると、溶接線が継ぎ目でつながって一本になる', () => {
    const fabr = computeFabrication(c, stations, { mode: 'auto', maxAngleDeg: 10, count: 0, seam: 180, allowance: 0 })
    expect(fabr.errors).toEqual([])
    for (let i = 0; i + 1 < fabr.unrolled.length; i++) {
      const gap = distance(fabr.unrolled[i].edge1_3d[0], fabr.unrolled[i + 1].edge0_3d[0])
      // テーパー部の斜め切断では切り口の形がわずかに異なるため、その差（合わせずれ）以内でつながる
      expect(gap).toBeLessThanOrEqual(fabr.mismatch[i] + 1e-6)
      const sameRadius = Math.abs(fabr.fab.pieces[i].r1 - fabr.fab.pieces[i + 1].r0) < 1e-9 && fabr.fab.pieces[i].r0 === fabr.fab.pieces[i].r1 && fabr.fab.pieces[i + 1].r0 === fabr.fab.pieces[i + 1].r1
      if (sameRadius) expect(gap).toBeLessThan(0.05)
    }
  })

  it('直線のチャンバーは測定点ごとの 7 部品になる', () => {
    const straight = buildBentCenterline(L, [])
    const { cuts } = planCuts(straight, stations, { mode: 'auto', maxAngleDeg: 10, count: 0 })
    expect(cuts).toEqual(stations.map((s) => s.s))
  })
})
