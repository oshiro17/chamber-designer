import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { buildBentCenterline } from '../geometry/bend'
import { computeFabrication } from '../geometry/fabrication'
import { computeProfile } from '../geometry/profile'
import { SAMPLE_POINTS } from '../geometry/sample'
import type { FabPiece } from '../geometry/segmentation'
import { unrollPiece } from '../geometry/unroll'
import { clipItems, foldAngleDeg, layoutPages, mmToPt, pieceDrawing, rotateDrawing, type LineItem, type PrintSettings } from './layout'
import { pagesToPdf, pdfSafe } from './pdf'
import { pageToSvg } from './svg'

const prof = computeProfile(SAMPLE_POINTS.map((p, i) => ({ id: String(i), ...p })), { diameterKind: 'outer', thickness: 1 })
if (!prof.ok) throw new Error()
const { stations, length: L } = prof.profile
const c = buildBentCenterline(L, [{ id: 'a', s: 690, width: 250, a: 0.9, b: 0.2 }])
const fabr = computeFabrication(c, stations, { mode: 'stations', maxAngleDeg: 12, count: 0, seam: 180, allowance: 0 })
const drawings = fabr.unrolled.map((u, i) => pieceDrawing(u, fabr.fab.pieces[i], fabr.unrolled.length))
const land: PrintSettings = { orientation: 'landscape', margin: 10, overlap: 15 }

const segLen = (items: ReturnType<typeof clipItems>, layer = 'cut') =>
  items
    .filter((it): it is LineItem => it.kind === 'line' && it.layer === layer)
    .reduce((acc, it) => {
      const pts = it.closed ? [...it.pts, it.pts[0]] : it.pts
      let l = 0
      for (let i = 0; i + 1 < pts.length; i++) l += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
      return acc + l
    }, 0)

describe('mm → pt', () => {
  it('100mm は 283.4646pt', () => {
    expect(mmToPt(100)).toBeCloseTo(283.4646, 4)
    expect(mmToPt(25.4)).toBeCloseTo(72, 10)
  })
})

describe('layoutPages', () => {
  const pages = layoutPages(drawings, land)

  it('A3 横は 420 × 297mm（横で入らない部品のページだけ縦になる）', () => {
    for (const p of pages) expect([[420, 297], [297, 420]]).toContainEqual([p.width, p.height])
    expect(pages[0].width).toBe(420)
    const portrait = layoutPages(drawings, { ...land, orientation: 'portrait' })
    expect([portrait[0].width, portrait[0].height]).toEqual([297, 420])
  })

  it('全ページの右下に長さちょうど 10mm の物差しがある', () => {
    for (const p of pages) {
      const bar = p.items.find((it): it is LineItem => it.kind === 'line' && it.layer === 'frame' && it.pts.length === 2 && it.pts[0][1] === it.pts[1][1] && Math.abs(it.pts[1][0] - it.pts[0][0] - 10) < 1e-12)
      expect(bar).toBeDefined()
      expect(bar!.pts[1][0]).toBe(p.width - land.margin)
      expect(bar!.pts[0][1]).toBeGreaterThan(p.height / 2)
    }
  })

  it('切断線は余白の内側に収まる', () => {
    for (const p of pages) {
      for (const it of p.items) {
        if (it.kind !== 'line' || it.layer !== 'cut') continue
        for (const [x, y] of it.pts) {
          expect(x).toBeGreaterThanOrEqual(10 - 1e-9)
          expect(x).toBeLessThanOrEqual(p.width - 10 + 1e-9)
          expect(y).toBeGreaterThanOrEqual(10 - 1e-9)
          expect(y).toBeLessThanOrEqual(p.height - 10 + 1e-9)
        }
      }
    }
  })

  it('全部品の切断線の長さが、ページへ配置した後も変わらない（倍率 1:1）', () => {
    const before = drawings.reduce((acc, d) => acc + segLen(d.items), 0)
    const singleTile = layoutPages(drawings, land).reduce((acc, p) => acc + segLen(p.items), 0)
    expect(singleTile).toBeGreaterThanOrEqual(before - 1e-6)
  })

  it('A3 に収まらない部品は複数ページへタイル分割され、重なり部分を除くと切断線が欠けない', () => {
    const big: FabPiece = {
      index: 0, s0: 0, s1: 600, length: 600, start: [0, 0, 0], dir: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1],
      r0: 150, r1: 150, d0Outer: 301, d1Outer: 301, n0: [1, 0, 0], n1: [1, 0, 0],
    }
    const u = unrollPiece(big, { seam: 180, allowance: 0 })
    if (!u.ok) throw new Error()
    const d = pieceDrawing(u.piece, big, 1)
    const tiles = layoutPages([d], land)
    expect(tiles.length).toBeGreaterThan(1)
    expect(tiles[0].title).toContain('tile')
    const tiled = tiles.reduce((acc, p) => acc + segLen(p.items), 0)
    expect(tiled).toBeGreaterThanOrEqual(segLen(d.items) - 1e-6)
  })
})

describe('用紙ぎりぎりの部品', () => {
  it('有効幅（400mm）以内なら余白を詰めて 1 ページに収める', () => {
    const r = 395 / (2 * Math.PI)
    const p: FabPiece = {
      index: 0, s0: 0, s1: 150, length: 150, start: [0, 0, 0], dir: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1],
      r0: r, r1: r, d0Outer: 2 * r + 1, d1Outer: 2 * r + 1, n0: [1, 0, 0], n1: [1, 0, 0],
    }
    const u = unrollPiece(p, { seam: 180, allowance: 0 })
    if (!u.ok) throw new Error()
    const pages = layoutPages([pieceDrawing(u.piece, p, 1)], land)
    expect(pages).toHaveLength(1)
  })
})

describe('pieceDrawing', () => {
  it('各部品の中央に、他の文字より大きい部品番号と丸がある', () => {
    drawings.forEach((d, i) => {
      const texts = d.items.filter((it) => it.kind === 'text')
      const num = texts.find((t) => t.kind === 'text' && t.text === String(i + 1))
      expect(num).toBeDefined()
      for (const t of texts) if (t !== num && t.kind === 'text') expect(num!.kind === 'text' && num!.size).toBeGreaterThan(t.size)
      expect(d.items.some((it) => it.kind === 'line' && it.closed && it.layer === 'info' && it.pts.length === 48)).toBe(true)
    })
  })
})

describe('A3 への入れ方', () => {
  const cone = (over: Partial<FabPiece>): FabPiece => ({
    index: 0, s0: 0, s1: 260, length: 260, start: [0, 0, 0], dir: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1],
    r0: 62, r1: 12, d0Outer: 125, d1Outer: 25, n0: [1, 0, 0], n1: [1, 0, 0], ...over,
  })
  const draw = (p: FabPiece) => {
    const u = unrollPiece(p, { seam: 0, allowance: 0 })
    if (!u.ok) throw new Error()
    return pieceDrawing(u.piece, p, 1)
  }

  it('外径 125→25・長さ 260 の円すい部品（以前は 2 ページに分かれていた）は 1 ページに収まる', () => {
    const pages = layoutPages([draw(cone({}))], land)
    expect(pages).toHaveLength(1)
    expect(pages[0].title).not.toContain('tile')
  })

  it('回転しても丸と番号の位置関係は崩れず、文字も同じ角度だけ回る', () => {
    const d = draw(cone({}))
    const center = (dd: typeof d) => {
      const circle = dd.items.find((it): it is LineItem => it.kind === 'line' && !!it.closed && it.layer === 'info')!
      const cx = circle.pts.reduce((a, p) => a + p[0], 0) / circle.pts.length
      const cy = circle.pts.reduce((a, p) => a + p[1], 0) / circle.pts.length
      const num = dd.items.find((it) => it.kind === 'text' && it.text === '1')!
      return { gap: num.kind === 'text' ? Math.hypot(num.x - cx, num.y - cy) : NaN, angle: num.kind === 'text' ? num.angle ?? 0 : NaN }
    }
    const before = center(d)
    const after = center(rotateDrawing(d, 150))
    expect(after.gap).toBeCloseTo(before.gap, 6)
    expect(after.angle).toBe(150)
  })

  it('回転した文字を含む PDF も作れる', async () => {
    const pages = layoutPages([rotateDrawing(draw(cone({})), 37)], land)
    const doc = await PDFDocument.load(await pagesToPdf(pages))
    expect(doc.getPageCount()).toBe(pages.length)
  })

  it('回転しても切断線の長さは変わらない', () => {
    const d = draw(cone({}))
    const r = rotateDrawing(d, 37)
    expect(segLen(r.items)).toBeCloseTo(segLen(d.items), 6)
  })

  it('少しだけはみ出す部品も半分ずつに分け、ほぼ同じ内容のページが 2 枚にならない', () => {
    // 円周 405mm・長さ 300mm の円柱。縦横どちらの A3 にも入らない
    const r = 405 / (2 * Math.PI)
    const d = draw(cone({ r0: r, r1: r, length: 300, s1: 300, d0Outer: 2 * r + 1, d1Outer: 2 * r + 1 }))
    const pages = layoutPages([d], land)
    expect(pages).toHaveLength(2)
    const lens = pages.map((p) => segLen(p.items))
    expect(Math.min(...lens) / Math.max(...lens)).toBeGreaterThan(0.8)
    expect(lens[0] + lens[1]).toBeLessThan(segLen(d.items) * 1.3)
    expect(lens[0] + lens[1]).toBeGreaterThanOrEqual(segLen(d.items) - 1e-6)
  })

  it('入らない部品は均等に分け、端だけが別ページに切れることはない', () => {
    // 円周 471mm の円柱。縦横どちらの A3 にも入らず 2 ページに分かれる
    const r = 471 / (2 * Math.PI)
    const d = draw(cone({ r0: r, r1: r, length: 200, s1: 200, d0Outer: 2 * r + 1, d1Outer: 2 * r + 1 }))
    const pages = layoutPages([d], land)
    expect(pages).toHaveLength(2)
    const lens = pages.map((p) => segLen(p.items))
    expect(Math.min(...lens) / Math.max(...lens)).toBeGreaterThan(0.8)
    expect(lens[0] + lens[1]).toBeGreaterThanOrEqual(segLen(d.items) - 1e-6)
  })
})

describe('型紙中央の表示', () => {
  const named = fabr.unrolled.map((u, i) => pieceDrawing(u, fabr.fab.pieces[i], fabr.unrolled.length, 'RZ421'))

  it('チャンバー名が全部品に入り、最後以外の部品には次の部品との折れ角が入る', () => {
    named.forEach((d, i) => {
      expect(d.items.some((it) => it.kind === 'text' && it.text === 'RZ421')).toBe(true)
      const p = fabr.fab.pieces[i]
      const label = `${foldAngleDeg(p.dir, p.n1).toFixed(1)}\u00b0 to PART ${i + 2}`
      expect(d.items.some((it) => it.kind === 'text' && it.text === label)).toBe(i < fabr.unrolled.length - 1)
    })
  })

  it('中央の文字どうしが重ならない', () => {
    named.forEach((d) => {
      const boxes = d.items
        .filter((it): it is Extract<typeof it, { kind: 'text' }> => it.kind === 'text' && it.layer === 'info' && !it.text.startsWith('J'))
        .map((t) => {
          const w = t.text.length * t.size * 0.55
          const x0 = t.anchor === 'middle' ? t.x - w / 2 : t.anchor === 'end' ? t.x - w : t.x
          return { x0, x1: x0 + w, y0: t.y - t.size * 0.75, y1: t.y + t.size * 0.15, t: t.text }
        })
      // 丸の中の番号は丸と同じ位置なので、番号以外の文字どうしと、番号との重なりを調べる
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]
          const b = boxes[j]
          const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
          expect(overlap, `${a.t} と ${b.t}`).toBe(false)
        }
      }
    })
  })

  it('PDF に書けない文字（日本語）は ? にする', () => {
    expect(pdfSafe('RZ421 改 12.5\u00b0')).toBe('RZ421 ? 12.5\u00b0')
  })
})

describe('clipItems', () => {
  it('矩形をまたぐ線分を境界で切る', () => {
    const out = clipItems([{ kind: 'line', pts: [[-10, 5], [20, 5]], width: 1, layer: 'cut' }], 0, 0, 10, 10)
    expect(out).toHaveLength(1)
    expect((out[0] as LineItem).pts).toEqual([[0, 5], [10, 5]])
  })
})

describe('PDF', () => {
  it('ページ数とページサイズ（A3 = 1190.55 × 841.89pt）が正しい', async () => {
    const pages = layoutPages(drawings, land)
    const bytes = await pagesToPdf(pages)
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(pages.length)
    const { width, height } = doc.getPage(0).getSize()
    expect(width).toBeCloseTo(1190.551, 2)
    expect(height).toBeCloseTo(841.89, 2)
  })
})

describe('SVG', () => {
  it('SVG は mm 指定で実寸', () => {
    const svg = pageToSvg(layoutPages(drawings, land)[0])
    expect(svg).toContain('width="420mm" height="297mm" viewBox="0 0 420 297"')
  })
})

describe('computeFabrication', () => {
  it('サンプルの曲げ形状でエラーなく展開でき、継ぎ目のずれが記録される', () => {
    expect(fabr.errors).toEqual([])
    expect(fabr.mismatch).toHaveLength(fabr.unrolled.length - 1)
    expect(fabr.fab.totalLength).toBeCloseTo(L, 9)
  })
})
