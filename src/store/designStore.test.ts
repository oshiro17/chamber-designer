import { beforeEach, describe, expect, it } from 'vitest'
import { buildBentCenterline, handleParams } from '../geometry/bend'
import { measuredLength } from '../geometry/centerline'
import { computeProfile } from '../geometry/profile'
import { SAMPLE_POINTS } from '../geometry/sample'
import { defaultDesign, newId, parseDesign } from './design'
import { useDesignStore } from './designStore'

const S = () => useDesignStore.getState()
const profile = () => {
  const { points, diameterKind, thickness } = S().design
  const r = computeProfile(points, { diameterKind, thickness })
  if (!r.ok) throw new Error('invalid')
  return r.profile
}

/** 位置 → 方向 → 角度と半径 の 3 手順で曲げを追加する */
function bend(s: number, phiDeg: number, thetaDeg: number, radius: number) {
  S().startBend()
  S().pickS(s)
  S().confirmPick()
  S().setPhi(phiDeg)
  S().confirmDir()
  S().setAmount({ thetaDeg, radius })
  S().confirmAmount()
}

beforeEach(() => useDesignStore.setState({ design: { ...defaultDesign(), points: SAMPLE_POINTS.map((p) => ({ id: newId(), ...p })) }, draft: null }))

describe('寸法の編集', () => {
  it('途中への挿入は区間を二等分し、全長と容積を変えない', () => {
    const before = profile()
    S().insertAfter(3)
    expect(S().design.points).toHaveLength(9)
    expect(profile().length).toBe(before.length)
    expect(profile().volume).toBeCloseTo(before.volume, 6)
  })

  it('中間点の削除は後続の点の累積位置を保つ', () => {
    S().removePoint(2)
    expect(profile().stations.map((s) => s.s)).toEqual([0, 150, 320, 450, 615, 765, 1025])
  })

  it('測定点は 1 点未満にできない', () => {
    for (let i = 0; i < 10; i++) S().removePoint(0)
    expect(S().design.points).toHaveLength(1)
  })

  it('初期状態とクリア後は入口の 1 点だけで、直径は未入力', () => {
    S().clearAll()
    expect(S().design.points).toHaveLength(1)
    expect(S().design.points[0].diameter).toBeNaN()
    expect(S().design.bends).toHaveLength(0)
  })

  it('追加した測定点は距離・直径とも未入力', () => {
    S().addPoint()
    const last = S().design.points[S().design.points.length - 1]
    expect(last.distance).toBeNaN()
    expect(last.diameter).toBeNaN()
  })
})

describe('曲げの 3 手順', () => {
  it('位置・方向・角度・半径どおりに曲げが追加され、全長は変わらない', () => {
    bend(500, 90, 40, 200)
    expect(S().draft).toBeNull()
    expect(S().design.bends).toHaveLength(1)
    const p = handleParams(S().design.bends[0])
    expect(S().design.bends[0].s).toBe(500)
    expect(p.phiDeg).toBeCloseTo(90, 9)
    expect(p.thetaDeg).toBeCloseTo(40, 9)
    expect(p.radius).toBeCloseTo(200, 9)
    expect(measuredLength(buildBentCenterline(1025, S().design.bends))).toBeCloseTo(1025, 6)
  })

  it('位置を選ぶまでは決定できない', () => {
    S().startBend()
    S().confirmPick()
    expect(S().draft?.step).toBe('pick')
  })

  it('製作できない急な曲げは決定できず、入力中のまま残る', () => {
    bend(690, 0, 120, 40)
    expect(S().design.bends).toHaveLength(0)
    expect(S().draft?.step).toBe('amount')
    expect(S().message).not.toBe('')
  })

  it('端からはみ出す曲げは決定できない', () => {
    bend(30, 0, 30, 200)
    expect(S().design.bends).toHaveLength(0)
  })

  it('取消で何も変わらない', () => {
    S().startBend()
    S().pickS(400)
    S().confirmPick()
    S().cancelBend()
    expect(S().draft).toBeNull()
    expect(S().design.bends).toHaveLength(0)
  })
})

describe('寸法ロック', () => {
  it('曲げがあると寸法は変更できない', () => {
    bend(400, 0, 30, 200)
    const before = S().design.points
    S().updatePoint(1, { distance: 999 })
    S().addPoint()
    S().removePoint(3)
    S().setThickness(3)
    expect(S().design.points).toBe(before)
    expect(S().design.thickness).toBe(1)
  })

  it('曲げをすべて削除すれば寸法を編集できる', () => {
    bend(400, 0, 30, 200)
    S().removeAllBends()
    S().updatePoint(1, { distance: 100 })
    expect(profile().length).toBe(975)
  })
})

describe('保存データ', () => {
  it('自動保存したデータを読み戻せる', () => {
    bend(400, 45, 30, 200)
    const r = parseDesign(JSON.parse(JSON.stringify(S().design)))
    expect(r.ok && r.design.bends).toHaveLength(1)
  })
  it('未入力（NaN → null）を含むデータも読み戻せる', () => {
    const r = parseDesign(JSON.parse(JSON.stringify(defaultDesign())))
    expect(r.ok && r.design.points[0].diameter).toBeNaN()
  })
  it('以前の溶接線の設定（inner / outer）は角度の初期値（下 = 180°）として読み込む', () => {
    const old = { ...JSON.parse(JSON.stringify(defaultDesign())), fabrication: { mode: 'auto', maxAngleDeg: 12, count: 12, seam: 'inner', allowance: 0 } }
    const r = parseDesign(old)
    expect(r.ok && r.design.fabrication.seam).toBe(180)
  })
  it('壊れたデータは理由付きで拒否する', () => {
    expect(parseDesign({ version: 1, points: [{ distance: 'x', diameter: 1 }, { distance: 1, diameter: 1 }] }).ok).toBe(false)
    expect(parseDesign({ version: 2 }).ok).toBe(false)
  })
})
