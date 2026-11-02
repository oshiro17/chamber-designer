import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { mmToPt, type Page } from './layout'

const COLORS = {
  cut: rgb(0, 0, 0),
  mark: rgb(0.76, 0.25, 0.05),
  guide: rgb(0.42, 0.45, 0.5),
  frame: rgb(0.22, 0.25, 0.32),
  info: rgb(0.11, 0.3, 0.85),
}

/** PDF の標準フォント（WinAnsi）で書けない文字（日本語など）は ? に置き換える */
export const pdfSafe = (t: string): string => t.replace(/[^\x20-\x7e\u00b0]/g, '?')

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
        const text = pdfSafe(it.text)
        const w = font.widthOfTextAtSize(text, size)
        const dx = it.anchor === 'middle' ? -w / 2 : it.anchor === 'end' ? -w : 0
        // ページ座標の時計回りは、y が上向きの PDF では反時計回りの逆向きになる。中央・右寄せのずらしも文字の向きに沿わせる
        const a = (-(it.angle ?? 0) * Math.PI) / 180
        page.drawText(text, { x: X(it.x) + dx * Math.cos(a), y: Y(it.y) + dx * Math.sin(a), size, font, color, rotate: degrees((a * 180) / Math.PI) })
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
