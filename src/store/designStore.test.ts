import { beforeEach, describe, expect, it } from 'vitest'
import { computeFabrication } from '../geometry/fabrication'
import { foldParams } from '../geometry/fold'
import { computeProfile } from '../geometry/profile'
import { SAMPLE_POINTS } from '../geometry/sample'
import { defaultDesign, newId, parseDesign } from './design'
import { axisOf, useDesignStore } from './designStore'

const S = () => useDesignStore.getState()
const profile = () => {
  const { points, diameterKind, thickness } = S().design
  const r = computeProfile(points, { diameterKind, thickness })
  if (!r.ok) throw new Error('invalid')
  return r.profile
}

/** 測定点 → 方向 → 角度 の 3 手順で曲げを追加する。index は測定点の番号（0 始まり） */
function bend(index: number, phiDeg: number, thetaDeg: number) {
  S().startBend()
  S().pickPoint(index)
  S().confirmPick()
  S().setPhi(phiDeg)
  S().confirmDir()
  S().setAmount({ thetaDeg })
  S().confirmAmount()
}
const parts = () => {
  const st = profile().stations
  return computeFabrication(st, axisOf(S().design, st), { seam: 180, allowance: 0 })
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
    expect(S().design.folds).toHaveLength(0)
  })

  it('追加した測定点は距離・直径とも未入力', () => {
    S().addPoint()
    const last = S().design.points[S().design.points.length - 1]
    expect(last.distance).toBeNaN()
    expect(last.diameter).toBeNaN()
  })
})

describe('曲げの 3 手順（測定点で折る）', () => {
  it('選んだ測定点で、指定の方向・角度に折れ、部品は必ず「測定点の数 − 1」個', () => {
    bend(4, 90, 40)
    expect(S().draft).toBeNull()
    expect(S().design.folds).toHaveLength(1)
    expect(S().design.folds[0].pointId).toBe(S().design.points[4].id)
    const p = foldParams(S().design.folds[0])
    expect(p.phiDeg).toBeCloseTo(90, 9)
    expect(p.thetaDeg).toBeCloseTo(40, 9)
    const f = parts()
    expect(f.unrolled).toHaveLength(S().design.points.length - 1)
    expect(f.fab.totalLength).toBeCloseTo(1025, 9)
  })

  it('同じ測定点にもう一度曲げを決めると置き換わる', () => {
    bend(4, 0, 20)
    bend(4, 180, 10)
    expect(S().design.folds).toHaveLength(1)
    expect(foldParams(S().design.folds[0]).thetaDeg).toBeCloseTo(10, 9)
  })

  it('3D のタップ位置からは、最も近い測定点（先頭・末尾以外）を選ぶ', () => {
    S().startBend()
    S().pickS(440)
    expect(S().draft).toEqual({ step: 'pick', index: 4 })
    S().pickS(5)
    expect(S().draft).toEqual({ step: 'pick', index: 1 })
    S().pickS(5000)
    expect(S().draft).toEqual({ step: 'pick', index: 6 })
  })

  it('測定点を選ぶまでは決定できない', () => {
    S().startBend()
    S().confirmPick()
    expect(S().draft?.step).toBe('pick')
  })

  it('上限（80°）を超える角度は決定できず、入力中のまま残る', () => {
    bend(4, 0, 85)
    expect(S().design.folds).toHaveLength(0)
    expect(S().draft?.step).toBe('amount')
    expect(S().message).not.toBe('')
  })

  it('取消で何も変わらない', () => {
    S().startBend()
    S().pickPoint(3)
    S().confirmPick()
    S().cancelBend()
    expect(S().draft).toBeNull()
    expect(S().design.folds).toHaveLength(0)
  })
})

describe('寸法ロック', () => {
  it('曲げがあると寸法は変更できない', () => {
    bend(3, 0, 30)
    const before = S().design.points
    S().updatePoint(1, { distance: 999 })
    S().addPoint()
    S().removePoint(3)
    S().setThickness(3)
    expect(S().design.points).toBe(before)
    expect(S().design.thickness).toBe(1)
  })

  it('曲げがあっても「挿入」はでき、全長と曲げはそのまま', () => {
    bend(3, 0, 30)
    S().insertAfter(5)
    expect(S().design.points).toHaveLength(9)
    expect(profile().length).toBe(1025)
    expect(S().design.folds).toHaveLength(1)
    expect(parts().unrolled).toHaveLength(8)
  })

  it('曲げをすべて削除すれば寸法を編集できる', () => {
    bend(3, 0, 30)
    S().removeAllBends()
    S().updatePoint(1, { distance: 100 })
    expect(profile().length).toBe(975)
  })
})

describe('全体の向き', () => {
  it('曲げがあっても向きは変えられ、寸法と曲げはそのまま', () => {
    bend(3, 0, 30)
    const before = S().design
    S().setOrient({ zDeg: -35 })
    S().setOrient({ xDeg: 10 })
    expect(S().design.orient).toEqual({ zDeg: -35, xDeg: 10 })
    expect(S().design.points).toBe(before.points)
    expect(S().design.folds).toBe(before.folds)
  })
  it('向きのない以前の保存データは 0° として読み込む', () => {
    const old = JSON.parse(JSON.stringify(defaultDesign()))
    delete old.orient
    const r = parseDesign(old)
    expect(r.ok && r.design.orient).toEqual({ zDeg: 0, xDeg: 0 })
  })
})

describe('保存データ', () => {
  it('自動保存したデータを読み戻せる', () => {
    bend(3, 45, 30)
    const r = parseDesign(JSON.parse(JSON.stringify(S().design)))
    expect(r.ok && r.design.folds).toHaveLength(1)
  })
  it('以前の滑らかな曲げは、最も近い測定点での折れとして読み込む', () => {
    const old = { ...JSON.parse(JSON.stringify(S().design)), folds: undefined, bends: [{ id: 'b', s: 470, width: 100, a: 0.5, b: 0 }] }
    const r = parseDesign(old)
    expect(r.ok && r.design.folds).toHaveLength(1)
    if (r.ok) expect(r.design.folds[0].pointId).toBe(r.design.points[4].id)
  })
  it('未入力（NaN → null）を含むデータも読み戻せる', () => {
    const r = parseDesign(JSON.parse(JSON.stringify(defaultDesign())))
    expect(r.ok && r.design.points[0].diameter).toBeNaN()
  })
  it('以前の溶接線の設定（inner / outer）は角度の初期値（下 = 180°）として読み込む', () => {
    const old = { ...JSON.parse(JSON.stringify(defaultDesign())), fabrication: { mode: 'stations', maxAngleDeg: 12, count: 12, seam: 'inner', allowance: 0 } }
    const r = parseDesign(old)
    expect(r.ok && r.design.fabrication.seam).toBe(180)
  })
  it('以前に保存した溶接用の余白は 0 として読み込む', () => {
    const old = { ...JSON.parse(JSON.stringify(defaultDesign())), fabrication: { mode: 'stations', maxAngleDeg: 12, count: 12, seam: 90, allowance: 10 } }
    const r = parseDesign(old)
    expect(r.ok && r.design.fabrication.allowance).toBe(0)
  })
  it('壊れたデータは理由付きで拒否する', () => {
    expect(parseDesign({ version: 1, points: [{ distance: 'x', diameter: 1 }, { distance: 1, diameter: 1 }] }).ok).toBe(false)
    expect(parseDesign({ version: 2 }).ok).toBe(false)
  })
})
