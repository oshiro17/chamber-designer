import type { DrawItem, Page } from './layout'

const COLORS: Record<string, string> = {
  cut: '#000000',
  mark: '#c2410c',
  guide: '#6b7280',
  frame: '#374151',
  info: '#1d4ed8',
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const num = (v: number) => (Math.round(v * 1000) / 1000).toString()

function itemSvg(it: DrawItem): string {
  const color = COLORS[it.layer]
  if (it.kind === 'text') {
    return `<text x="${num(it.x)}" y="${num(it.y)}" font-size="${num(it.size)}" text-anchor="${it.anchor}" fill="${color}" font-family="Helvetica, Arial, sans-serif">${esc(it.text)}</text>`
  }
  const d = it.pts.map((p, i) => `${i ? 'L' : 'M'}${num(p[0])} ${num(p[1])}`).join(' ') + (it.closed ? ' Z' : '')
  const dash = it.dash ? ` stroke-dasharray="${it.dash.join(' ')}"` : ''
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${num(it.width)}"${dash} stroke-linejoin="round"/>`
}

/** 1 ページの SVG。width/height を mm で指定し、viewBox も mm なので実寸になる */
export function pageToSvg(page: Page): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${page.width}mm" height="${page.height}mm" viewBox="0 0 ${page.width} ${page.height}">`,
    `<rect width="${page.width}" height="${page.height}" fill="#ffffff"/>`,
    ...page.items.map(itemSvg),
    '</svg>',
  ].join('\n')
}
