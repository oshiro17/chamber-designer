import { describe, expect, it } from 'vitest'
import { foldedAxis } from './fold'
import { computeFabrication } from './fabrication'
import { computeProfile } from './profile'
import { rollData, rolledPositions } from './rolling'
import { SAMPLE_POINTS } from './sample'
import { distance, dot, sub, type Vec3 } from './vec3'

const pr = computeProfile(SAMPLE_POINTS.map((p, i) => ({ id: String(i), ...p })), { diameterKind: 'outer', thickness: 1 })
if (!pr.ok) throw new Error()
// 測定点 5（450mm）で上へ 25°、測定点 6（615mm）で手前へ 20° 折った形
const axis = foldedAxis(pr.profile.stations, pr.profile.stations.map((_, i) => (i === 4 ? { a: 0.44, b: 0 } : i === 5 ? { a: 0, b: 0.35 } : undefined)))
const fabr = computeFabrication(pr.profile.stations, axis, { seam: 90, allowance: 0 })

const at = (a: Float32Array, j: number): Vec3 => [a[j], a[j + 1], a[j + 2]]

describe('rolledPositions', () => {
  it('丸め終わり（1）は展開計算の 3D 形状と一致する', () => {
    fabr.unrolled.forEach((u, k) => {
      const d = rollData(u, fabr.fab.pieces[k])
      const out = new Float32Array(u.edge0_3d.length * 6)
      rolledPositions(d, 1, out)
      for (let i = 0; i < u.edge0_3d.length; i++) {
        expect(distance(at(out, i * 6), u.edge0_3d[i])).toBeLessThan(1e-3)
        expect(distance(at(out, i * 6 + 3), u.edge1_3d[i])).toBeLessThan(1e-3)
      }
    })
  })

  it('丸め始め（ほぼ 0）は平らで、幅は円周の長さになる', () => {
    const u = fabr.unrolled[0]
    const p = fabr.fab.pieces[0]
    const d = rollData(u, p)
    const out = new Float32Array(u.edge0_3d.length * 6)
    rolledPositions(d, 0, out)
    const n = u.edge0_3d.length
    // すべての点が、中央の点で筒に接する平面上にある
    const mid = at(out, Math.floor(n / 2) * 6)
    for (let i = 0; i < n; i++) expect(Math.abs(dot(sub(at(out, i * 6), mid), d.m))).toBeLessThan(0.5)
    // 端から端までの距離が板厚中心の円周 2πr に近い
    expect(distance(at(out, 0), at(out, (n - 1) * 6))).toBeCloseTo(2 * Math.PI * p.r0, -1)
  })
})
