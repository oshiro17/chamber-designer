import type { FabPiece } from '../geometry/segmentation'
import type { Pt, UnrolledPiece } from '../geometry/unroll'

/** 1mm = 72/25.4 pt（PDF の 1pt = 1/72 inch） */
export const MM_TO_PT = 72 / 25.4
export const mmToPt = (mm: number): number => mm * MM_TO_PT

export const A3 = { long: 420, short: 297 }

export interface PrintSettings {
  orientation: 'landscape' | 'portrait'
  /** プリンターの印刷可能領域を考えた余白 [mm] */
  margin: number
  /** タイル分割したときのページ間の重なり幅 [mm] */
  overlap: number
}

export type Layer = 'cut' | 'mark' | 'guide' | 'frame' | 'info'

export interface LineItem {
  kind: 'line'
  pts: Pt[]
  closed?: boolean
  width: number
  dash?: number[]
  layer: Layer
}

export interface TextItem {
  kind: 'text'
  x: number
  y: number
  text: string
  size: number
  anchor: 'start' | 'middle' | 'end'
  layer: Layer
}

export type DrawItem = LineItem | TextItem

export interface Page {
  index: number
  width: number
  height: number
  items: DrawItem[]
  title: string
}

const CUT_W = 0.35
const MARK_W = 0.25
const FOOTER = 16
const PAD = 6

/** 部品 1 つ分の図形。座標は mm、原点は左上、y は下向き（外側から見た向き） */
export function pieceDrawing(u: UnrolledPiece, fab: FabPiece, count: number): { items: DrawItem[]; w: number; h: number } {
  const H = u.bbox.maxY
  const f = (p: Pt): Pt => [p[0], H - p[1]]
  const items: DrawItem[] = []
  items.push({ kind: 'line', pts: u.outline.map(f), closed: true, width: CUT_W, layer: 'cut' })
  if (u.seamLine) items.push({ kind: 'line', pts: u.seamLine.map(f), width: MARK_W, dash: [3, 2], layer: 'guide' })

  for (const m of u.marks) {
    items.push({ kind: 'line', pts: [f(m.at0), f(m.at1)], width: 0.15, dash: [1.5, 2.5], layer: 'guide' })
    items.push({ kind: 'line', pts: [f(m.at0), f(m.in0)], width: MARK_W, layer: 'mark' })
    items.push({ kind: 'line', pts: [f(m.at1), f(m.in1)], width: MARK_W, layer: 'mark' })
    const l0 = f(m.in0)
    const l1 = f(m.in1)
    items.push({ kind: 'text', x: l0[0] + 1.2, y: l0[1] - 1, text: m.label, size: 3, anchor: 'start', layer: 'mark' })
    items.push({ kind: 'text', x: l1[0] + 1.2, y: l1[1] + 3.5, text: m.label, size: 3, anchor: 'start', layer: 'mark' })
  }

  const n = u.edge0.length - 1
  const mid0 = f(u.edge0[Math.floor(n / 2)])
  const mid1 = f(u.edge1[Math.floor(n / 2)])
  const cx = (mid0[0] + mid1[0]) / 2
  const cy = (mid0[1] + mid1[1]) / 2
  const no = fab.index + 1
  const lines = [
    `PART ${no} / ${count}`,
    `L ${fab.length.toFixed(1)}  s ${fab.s0.toFixed(1)}-${fab.s1.toFixed(1)}`,
    `OD ${fab.d0Outer.toFixed(1)} > ${fab.d1Outer.toFixed(1)}`,
    `gen ${u.generatorMin.toFixed(1)}-${u.generatorMax.toFixed(1)}`,
  ]
  const size = Math.min(4, Math.max(2.2, (mid0[1] - mid1[1]) / 9))
  lines.forEach((t, i) => {
    items.push({ kind: 'text', x: cx, y: cy + (i - lines.length / 2 + 0.8) * size * 1.35, text: t, size: i === 0 ? size * 1.3 : size, anchor: 'middle', layer: 'info' })
  })
  // 流れ方向（排気側）を示す矢印。y が小さい方向が排気側
  const ax = cx + Math.min(30, (mid0[1] - mid1[1]) * 0.15) + 18
  const ay0 = cy + 6
  const ay1 = cy - 6
  items.push({ kind: 'line', pts: [[ax, ay0], [ax, ay1]], width: MARK_W, layer: 'info' })
  items.push({ kind: 'line', pts: [[ax - 1.5, ay1 + 2.5], [ax, ay1], [ax + 1.5, ay1 + 2.5]], width: MARK_W, layer: 'info' })
  items.push({ kind: 'text', x: ax, y: ay1 - 1.5, text: 'FLOW', size: 2.5, anchor: 'middle', layer: 'info' })

  items.push({ kind: 'text', x: mid0[0], y: mid0[1] - 2, text: no === 1 ? 'J1 INLET' : `J${no} to PART ${no - 1}`, size: 2.6, anchor: 'middle', layer: 'info' })
  items.push({ kind: 'text', x: mid1[0], y: mid1[1] + 4.5, text: no === count ? `J${no + 1} OUTLET` : `J${no + 1} to PART ${no + 1}`, size: 2.6, anchor: 'middle', layer: 'info' })

  return { items, w: u.bbox.maxX, h: H }
}

/** 線分を矩形でクリップする（Liang-Barsky） */
function clipSegment(a: Pt, b: Pt, x0: number, y0: number, x1: number, y1: number): [Pt, Pt] | null {
  let t0 = 0
  let t1 = 1
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const p = [-dx, dx, -dy, dy]
  const q = [a[0] - x0, x1 - a[0], a[1] - y0, y1 - a[1]]
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null
    } else {
      const r = q[i] / p[i]
      if (p[i] < 0) t0 = Math.max(t0, r)
      else t1 = Math.min(t1, r)
      if (t0 > t1) return null
    }
  }
  return [
    [a[0] + t0 * dx, a[1] + t0 * dy],
    [a[0] + t1 * dx, a[1] + t1 * dy],
  ]
}

export function clipItems(items: DrawItem[], x0: number, y0: number, x1: number, y1: number): DrawItem[] {
  const out: DrawItem[] = []
  for (const it of items) {
    if (it.kind === 'text') {
      if (it.x >= x0 && it.x <= x1 && it.y >= y0 && it.y <= y1) out.push(it)
      continue
    }
    const pts = it.closed ? [...it.pts, it.pts[0]] : it.pts
    let run: Pt[] = []
    const flush = () => {
      if (run.length > 1) out.push({ ...it, pts: run, closed: false })
      run = []
    }
    for (let i = 0; i + 1 < pts.length; i++) {
      const seg = clipSegment(pts[i], pts[i + 1], x0, y0, x1, y1)
      if (!seg) {
        flush()
        continue
      }
      const last = run[run.length - 1]
      if (last && Math.hypot(last[0] - seg[0][0], last[1] - seg[0][1]) < 1e-9) run.push(seg[1])
      else {
        flush()
        run = [seg[0], seg[1]]
      }
      if (seg[1][0] !== pts[i + 1][0] || seg[1][1] !== pts[i + 1][1]) flush()
    }
    flush()
  }
  return out
}

const translate = (items: DrawItem[], dx: number, dy: number): DrawItem[] =>
  items.map((it) => (it.kind === 'text' ? { ...it, x: it.x + dx, y: it.y + dy } : { ...it, pts: it.pts.map(([x, y]) => [x + dx, y + dy] as Pt) }))

export function pageSize(s: PrintSettings): { width: number; height: number } {
  return s.orientation === 'landscape' ? { width: A3.long, height: A3.short } : { width: A3.short, height: A3.long }
}

/** 右下に実寸確認用の 1cm の物差し（1mm 目盛り）、左下にページ情報 */
function footer(width: number, height: number, margin: number, label: string): DrawItem[] {
  const y = height - margin - 5
  const x = width - margin - 10
  const items: DrawItem[] = [
    { kind: 'line', pts: [[x, y], [x + 10, y]], width: 0.2, layer: 'frame' },
  ]
  for (let i = 0; i <= 10; i++) {
    const t = i === 0 || i === 10 ? 4 : i === 5 ? 3 : 1.5
    items.push({ kind: 'line', pts: [[x + i, y], [x + i, y - t]], width: 0.15, layer: 'frame' })
  }
  items.push({ kind: 'text', x: x + 5, y: y + 3.5, text: '1 cm', size: 2.6, anchor: 'middle', layer: 'frame' })
  items.push({ kind: 'text', x: x - 3, y: y, text: 'Print at 100% (Actual size)', size: 2.6, anchor: 'end', layer: 'frame' })
  items.push({ kind: 'text', x: margin, y: y, text: label, size: 2.6, anchor: 'start', layer: 'frame' })
  items.push({ kind: 'line', pts: [[margin, height - margin - FOOTER + 2], [width - margin, height - margin - FOOTER + 2]], width: 0.1, dash: [1, 1], layer: 'frame' })
  return items
}

interface Block {
  piece: number
  items: DrawItem[]
  w: number
  h: number
  /** 周囲の余白。用紙ぎりぎりの部品は余白を詰めて 1 ページに収める */
  pad: number
}

const MIN_PAD = 1

/**
 * 部品をA3ページへ割り付ける。収まる部品は棚詰めでまとめ、収まらない部品は重なり幅付きでタイル分割する。
 * タイルの重なり部分には、両方のページに同じ位置で印刷される合わせマーク（+）を置く。
 */
export function layoutPages(drawings: { items: DrawItem[]; w: number; h: number }[], s: PrintSettings): Page[] {
  const { width, height } = pageSize(s)
  const W = width - 2 * s.margin
  const H = height - 2 * s.margin - FOOTER
  const pages: { items: DrawItem[]; title: string }[] = []
  const fits: Block[] = []
  const big: Block[] = []
  drawings.forEach((d, i) => {
    const pad = Math.max(MIN_PAD, Math.min(PAD, (W - d.w) / 2, (H - d.h) / 2))
    const b = { piece: i, items: d.items, w: d.w, h: d.h, pad }
    if (d.w + 2 * MIN_PAD <= W && d.h + 2 * MIN_PAD <= H) fits.push(b)
    else big.push({ ...b, pad: PAD })
  })

  fits.sort((a, b) => b.h - a.h)
  let cur: { items: DrawItem[]; parts: number[] } | null = null
  let x = 0
  let y = 0
  let rowH = 0
  const flushPage = () => {
    if (cur) pages.push({ items: cur.items, title: `PART ${cur.parts.map((p) => p + 1).join(', ')}` })
    cur = null
  }
  for (const b of fits) {
    const bw = b.w + 2 * b.pad
    const bh = b.h + 2 * b.pad
    if (cur && x + bw > W) {
      x = 0
      y += rowH
      rowH = 0
    }
    if (cur && y + bh > H) flushPage()
    if (!cur) {
      cur = { items: [], parts: [] }
      x = 0
      y = 0
      rowH = 0
    }
    const c = cur as { items: DrawItem[]; parts: number[] }
    c.items.push(...translate(b.items, s.margin + x + b.pad, s.margin + y + b.pad))
    c.parts.push(b.piece)
    x += bw
    rowH = Math.max(rowH, bh)
  }
  flushPage()

  const ov = Math.min(Math.max(s.overlap, 5), Math.min(W, H) / 3)
  for (const b of big) {
    const totalW = b.w + 2 * PAD
    const totalH = b.h + 2 * PAD
    const cols = totalW <= W ? 1 : Math.ceil((totalW - ov) / (W - ov))
    const rows = totalH <= H ? 1 : Math.ceil((totalH - ov) / (H - ov))
    const shifted = translate(b.items, PAD, PAD)
    const reg: DrawItem[] = []
    const cross = (cx: number, cy: number) => {
      reg.push({ kind: 'line', pts: [[cx - 4, cy], [cx + 4, cy]], width: 0.2, layer: 'frame' })
      reg.push({ kind: 'line', pts: [[cx, cy - 4], [cx, cy + 4]], width: 0.2, layer: 'frame' })
    }
    for (let c = 1; c < cols; c++) {
      const cx = c * (W - ov) + ov / 2
      for (let r = 0; r < rows; r++) {
        const oy = r * (H - ov)
        cross(cx, oy + H * 0.25)
        cross(cx, oy + H * 0.75)
      }
    }
    for (let r = 1; r < rows; r++) {
      const cy = r * (H - ov) + ov / 2
      for (let c = 0; c < cols; c++) {
        const ox = c * (W - ov)
        cross(ox + W * 0.25, cy)
        cross(ox + W * 0.75, cy)
      }
    }
    const all = [...shifted, ...reg]
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x0 = c * (W - ov)
        const y0 = r * (H - ov)
        const items = translate(clipItems(all, x0, y0, x0 + W, y0 + H), s.margin - x0, s.margin - y0)
        const m = s.margin
        if (c > 0) items.push({ kind: 'line', pts: [[m + ov, m], [m + ov, m + H]], width: 0.15, dash: [2, 2], layer: 'frame' })
        if (r > 0) items.push({ kind: 'line', pts: [[m, m + ov], [m + W, m + ov]], width: 0.15, dash: [2, 2], layer: 'frame' })
        if (c > 0) items.push({ kind: 'text', x: m + 1, y: m + H / 2, text: `< R${r + 1}C${c}`, size: 3, anchor: 'start', layer: 'frame' })
        if (c < cols - 1) items.push({ kind: 'text', x: m + W - 1, y: m + H / 2, text: `R${r + 1}C${c + 2} >`, size: 3, anchor: 'end', layer: 'frame' })
        if (r > 0) items.push({ kind: 'text', x: m + W / 2, y: m + 4, text: `^ R${r}C${c + 1}`, size: 3, anchor: 'middle', layer: 'frame' })
        if (r < rows - 1) items.push({ kind: 'text', x: m + W / 2, y: m + H - 1, text: `v R${r + 2}C${c + 1}`, size: 3, anchor: 'middle', layer: 'frame' })
        pages.push({ items, title: `PART ${b.piece + 1}  tile R${r + 1}C${c + 1} (${rows}x${cols}, overlap ${ov}mm)` })
      }
    }
  }

  return pages.map((p, i) => ({
    index: i,
    width,
    height,
    title: p.title,
    items: [...p.items, ...footer(width, height, s.margin, `${p.title}   page ${i + 1}/${pages.length}   A3 ${s.orientation}`)],
  }))
}
