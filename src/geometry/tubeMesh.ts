import { pointAt, type Centerline } from './centerline'
import { parallelTransportFrames } from './frames'
import { diameterAt, type DiameterField, type Station } from './profile'
import { add, scale, type Vec3 } from './vec3'

export interface TubeMesh {
  positions: Float32Array
  indices: Uint32Array
  /** 各リングの弧長位置 */
  ringS: number[]
  radialSegments: number
}

/** 等間隔のサンプル位置に測定点の位置を加える。直径の折れ点を必ずリングに含めるため */
export function sampleArcPositions(stations: Station[], step: number): number[] {
  const total = stations[stations.length - 1].s
  const set = new Set<number>()
  const n = Math.max(1, Math.ceil(total / step))
  for (let k = 0; k <= n; k++) set.add((total * k) / n)
  for (const st of stations) set.add(st.s)
  const sorted = [...set].sort((a, b) => a - b)
  return sorted.filter((s, i) => i === 0 || s - sorted[i - 1] > 1e-6)
}

export function buildTubeMesh(
  centerline: Centerline,
  stations: Station[],
  field: DiameterField = 'outer',
  step = 5,
  radialSegments = 48,
): TubeMesh {
  const ringS = sampleArcPositions(stations, step)
  const centers: Vec3[] = ringS.map((s) => pointAt(centerline, s))
  const frames = parallelTransportFrames(centers)

  const positions = new Float32Array(ringS.length * radialSegments * 3)
  let p = 0
  ringS.forEach((s, i) => {
    const r = diameterAt(stations, s, field) / 2
    const { normal, binormal } = frames[i]
    for (let j = 0; j < radialSegments; j++) {
      const a = (2 * Math.PI * j) / radialSegments
      const v = add(centers[i], add(scale(normal, r * Math.cos(a)), scale(binormal, r * Math.sin(a))))
      positions[p++] = v[0]
      positions[p++] = v[1]
      positions[p++] = v[2]
    }
  })

  const indices = new Uint32Array((ringS.length - 1) * radialSegments * 6)
  let q = 0
  for (let i = 0; i + 1 < ringS.length; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * radialSegments + j
      const b = i * radialSegments + ((j + 1) % radialSegments)
      const c = a + radialSegments
      const d = b + radialSegments
      indices[q++] = a
      indices[q++] = c
      indices[q++] = b
      indices[q++] = b
      indices[q++] = c
      indices[q++] = d
    }
  }
  return { positions, indices, ringS, radialSegments }
}
