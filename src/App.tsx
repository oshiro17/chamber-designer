import { useState, type ReactNode } from 'react'
import { BendTab } from './components/BendTab'
import { DimensionTab } from './components/DimensionTab'
import { PatternView } from './components/PatternView'
import { PagePreview, PrintTab } from './components/PrintTab'
import { UnrollTab } from './components/UnrollTab'
import { usePages } from './components/usePages'
import { Viewer3D } from './components/Viewer3D'
import { mm3ToLiters } from './geometry/profile'
import { DerivedContext, useComputeDerived, useFabrication } from './store/derived'
import { useDesignStore, type Tab } from './store/designStore'

const TABS: { key: Tab; label: string }[] = [
  { key: 'dimension', label: '寸法' },
  { key: 'bend', label: '曲げ' },
  { key: 'unroll', label: '展開図' },
  { key: 'output', label: '印刷' },
]

export default function App() {
  const derived = useComputeDerived()
  const tab = useDesignStore((s) => s.tab)
  const setTab = useDesignStore((s) => s.setTab)
  const message = useDesignStore((s) => s.message)
  const fabrication = useFabrication(derived, tab === 'unroll' || tab === 'output')
  const pages = usePages(tab === 'output' ? fabrication : null)
  const [unrollView, setUnrollView] = useState<'pattern' | '3d'>('pattern')
  const { result, profile, centerline } = derived

  const viewer =
    profile && centerline ? (
      <Viewer3D profile={profile} centerline={centerline} fabrication={tab === 'unroll' ? fabrication : null} />
    ) : (
      <div className="flex h-full items-center justify-center bg-[#1a1d22] p-6 text-center text-white">直径と距離を入力すると 3D が表示されます</div>
    )

  let view: ReactNode = viewer
  if (tab === 'unroll' && unrollView === 'pattern') view = <PatternView fabrication={fabrication} />
  if (tab === 'output') view = <PagePreview pages={pages} />

  const panel =
    tab === 'dimension' ? (
      <DimensionTab />
    ) : tab === 'bend' ? (
      <BendTab />
    ) : tab === 'unroll' ? (
      <UnrollTab fabrication={fabrication} view={unrollView} onView={setUnrollView} />
    ) : (
      <PrintTab fabrication={fabrication} pages={pages} />
    )

  const errors = result.ok ? [] : result.issues.map((i) => i.message)

  return (
    <DerivedContext.Provider value={derived}>
      <div className="flex h-dvh flex-col">
        <div className="titlebar">チャンバーデザイナー</div>

        <div className="flex border-b border-[#ddd] px-2">
          {TABS.map((t) => (
            <button key={t.key} className={`tab ${tab === t.key ? 'on' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 lg:flex-row">
          <div className="sunken order-1 h-[42dvh] shrink-0 lg:order-2 lg:h-auto lg:min-w-0 lg:flex-1">{view}</div>
          <div className="order-2 min-h-0 flex-1 overflow-y-auto pr-1 lg:order-1 lg:w-[420px] lg:flex-none">
            {panel}
            {errors.length > 0 && (
              <div className="mt-2">
                {errors.map((e, i) => (
                  <p key={i} className="warn">
                    × {e}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="statusbar flex gap-3 overflow-hidden whitespace-nowrap" style={{ paddingBottom: 'max(2px, env(safe-area-inset-bottom))' }}>
          <span>全長 {result.ok ? `${result.profile.length.toFixed(1)} mm` : '—'}</span>
          <span>容積 {result.ok ? `${mm3ToLiters(result.profile.volume).toFixed(3)} L` : '—'}</span>
          <span className="truncate">{message}</span>
        </div>
      </div>
    </DerivedContext.Provider>
  )
}
