import { createContext, useContext, useMemo, useState } from 'react'
import { buildBentCenterline } from '../geometry/bend'
import type { Centerline } from '../geometry/centerline'
import { computeFabrication, type Fabrication } from '../geometry/fabrication'
import { computeProfile, type Profile, type ProfileResult } from '../geometry/profile'
import { checkShape, type ShapeCheck } from '../geometry/shapeCheck'
import { draftHandle, useDesignStore } from './designStore'

export interface Derived {
  result: ProfileResult
  /** 入力エラー中は最後に正しく計算できた値 */
  profile: Profile | null
  /** 曲げの入力中は、入力中の曲げを含めたプレビュー */
  centerline: Centerline | null
  check: ShapeCheck | null
}

export function useComputeDerived(): Derived {
  const points = useDesignStore((s) => s.design.points)
  const diameterKind = useDesignStore((s) => s.design.diameterKind)
  const thickness = useDesignStore((s) => s.design.thickness)
  const bends = useDesignStore((s) => s.design.bends)
  const draft = useDesignStore((s) => s.draft)

  const result = useMemo(() => computeProfile(points, { diameterKind, thickness }), [points, diameterKind, thickness])
  const [profile, setProfile] = useState<Profile | null>(result.ok ? result.profile : null)
  if (result.ok && result.profile !== profile) setProfile(result.profile)
  if (!result.ok && points.length < 2 && profile !== null) setProfile(null)
  // 入力途中のエラーでは直前の形状を表示し続けるが、クリア後や 1 点だけのときは表示しない
  const shown = result.ok ? result.profile : points.length >= 2 ? profile : null

  const preview = useMemo(() => {
    const h = draftHandle(draft)
    return h ? [...bends, h] : bends
  }, [bends, draft])
  const centerline = useMemo(() => (shown ? buildBentCenterline(shown.length, preview) : null), [shown, preview])
  const check = useMemo(() => (shown && centerline ? checkShape(centerline, shown.stations) : null), [shown, centerline])
  return { result, profile: shown, centerline, check }
}

export const DerivedContext = createContext<Derived | null>(null)

export function useDerived(): Derived {
  const d = useContext(DerivedContext)
  if (!d) throw new Error('DerivedContext がありません')
  return d
}

/** 展開計算は重いので、必要なタブを開いているときだけ計算する */
export function useFabrication(derived: Derived, enabled: boolean): Fabrication | null {
  const { profile, centerline } = derived
  const settings = useDesignStore((s) => s.design.fabrication)
  return useMemo(
    () => (enabled && profile && centerline ? computeFabrication(centerline, profile.stations, settings) : null),
    [enabled, profile, centerline, settings],
  )
}
