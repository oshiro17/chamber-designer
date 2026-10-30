import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { mmToPt, type Page } from './layout'

const COLORS = {
  cut: rgb(0, 0, 0),
  mark: rgb(0.76, 0.25, 0.05),
  guide: rgb(0.42, 0.45, 0.5),
  frame: rgb(0.22, 0.25, 0.32),
  info: rgb(0.11, 0.3, 0.85),
}

/** ページ座標（mm、左上原点、y 下向き）を PDF 座標（pt、左下原点、y 上向き）へ変換してPDFを作る */
export async function pagesToPdf(pages: Page[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle('Chamber Designer - unrolled patterns (1:1)')
  doc.setCreator('Chamber Designer')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const pg of pages) {
    const page = doc.addPage([mmToPt(pg.width), mmToPt(pg.height)])
    const X = (x: number) => mmToPt(x)
    const Y = (y: number) => mmToPt(pg.height - y)
    for (const it of pg.items) {
      const color = COLORS[it.layer]
      if (it.kind === 'text') {
        const size = mmToPt(it.size)
        const w = font.widthOfTextAtSize(it.text, size)
        const dx = it.anchor === 'middle' ? -w / 2 : it.anchor === 'end' ? -w : 0
        page.drawText(it.text, { x: X(it.x) + dx, y: Y(it.y), size, font, color })
        continue
      }
      const pts = it.closed ? [...it.pts, it.pts[0]] : it.pts
      for (let i = 0; i + 1 < pts.length; i++) {
        page.drawLine({
          start: { x: X(pts[i][0]), y: Y(pts[i][1]) },
          end: { x: X(pts[i + 1][0]), y: Y(pts[i + 1][1]) },
          thickness: mmToPt(it.width),
          color,
          dashArray: it.dash?.map(mmToPt),
        })
      }
    }
  }
  return doc.save()
}
