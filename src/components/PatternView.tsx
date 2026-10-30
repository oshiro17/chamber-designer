import { useMemo } from 'react'
import type { Fabrication } from '../geometry/fabrication'
import { pieceDrawing } from '../output/layout'
import { pageToSvg } from '../output/svg'

/** 部品ごとの展開図を並べて表示する（画面用の縮小表示） */
export function PatternView({ fabrication }: { fabrication: Fabrication | null }) {
  const svgs = useMemo(() => {
    if (!fabrication || fabrication.errors.length > 0) return []
    return fabrication.unrolled.map((u, i) => {
      const d = pieceDrawing(u, fabrication.fab.pieces[i], fabrication.unrolled.length)
      const pad = 8
      const items = d.items.map((it) =>
        it.kind === 'text' ? { ...it, x: it.x + pad, y: it.y + pad } : { ...it, pts: it.pts.map(([x, y]) => [x + pad, y + pad] as [number, number]) },
      )
      return { w: d.w + 2 * pad, svg: pageToSvg({ index: i, width: d.w + 2 * pad, height: d.h + 2 * pad, items, title: '' }) }
    })
  }, [fabrication])

  if (!fabrication) return <Empty text="寸法にエラーがあるため展開できません" />
  if (fabrication.errors.length > 0) return <Empty text={`展開できない部品があります（${fabrication.errors[0]}）`} />

  const maxW = Math.max(...svgs.map((s) => s.w))
  return (
    <div className="h-full overflow-auto bg-[#eee] p-3">
      <div className="flex flex-wrap items-start gap-3">
        {svgs.map((s, i) => (
          <figure key={i} className="border border-[#ccc] bg-white" style={{ width: `min(100%, ${Math.max(160, (s.w / maxW) * 640)}px)` }}>
            <div className="[&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: s.svg }} />
          </figure>
        ))}
      </div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center bg-[#eee] p-6 text-center">{text}</div>
}
