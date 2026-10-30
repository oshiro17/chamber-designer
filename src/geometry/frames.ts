import { cross, dot, length, normalize, rotateAround, sub, type Vec3 } from './vec3'

export interface Frame {
  tangent: Vec3
  normal: Vec3
  binormal: Vec3
}

function initialNormal(t: Vec3): Vec3 {
  const ref: Vec3 = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1]
  return normalize(sub(ref, [t[0] * dot(ref, t), t[1] * dot(ref, t), t[2] * dot(ref, t)]))
}

/** 折れ線の各頂点に Parallel Transport Frame を配置する。曲がっても断面がねじれない */
export function parallelTransportFrames(points: Vec3[]): Frame[] {
  if (points.length < 2) throw new Error('フレーム計算には 2 点以上必要です')
  const tangents: Vec3[] = points.map((_, i) => {
    const a = points[Math.max(i - 1, 0)]
    const b = points[Math.min(i + 1, points.length - 1)]
    return normalize(sub(b, a))
  })

  const frames: Frame[] = []
  let normal = initialNormal(tangents[0])
  for (let i = 0; i < points.length; i++) {
    const t = tangents[i]
    if (i > 0) {
      const prev = tangents[i - 1]
      const axis = cross(prev, t)
      const sinA = length(axis)
      if (sinA > 1e-12) {
        const angle = Math.atan2(sinA, dot(prev, t))
        normal = rotateAround(normal, normalize(axis), angle)
      }
      normal = normalize(sub(normal, [t[0] * dot(normal, t), t[1] * dot(normal, t), t[2] * dot(normal, t)]))
    }
    frames.push({ tangent: t, normal, binormal: cross(t, normal) })
  }
  return frames
}
