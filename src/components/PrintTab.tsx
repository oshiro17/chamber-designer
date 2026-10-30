import { useMemo, useState } from 'react'
import type { Fabrication } from '../geometry/fabrication'
import type { Page } from '../output/layout'
import { pagesToPdf } from '../output/pdf'
import { pageToSvg } from '../output/svg'
import { useDesignStore } from '../store/designStore'
import { downloadBlob } from '../store/persist'
import { NumberField } from './NumberField'

export function PrintTab({ fabrication, pages }: { fabrication: Fabrication | null; pages: Page[] }) {
  const print = useDesignStore((s) => s.design.print)
  const setPrint = useDesignStore((s) => s.setPrint)
  const [busy, setBusy] = useState(false)
  const ready = !!fabrication && fabrication.errors.length === 0 && pages.length > 0

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="group">
        <legend>用紙（A3）</legend>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1">
              <input type="radio" checked={print.orientation === 'landscape'} onChange={() => setPrint({ orientation: 'landscape' })} /> 横
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={print.orientation === 'portrait'} onChange={() => setPrint({ orientation: 'portrait' })} /> 縦
            </label>
          </div>
          <label className="flex items-center gap-1">
            余白 <NumberField value={print.margin} min={3} onChange={(v) => setPrint({ margin: Math.min(Math.max(v, 3), 40) })} className="w-16" label="余白" /> mm
          </label>
          <label className="flex items-center gap-1">
            ページの重なり <NumberField value={print.overlap} min={5} onChange={(v) => setPrint({ overlap: Math.min(Math.max(v, 5), 60) })} className="w-16" label="重なり" /> mm
          </label>
        </div>
      </fieldset>

      <button
        className="btn primary self-start"
        disabled={!ready || busy}
        onClick={async () => {
          setBusy(true)
          try {
            downloadBlob('chamber-patterns-A3.pdf', (await pagesToPdf(pages)) as BlobPart, 'application/pdf')
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? '作成中…' : `A3 実寸 PDF を保存（${pages.length} ページ）`}
      </button>
      {!ready && <p className="warn">展開図を作成できないため出力できません。展開図タブを確認してください。</p>}
    </div>
  )
}

export function PagePreview({ pages }: { pages: Page[] }) {
  const svgs = useMemo(() => pages.map(pageToSvg), [pages])
  if (pages.length === 0) return <div className="flex h-full items-center justify-center p-6">出力できるページがありません</div>
  return (
    <div className="h-full overflow-auto bg-[#eee] p-3">
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
        {svgs.map((svg, i) => (
          <figure key={i}>
            <div className="border border-[#ccc] bg-white [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
            <figcaption>
              {i + 1}/{pages.length} {pages[i].title}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}
