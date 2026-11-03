import { SHORT_PIECE, type Fabrication } from '../geometry/fabrication'
import { useDesignStore } from '../store/designStore'
import { NumberField } from './NumberField'

const SEAM_DIRS = [
  { deg: 0, label: '上' },
  { deg: 90, label: '手前' },
  { deg: 180, label: '下' },
  { deg: 270, label: '奥' },
]

export function UnrollTab({ fabrication, view, onView }: { fabrication: Fabrication | null; view: 'pattern' | '3d'; onView: (v: 'pattern' | '3d') => void }) {
  const settings = useDesignStore((s) => s.design.fabrication)
  const setFab = useDesignStore((s) => s.setFabrication)
  const setTab = useDesignStore((s) => s.setTab)
  const playAssemble = useDesignStore((s) => s.playAssemble)
  if (!fabrication) return <p>寸法にエラーがあるため展開できません。</p>
  const { fab, mismatch, errors, warnings } = fabrication
  const maxMis = mismatch.length ? Math.max(...mismatch) : 0

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1">
        <button className={`btn ${view === 'pattern' ? 'on' : ''}`} onClick={() => onView('pattern')}>
          展開図を表示
        </button>
        <button className={`btn ${view === '3d' ? 'on' : ''}`} onClick={() => onView('3d')}>
          3D で部品を表示
        </button>
        <button
          className="btn"
          disabled={!fabrication || fabrication.errors.length > 0}
          onClick={() => {
            onView('3d')
            playAssemble()
          }}
        >
          組み立てを再生
        </button>
      </div>

      <fieldset className="group">
        <legend>溶接</legend>
        <p>溶接線の位置（全部品で一直線になります。3D では赤線）</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {SEAM_DIRS.map((d) => (
            <button key={d.deg} className={`btn ${settings.seam === d.deg ? 'on' : ''}`} onClick={() => setFab({ seam: d.deg })}>
              {d.label}
            </button>
          ))}
          <label className="flex items-center gap-1">
            <NumberField value={settings.seam} onChange={(v) => Number.isFinite(v) && setFab({ seam: ((v % 360) + 360) % 360 })} className="w-16" label="溶接線の角度" />°
          </label>
        </div>
      </fieldset>

      <fieldset className="group">
        <legend>結果</legend>
        <table>
          <tbody>
            <Row k="部品数" v={`${fab.pieces.length} 個`} />
            <Row k="部品の軸長の合計" v={`${fab.totalLength.toFixed(2)} mm`} />
            <Row k="設計形状との最大ずれ" v={`${fab.maxDeviation.toFixed(2)} mm`} />
            <Row k="継ぎ目の最大折れ角" v={`${(fab.maxMiterDeg * 2).toFixed(1)}°`} />
            <Row k="継ぎ目の合わせずれ" v={`最大 ${maxMis.toFixed(2)} mm`} warn={maxMis > 1} />
          </tbody>
        </table>
        {errors.map((t, i) => (
          <p key={`e${i}`} className="warn mt-1">
            × {t}
          </p>
        ))}
        {warnings.map((t, i) => (
          <p key={`w${i}`} className="warn mt-1">
            △ {t}
          </p>
        ))}
      </fieldset>

      <fieldset className="group">
        <legend>部品一覧（mm）</legend>
        <div className="sunken overflow-x-auto">
          <table className="grid font-mono">
            <thead>
              <tr>
                <th>No</th>
                <th>s 範囲</th>
                <th>軸長</th>
                <th>外径</th>
              </tr>
            </thead>
            <tbody>
              {fab.pieces.map((p, i) => (
                <tr key={i} className={p.length < SHORT_PIECE ? 'warn' : ''}>
                  <td className="text-center">{i + 1}</td>
                  <td>
                    {p.s0.toFixed(0)}–{p.s1.toFixed(0)}
                  </td>
                  <td className="text-right">{p.length.toFixed(1)}</td>
                  <td>
                    {p.d0Outer.toFixed(1)}→{p.d1Outer.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </fieldset>

      <button className="btn primary self-start" disabled={errors.length > 0} onClick={() => setTab('output')}>
        印刷へ進む
      </button>
    </div>
  )
}

function Row({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <tr>
      <td className="pr-3">{k}</td>
      <td className={`font-mono ${warn ? 'warn' : ''}`}>{v}</td>
    </tr>
  )
}
