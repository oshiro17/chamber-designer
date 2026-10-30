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
  if (!fabrication) return <p>寸法にエラーがあるため展開できません。</p>
  const { fab, mismatch, errors, warnings, minCount } = fabrication
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
      </div>

      <fieldset className="group">
        <legend>分割</legend>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-1">
            <input type="radio" checked={settings.mode === 'auto'} onChange={() => setFab({ mode: 'auto' })} /> 自動　継ぎ目の折れ角
            <NumberField value={settings.maxAngleDeg} min={1} disabled={settings.mode !== 'auto'} onChange={(v) => setFab({ maxAngleDeg: Math.min(Math.max(v, 1), 45) })} className="w-16" label="最大折れ角" />
            ° 以下
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" checked={settings.mode === 'count'} onChange={() => setFab({ mode: 'count' })} /> 部品数を指定
            <NumberField value={settings.count} min={minCount} disabled={settings.mode !== 'count'} onChange={(v) => setFab({ count: Math.max(minCount, Math.round(v)) })} className="w-16" label="部品数" />
            個（最小 {minCount}）
          </label>
        </div>
      </fieldset>

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
        <label className="mt-2 flex items-center gap-1">
          溶接用の余白 <NumberField value={settings.allowance} min={0} onChange={(v) => setFab({ allowance: Math.min(Math.max(v, 0), 20) })} className="w-16" label="余白" /> mm
        </label>
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
