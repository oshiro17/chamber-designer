import type { FabPiece } from '../geometry/segmentation'
import type { Pt, UnrolledPiece } from '../geometry/unroll'
import { dot, type Vec3 } from '../geometry/vec3'

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
/** 継ぎ目での管の折れ角 [deg]。切断面の法線は前後の軸の二等分なので、軸との角度の 2 倍になる */
export function foldAngleDeg(dir: Vec3, n: Vec3): number {
  return (2 * Math.acos(Math.min(1, Math.max(-1, dot(dir, n)))) * 180) / Math.PI
}

/**
 * 部品 1 つ分の図形。座標は mm、原点は左上、y は下向き（外側から見た向き）。
 * 中央にチャンバー名・エンジン側からの部品番号・次の部品との折れ角を、部品の大きさに合わせて重ならないように置く
 */
export function pieceDrawing(u: UnrolledPiece, fab: FabPiece, count: number, name = ''): { items: DrawItem[]; w: number; h: number } {
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

  // 中央の文字のまとまり。上下は切り口の文字と A〜D の印の分を空け、左右は短いほうの切り口の弦の長さに収める
  const fold = foldAngleDeg(fab.dir, fab.n1)
  const rows: { text: string; size: number; circle?: boolean }[] = []
  if (name) rows.push({ text: name, size: 7 })
  rows.push({ text: String(no), size: 16, circle: true })
  if (no < count) rows.push({ text: `${fold.toFixed(1)}\u00b0 to PART ${no + 1}`, size: 5 })
  rows.push({ text: `L ${fab.length.toFixed(1)}  OD ${fab.d0Outer.toFixed(1)}-${fab.d1Outer.toFixed(1)}`, size: 2.6 })
  const rowH = (r: (typeof rows)[number]) => (r.circle ? r.size * 1.6 + 2 : r.size * 1.35)
  const rowW = (r: (typeof rows)[number]) => (r.circle ? r.size * 1.6 : r.text.length * r.size * 0.58)
  const chord = (e: Pt[]) => Math.hypot(e[n][0] - e[0][0], e[n][1] - e[0][1])
  const band = mid0[1] - mid1[1]
  const availH = Math.max(0, band - 2 * Math.min(7, band * 0.25))
  const availW = Math.min(chord(u.edge0), chord(u.edge1), u.bbox.maxX) * 0.8
  // 縦に積む並べ方と、背の低い部品向けに横一列に並べる並べ方のうち、大きく書けるほうを使う
  const GAP = 4
  const stackH = rows.reduce((a, r) => a + rowH(r), 0)
  const stackW = Math.max(...rows.map(rowW))
  const lineW = rows.reduce((a, r) => a + rowW(r), 0) + GAP * (rows.length - 1)
  const lineH = Math.max(...rows.map(rowH))
  const kStack = Math.min(1, availH / stackH, availW / stackW)
  const kLine = Math.min(1, availH / lineH, availW / lineW)
  const horizontal = kLine > kStack
  const k = horizontal ? kLine : kStack
  const maxW = horizontal ? lineW : stackW
  const drawRow = (r: (typeof rows)[number], x: number, top: number, anchor: TextItem['anchor']) => {
    const size = r.size * k
    if (r.circle) {
      const rad = (r.size * 1.6 * k) / 2
      const ccx = anchor === 'start' ? x + rad : x
      const ccy = top + rad + k
      const circle: Pt[] = []
      for (let i = 0; i < 48; i++) circle.push([ccx + rad * Math.cos((2 * Math.PI * i) / 48), ccy + rad * Math.sin((2 * Math.PI * i) / 48)])
      items.push({ kind: 'line', pts: circle, closed: true, width: 0.6, layer: 'info' })
      const ns = size * (r.text.length >= 2 ? 0.75 : 1)
      items.push({ kind: 'text', x: ccx, y: ccy + ns * 0.36, text: r.text, size: ns, anchor: 'middle', layer: 'info' })
    } else {
      items.push({ kind: 'text', x, y: top + size * 1.05, text: r.text, size, anchor, layer: 'info' })
    }
  }
  if (horizontal) {
    let x = cx - (lineW * k) / 2
    for (const r of rows) {
      drawRow(r, x, cy - (rowH(r) * k) / 2, 'start')
      x += (rowW(r) + GAP) * k
    }
  } else {
    let y = cy - (stackH * k) / 2
    for (const r of rows) {
      drawRow(r, cx, y, 'middle')
      y += rowH(r) * k
    }
  }

  // 流れ方向（排気側）を示す矢印。y が小さい方向が排気側。中央の文字の右に入る場合だけ描く
  const ax = cx + (maxW * k) / 2 + 6
  if (ax + 3 < cx + availW / 2 + 6) {
    const ay0 = cy + 6
    const ay1 = cy - 6
    items.push({ kind: 'line', pts: [[ax, ay0], [ax, ay1]], width: MARK_W, layer: 'info' })
    items.push({ kind: 'line', pts: [[ax - 1.5, ay1 + 2.5], [ax, ay1], [ax + 1.5, ay1 + 2.5]], width: MARK_W, layer: 'info' })
    items.push({ kind: 'text', x: ax, y: ay1 - 1.5, text: 'FLOW', size: 2.5, anchor: 'middle', layer: 'info' })
  }

  items.push({ kind: 'text', x: mid0[0], y: mid0[1] - 2, text: no === 1 ? 'J1 ENGINE' : `J${no} to PART ${no - 1}`, size: 2.6, anchor: 'middle', layer: 'info' })
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

interface Drawing {
  items: DrawItem[]
  w: number
  h: number
}

/** 図形を原点まわりに回して、左上が (0, 0) に来るよう平行移動する。文字は向きを変えず位置だけ回す */
export function rotateDrawing(d: Drawing, deg: number): Drawing {
  if (deg === 0) return d
  const a = (deg * Math.PI) / 180
  const c = Math.cos(a)
  const sn = Math.sin(a)
  const rot = ([x, y]: Pt): Pt => [x * c - y * sn, x * sn + y * c]
  const items = d.items.map((it) => (it.kind === 'text' ? { ...it, ...xy(rot([it.x, it.y])) } : { ...it, pts: it.pts.map(rot) }))
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const it of items) {
    if (it.kind !== 'line') continue
    for (const [x, y] of it.pts) {
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  return { items: translate(items, -minX, -minY), w: maxX - minX, h: maxY - minY }
}
const xy = ([x, y]: Pt) => ({ x, y })

/** 試す回転角。まずはそのまま、次に 90°、それでも入らなければ 3° 刻みで探す */
const ANGLES = [0, 90, ...Array.from({ length: 59 }, (_, i) => 3 * (i + 1)).filter((a) => a !== 90)]

function fitAngle(d: Drawing, W: number, H: number, pad = MIN_PAD): Drawing | null {
  for (const a of ANGLES) {
    const r = rotateDrawing(d, a)
    if (r.w + 2 * pad <= W && r.h + 2 * pad <= H) return r
  }
  return null
}

interface Block extends Drawing {
  piece: number
  /** 周囲の余白。用紙ぎりぎりの部品は余白を詰めて 1 ページに収める */
  pad: number
}

const MIN_PAD = 1

/** n 枚に均等に分けたときの各ページの開始位置。1 枚なら中央にそろえる */
function evenStarts(total: number, size: number, overlap: number): number[] {
  if (total <= size) return [(total - size) / 2]
  const n = Math.ceil((total - overlap) / (size - overlap))
  const step = (total - size) / (n - 1)
  return Array.from({ length: n }, (_, i) => i * step)
}

/**
 * 部品をA3ページへ割り付ける。
 * 1. 下の帯（ページ情報と物差し）にかからずに入る部品は、棚詰めでまとめる（入らなければ回転も試す）
 * 2. 下の帯に重なれば入る部品は、1 ページに 1 部品で置く
 * 3. 指定の向きで入らなければ、そのページだけ縦横を入れ替えて 1 ページに収める
 * 4. それでも入らない部品は、ページ数で均等に分けて重なり幅を付け、重なり部分に合わせマーク（+）を置く
 */
export function layoutPages(drawings: Drawing[], s: PrintSettings): Page[] {
  const { width, height } = pageSize(s)
  const W = width - 2 * s.margin
  const H = height - 2 * s.margin - FOOTER
  const Hfull = height - 2 * s.margin
  const m = s.margin
  const alt: PrintSettings = { ...s, orientation: s.orientation === 'landscape' ? 'portrait' : 'landscape' }
  const altSize = pageSize(alt)
  const pages: { items: DrawItem[]; title: string; turned?: boolean }[] = []
  const fits: Block[] = []
  const big: Block[] = []
  const single = (b: Drawing, i: number, pw: number, ph: number, turned: boolean) => {
    const w = pw - 2 * m
    const h = ph - 2 * m
    pages.push({ items: translate(b.items, m + (w - b.w) / 2, m + (h - b.h) / 2), title: `PART ${i + 1}`, turned })
  }
  drawings.forEach((d0, i) => {
    const a = fitAngle(d0, W, H)
    if (a) {
      fits.push({ ...a, piece: i, pad: Math.max(MIN_PAD, Math.min(PAD, (W - a.w) / 2, (H - a.h) / 2)) })
      return
    }
    const b = fitAngle(d0, W, Hfull, 0)
    if (b) {
      single(b, i, width, height, false)
      return
    }
    const c = fitAngle(d0, altSize.width - 2 * m, altSize.height - 2 * m, 0)
    if (c) {
      single(c, i, altSize.width, altSize.height, true)
      return
    }
    // 均等分割のページ数が最も少ない向きを選ぶ
    let best: Drawing = d0
    let bestN = Infinity
    for (const ang of ANGLES) {
      const r = rotateDrawing(d0, ang)
      const n = evenStarts(r.w + 2 * PAD, W, s.overlap).length * evenStarts(r.h + 2 * PAD, H, s.overlap).length
      if (n < bestN) {
        best = r
        bestN = n
      }
    }
    big.push({ ...best, piece: i, pad: PAD })
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
    c.items.push(...translate(b.items, m + x + b.pad, m + y + b.pad))
    c.parts.push(b.piece)
    x += bw
    rowH = Math.max(rowH, bh)
  }
  flushPage()

  for (const b of big) {
    const totalW = b.w + 2 * PAD
    const totalH = b.h + 2 * PAD
    const xs = evenStarts(totalW, W, s.overlap)
    const ys = evenStarts(totalH, H, s.overlap)
    const cols = xs.length
    const rows = ys.length
    const shifted = translate(b.items, PAD, PAD)
    const reg: DrawItem[] = []
    const cross = (cx: number, cy: number) => {
      reg.push({ kind: 'line', pts: [[cx - 4, cy], [cx + 4, cy]], width: 0.2, layer: 'frame' })
      reg.push({ kind: 'line', pts: [[cx, cy - 4], [cx, cy + 4]], width: 0.2, layer: 'frame' })
    }
    // 重なり部分の中央に、両側のページに同じ位置で印刷される合わせマークを置く
    for (let c = 1; c < cols; c++) {
      const cx = (xs[c] + xs[c - 1] + W) / 2
      for (const oy of ys) {
        cross(cx, oy + H * 0.25)
        cross(cx, oy + H * 0.75)
      }
    }
    for (let r = 1; r < rows; r++) {
      const cy = (ys[r] + ys[r - 1] + H) / 2
      for (const ox of xs) {
        cross(ox + W * 0.25, cy)
        cross(ox + W * 0.75, cy)
      }
    }
    const all = [...shifted, ...reg]
    const ovX = cols > 1 ? W - (xs[1] - xs[0]) : 0
    const ovY = rows > 1 ? H - (ys[1] - ys[0]) : 0
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x0 = xs[c]
        const y0 = ys[r]
        const items = translate(clipItems(all, x0, y0, x0 + W, y0 + H), m - x0, m - y0)
        if (c > 0) items.push({ kind: 'line', pts: [[m + ovX, m], [m + ovX, m + H]], width: 0.15, dash: [2, 2], layer: 'frame' })
        if (r > 0) items.push({ kind: 'line', pts: [[m, m + ovY], [m + W, m + ovY]], width: 0.15, dash: [2, 2], layer: 'frame' })
        if (c > 0) items.push({ kind: 'text', x: m + 1, y: m + H / 2, text: `< R${r + 1}C${c}`, size: 3, anchor: 'start', layer: 'frame' })
        if (c < cols - 1) items.push({ kind: 'text', x: m + W - 1, y: m + H / 2, text: `R${r + 1}C${c + 2} >`, size: 3, anchor: 'end', layer: 'frame' })
        if (r > 0) items.push({ kind: 'text', x: m + W / 2, y: m + 4, text: `^ R${r}C${c + 1}`, size: 3, anchor: 'middle', layer: 'frame' })
        if (r < rows - 1) items.push({ kind: 'text', x: m + W / 2, y: m + H - 1, text: `v R${r + 2}C${c + 1}`, size: 3, anchor: 'middle', layer: 'frame' })
        const ov = Math.round(Math.max(ovX, ovY))
        pages.push({ items, title: `PART ${b.piece + 1}  tile R${r + 1}C${c + 1} (${rows}x${cols}, overlap ${ov}mm)` })
      }
    }
  }

  return pages.map((p, i) => {
    const sz = p.turned ? altSize : { width, height }
    const o = p.turned ? alt.orientation : s.orientation
    return {
      index: i,
      width: sz.width,
      height: sz.height,
      title: p.title,
      items: [...p.items, ...footer(sz.width, sz.height, s.margin, `${p.title}   page ${i + 1}/${pages.length}   A3 ${o}`)],
    }
  })
}
