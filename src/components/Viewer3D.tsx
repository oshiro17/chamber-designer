import { Environment, Line, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { pointAt, type Centerline } from '../geometry/centerline'
import type { Fabrication } from '../geometry/fabrication'
import { parallelTransportFrames, type Frame } from '../geometry/frames'
import { diameterAt, type Profile, type Station } from '../geometry/profile'
import { buildTubeMesh } from '../geometry/tubeMesh'
import { add, distance, dot, normalize, scale, sub, type Vec3 } from '../geometry/vec3'
import { useDesignStore } from '../store/designStore'

interface Props {
  profile: Profile
  centerline: Centerline
  fabrication?: Fabrication | null
}

interface Ring {
  pts: Vec3[]
  top: Vec3
  st: Station
}

const frameAt = (frames: Frame[], c: Centerline, s: number) => frames[Math.min(Math.round(s / c.segmentLength), frames.length - 1)]

export function Viewer3D({ profile, centerline, fabrication }: Props) {
  const labelRefs = useRef<(HTMLDivElement | null)[]>([])
  const fit = useDesignStore((s) => s.fit)

  const frames = useMemo(() => parallelTransportFrames(centerline.points), [centerline])
  const rings = useMemo<Ring[]>(
    () =>
      profile.stations.map((st) => {
        const c = pointAt(centerline, st.s)
        const f = frameAt(frames, centerline, st.s)
        const r = st.outer / 2 + 0.6
        const pts: Vec3[] = []
        for (let k = 0; k <= 64; k++) {
          const a = (2 * Math.PI * k) / 64
          pts.push(add(c, add(scale(f.normal, r * Math.cos(a)), scale(f.binormal, r * Math.sin(a)))))
        }
        return { pts, top: add(c, scale(f.normal, r + 8)), st }
      }),
    [centerline, frames, profile.stations],
  )

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Canvas dpr={[1, 2]} camera={{ fov: 40, near: 1, far: 50000, position: [0, 400, 2000] }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}>
        <color attach="background" args={['#1a1d22']} />
        <StudioEnvironment />
        <ambientLight intensity={0.15} />
        <directionalLight position={[300, 800, 500]} intensity={1.2} />
        <Chamber profile={profile} centerline={centerline} frames={frames} rings={rings} fabrication={fabrication} />
        <Grid profile={profile} centerline={centerline} />
        <OrbitControls makeDefault enableDamping />
        <FitCamera centerline={centerline} profile={profile} />
        <LabelProjector anchors={rings.map((r) => r.top)} refs={labelRefs} />
      </Canvas>

      <div className="pointer-events-none absolute inset-0">
        {rings.map(({ st }, i) => (
          <div
            key={st.index}
            ref={(el) => {
              labelRefs.current[i] = el
            }}
            style={{ visibility: 'hidden', font: '11px/1.2 monospace' }}
            className="absolute left-0 top-0 whitespace-nowrap rounded bg-white/85 px-1 text-black"
          >
            {st.index + 1}: ⌀{st.outer.toFixed(1)} s={st.s.toFixed(0)}
          </div>
        ))}
      </div>
      <button className="btn absolute right-2 top-2" onClick={fit}>
        全体表示
      </button>
    </div>
  )
}

function Grid({ profile, centerline }: { profile: Profile; centerline: Centerline }) {
  const minY = useMemo(() => {
    let m = Infinity
    for (const p of centerline.points) m = Math.min(m, p[1])
    return m - profile.stations.reduce((acc, s) => Math.max(acc, s.outer), 0) / 2 - 20
  }, [centerline, profile])
  return <gridHelper args={[profile.length * 3, 60, '#3a404a', '#262a31']} position={[profile.length / 2, minY, 0]} />
}

function nearestS(c: Centerline, p: Vec3): number {
  let best = 0
  let bd = Infinity
  c.points.forEach((q, k) => {
    const d = distance(p, q)
    if (d < bd) {
      bd = d
      best = k
    }
  })
  return best * c.segmentLength
}

function toGeometry(pos: Float32Array, idx: Uint32Array, normals: boolean): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setIndex(new THREE.BufferAttribute(idx, 1))
  if (normals) g.computeVertexNormals()
  return g
}

function Chamber({ profile, centerline, frames, rings, fabrication }: Props & { frames: Frame[]; rings: Ring[] }) {
  const tab = useDesignStore((s) => s.tab)
  const draft = useDesignStore((s) => s.draft)
  const pickS = useDesignStore((s) => s.pickS)

  const geometry = useMemo(() => {
    const m = buildTubeMesh(centerline, profile.stations, 'outer')
    return toGeometry(m.positions, m.indices, true)
  }, [centerline, profile.stations])
  useEffect(() => () => geometry.dispose(), [geometry])

  // 細い部分も指でタップできるよう、一回り太い透明な当たり判定を置く
  const pickGeometry = useMemo(() => {
    const st = profile.stations.map((s) => ({ ...s, outer: Math.max(s.outer + 30, s.outer * 1.3) }))
    const m = buildTubeMesh(centerline, st, 'outer', 10, 16)
    return toGeometry(m.positions, m.indices, false)
  }, [centerline, profile.stations])
  useEffect(() => () => pickGeometry.dispose(), [pickGeometry])

  const picking = tab === 'bend' && draft?.step === 'pick'
  const onPick = (e: ThreeEvent<MouseEvent>) => {
    if (!picking) return
    e.stopPropagation()
    pickS(nearestS(centerline, [e.point.x, e.point.y, e.point.z]))
  }
  const showFab = tab === 'unroll' && fabrication && fabrication.errors.length === 0

  return (
    <group>
      {picking && (
        <mesh geometry={pickGeometry} onClick={onPick}>
          <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color="#b8bec6"
          metalness={0.9}
          roughness={0.32}
          side={THREE.DoubleSide}
          transparent={!!showFab}
          opacity={showFab ? 0.18 : 1}
          depthWrite={!showFab}
        />
      </mesh>
      {showFab && <FabPieces fabrication={fabrication} />}

      <Line points={centerline.points as [number, number, number][]} color="#f59e0b" lineWidth={1.5} dashed dashSize={12} gapSize={6} depthTest={false} renderOrder={2} />
      {rings.map(({ pts, st }) => (
        <Line key={st.index} points={pts as [number, number, number][]} color="#38bdf8" lineWidth={1.5} />
      ))}

      {tab === 'bend' && draft?.step === 'pick' && draft.s !== null && <PickMarker centerline={centerline} frames={frames} profile={profile} s={draft.s} />}
      {tab === 'bend' && draft && draft.step !== 'pick' && (
        <>
          <PickMarker centerline={centerline} frames={frames} profile={profile} s={draft.s} />
          <DirectionArrow centerline={centerline} frames={frames} profile={profile} s={draft.s} phiDeg={draft.phiDeg} />
        </>
      )}
    </group>
  )
}

function PickMarker({ centerline, frames, profile, s }: { centerline: Centerline; frames: Frame[]; profile: Profile; s: number }) {
  const c = pointAt(centerline, s)
  const f = frameAt(frames, centerline, s)
  const r = diameterAt(profile.stations, s, 'outer') / 2 + 4
  const pts: Vec3[] = []
  for (let k = 0; k <= 64; k++) {
    const a = (2 * Math.PI * k) / 64
    pts.push(add(c, add(scale(f.normal, r * Math.cos(a)), scale(f.binormal, r * Math.sin(a)))))
  }
  return <Line points={pts as [number, number, number][]} color="#ff3030" lineWidth={4} depthTest={false} renderOrder={5} />
}

/** 曲げる方向を示す矢印。方向は位置 s での軸まわりの角度（0° = 上, 90° = 手前） */
function DirectionArrow({ centerline, frames, profile, s, phiDeg }: { centerline: Centerline; frames: Frame[]; profile: Profile; s: number; phiDeg: number }) {
  const ph = (phiDeg * Math.PI) / 180
  const f = frameAt(frames, centerline, s)
  const dir = add(scale(f.normal, Math.cos(ph)), scale(f.binormal, Math.sin(ph)))
  const origin = pointAt(centerline, s)
  const len = diameterAt(profile.stations, s, 'outer') / 2 + Math.max(150, profile.length * 0.2)
  const tip = add(origin, scale(dir, len))
  const head = useMemo(() => {
    const g = new THREE.ConeGeometry(18, 50, 16)
    g.translate(0, -25, 0)
    return g
  }, [])
  useEffect(() => () => head.dispose(), [head])
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...(dir as [number, number, number])))
  return (
    <>
      <Line points={[origin, tip] as [number, number, number][]} color="#ff3030" lineWidth={6} depthTest={false} renderOrder={6} />
      <mesh geometry={head} position={tip as [number, number, number]} quaternion={quat} renderOrder={6}>
        <meshBasicMaterial color="#ff3030" depthTest={false} />
      </mesh>
    </>
  )
}

const PIECE_COLORS = ['#f59e0b', '#38bdf8']

function FabPieces({ fabrication }: { fabrication: Fabrication }) {
  const geoms = useMemo(
    () =>
      fabrication.unrolled.map((u) => {
        const n = u.edge0_3d.length
        const pos = new Float32Array(n * 2 * 3)
        u.edge0_3d.forEach((p, i) => pos.set(p, i * 6))
        u.edge1_3d.forEach((p, i) => pos.set(p, i * 6 + 3))
        const idx = new Uint32Array((n - 1) * 6)
        for (let i = 0; i + 1 < n; i++) idx.set([i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2], i * 6)
        return toGeometry(pos, idx, true)
      }),
    [fabrication],
  )
  useEffect(() => () => geoms.forEach((g) => g.dispose()), [geoms])

  // 展開図の両端（丸めたときの縦の合わせ目）は各切断線の先頭の点を結ぶ母線。表面に埋もれないよう少し外へ出す
  const seams = useMemo(
    () =>
      fabrication.unrolled.map((u, i) => {
        const p = fabrication.fab.pieces[i]
        return [u.edge0_3d[0], u.edge1_3d[0]].map((x) => {
          const rel = sub(x, p.start)
          const radial = normalize(sub(rel, scale(p.dir, dot(rel, p.dir))))
          return add(x, scale(radial, 1.5))
        })
      }),
    [fabrication],
  )

  return (
    <>
      {geoms.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshStandardMaterial color={PIECE_COLORS[i % 2]} metalness={0.6} roughness={0.4} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {fabrication.unrolled.map((u, i) => (
        <Line key={`e${i}`} points={u.edge1_3d as [number, number, number][]} color="#111827" lineWidth={1.5} />
      ))}
      {seams.map((pts, i) => (
        <Line key={`s${i}`} points={pts as [number, number, number][]} color="#e00000" lineWidth={4} />
      ))}
    </>
  )
}

/** drei の Html は React 19 で unmount 時に例外が出るため、DOM ラベルの位置を毎フレーム直接更新する */
function LabelProjector({ anchors, refs }: { anchors: Vec3[]; refs: RefObject<(HTMLDivElement | null)[]> }) {
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, size }) => {
    anchors.forEach((a, i) => {
      const el = refs.current[i]
      if (!el) return
      v.set(a[0], a[1], a[2]).project(camera)
      if (v.z > 1) {
        el.style.visibility = 'hidden'
        return
      }
      el.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px)`
      el.style.visibility = 'visible'
    })
  })
  return null
}

/** 全体が画面に収まるようカメラを合わせる。曲げのプレビュー中に視点が動かないよう、明示的な要求と画面サイズ変更時だけ動かす */
function FitCamera({ centerline, profile }: { centerline: Centerline; profile: Profile }) {
  const get = useThree((s) => s.get)
  const controls = useThree((s) => s.controls)
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)
  const fitNonce = useDesignStore((s) => s.fitNonce)
  const cl = useRef(centerline)
  useEffect(() => {
    cl.current = centerline
  }, [centerline])

  useEffect(() => {
    const camera = get().camera as THREE.PerspectiveCamera
    const box = new THREE.Box3()
    for (const p of cl.current.points) box.expandByPoint(new THREE.Vector3(...p))
    box.expandByScalar(profile.stations.reduce((m, s) => Math.max(m, s.outer), 0) / 2)
    const center = box.getCenter(new THREE.Vector3())
    const radius = box.getSize(new THREE.Vector3()).length() / 2
    const vfov = THREE.MathUtils.degToRad(camera.fov)
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (width / Math.max(height, 1)))
    const dist = Math.max(radius / Math.sin(Math.min(hfov, vfov) / 2), 100)
    camera.position.copy(center.clone().add(new THREE.Vector3(0.15, 0.35, 1).normalize().multiplyScalar(dist)))
    camera.far = dist * 20
    camera.lookAt(center)
    camera.updateProjectionMatrix()
    const oc = controls as unknown as { target?: THREE.Vector3; update?: () => void } | null
    if (oc?.target) {
      oc.target.copy(center)
      oc.update?.()
    }
  }, [get, controls, width, height, fitNonce, profile.length, profile.stations])
  return null
}

function StudioEnvironment() {
  const gl = useThree((s) => s.gl)
  const env = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const tex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    return tex
  }, [gl])
  useEffect(() => () => env.dispose(), [env])
  return <Environment map={env} />
}
