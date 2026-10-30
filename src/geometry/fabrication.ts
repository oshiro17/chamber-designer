import type { Centerline } from './centerline'
import type { Station } from './profile'
import { buildPieces, planCuts, type FabResult, type SegmentationSettings } from './segmentation'
import { jointMismatch, unrollPiece, type UnrolledPiece } from './unroll'

export interface FabricationSettings extends SegmentationSettings {
  seam: 'inner' | 'outer'
  allowance: number
}

export interface Fabrication {
  fab: FabResult
  minCount: number
  unrolled: UnrolledPiece[]
  /** 継ぎ目 i（部品 i と i+1 の間）の切断線のずれ [mm] */
  mismatch: number[]
  errors: string[]
  warnings: string[]
}

export const SHORT_PIECE = 10

export function computeFabrication(c: Centerline, stations: Station[], settings: FabricationSettings): Fabrication {
  const { cuts, minCount } = planCuts(c, stations, settings)
  const fab = buildPieces(c, stations, cuts)
  const unrolled: UnrolledPiece[] = []
  const errors: string[] = []
  const warnings: string[] = []
  for (const p of fab.pieces) {
    const r = unrollPiece(p, { seam: settings.seam, allowance: settings.allowance })
    if (r.ok) unrolled.push(r.piece)
    else errors.push(r.error)
    if (p.length < SHORT_PIECE) warnings.push(`部品 ${p.index + 1} の軸長が ${p.length.toFixed(1)}mm と短く、切断・溶接が難しい可能性があります`)
  }
  const mismatch: number[] = []
  if (errors.length === 0) {
    for (let i = 0; i + 1 < fab.pieces.length; i++) {
      mismatch.push(jointMismatch(unrolled[i], fab.pieces[i], unrolled[i + 1], fab.pieces[i + 1]))
    }
  }
  return { fab, minCount, unrolled, mismatch, errors, warnings }
}
