import { describe, expect, it } from 'vitest'
import { createStraightCenterline, maxSegmentError, measuredLength, nominalLength, pointAt } from './centerline'
import { parallelTransportFrames } from './frames'
import { computeProfile, diameterAt } from './profile'
import { SAMPLE_POINTS } from './sample'
import { buildTubeMesh } from './tubeMesh'
import { dot, length, type Vec3 } from './vec3'

const r = computeProfile(SAMPLE_POINTS.map((p, i) => ({ id: String(i), ...p })), { diameterKind: 'outer', thickness: 1 })
if (!r.ok) throw new Error('sample invalid')
const { stations, length: total } = r.profile

describe('createStraightCenterline', () => {
  it('全長が割り切れないときもセグメント長を調整して全長を厳密に保つ', () => {
    const c = createStraightCenterline(1023.7, 5)
    expect(nominalLength(c)).toBeCloseTo(1023.7, 9)
    expect(measuredLength(c)).toBeCloseTo(1023.7, 9)
    expect(maxSegmentError(c)).toBeLessThan(1e-9)
  })
  it('pointAt は弧長位置の点を返す', () => {
    const c = createStraightCenterline(total)
    expect(pointAt(c, 450)[0]).toBeCloseTo(450, 9)
  })
})

describe('parallelTransportFrames', () => {
  it('曲がった折れ線でも各フレームが正規直交', () => {
    const pts: Vec3[] = []
    for (let k = 0; k <= 60; k++) {
      const a = k * 0.05
      pts.push([100 * Math.sin(a), 100 * (1 - Math.cos(a)), k * 2])
    }
    for (const f of parallelTransportFrames(pts)) {
      expect(length(f.normal)).toBeCloseTo(1, 9)
      expect(dot(f.normal, f.tangent)).toBeCloseTo(0, 9)
      expect(dot(f.binormal, f.tangent)).toBeCloseTo(0, 9)
    }
  })
})

describe('buildTubeMesh', () => {
  const mesh = buildTubeMesh(createStraightCenterline(total), stations, 'outer', 5, 32)

  it('すべての測定点の位置にリングがある', () => {
    for (const st of stations) expect(mesh.ringS.some((s) => Math.abs(s - st.s) < 1e-9)).toBe(true)
  })

  it('各頂点の中心軸からの距離が外径 / 2 と一致する', () => {
    mesh.ringS.forEach((s, i) => {
      const rad = diameterAt(stations, s, 'outer') / 2
      for (let j = 0; j < mesh.radialSegments; j++) {
        const o = (i * mesh.radialSegments + j) * 3
        expect(mesh.positions[o]).toBeCloseTo(s, 3)
        expect(Math.hypot(mesh.positions[o + 1], mesh.positions[o + 2])).toBeCloseTo(rad, 3)
      }
    })
  })

  it('インデックスが頂点数の範囲内', () => {
    const nVert = mesh.positions.length / 3
    expect(Math.max(...mesh.indices)).toBeLessThan(nVert)
  })
})
