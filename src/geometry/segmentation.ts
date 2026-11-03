import type { Vec3 } from './vec3'

/** 製作する部品（両端を平面で切った円すい台または円柱）。測定点の間ごとに 1 つ */
export interface FabPiece {
  index: number
  s0: number
  s1: number
  /** 部品の軸長 = 設計中心軸の弧長 s1 - s0 */
  length: number
  start: Vec3
  dir: Vec3
  /** 円周方向の基準。隣の部品とは継ぎ目をまたいで平行移動で対応させる */
  u: Vec3
  v: Vec3
  /** 板厚中心の半径 */
  r0: number
  r1: number
  /** 外径 */
  d0Outer: number
  d1Outer: number
  /** 始端・終端の切断面の法線（軸方向を向く） */
  n0: Vec3
  n1: Vec3
}

export interface FabResult {
  pieces: FabPiece[]
  /** 製作形状の中心軸と設計中心軸の最大の位置ずれ [mm] */
  maxDeviation: number
  maxDeviationS: number
  /** 出口位置のずれ [mm] */
  endDeviation: number
  /** 製作形状の中心軸長の合計 */
  totalLength: number
  maxMiterDeg: number
}
