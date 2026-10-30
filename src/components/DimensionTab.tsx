import { isBent } from '../geometry/bend'
import { toStations } from '../geometry/profile'
import { useDesignStore } from '../store/designStore'
import { NumberField } from './NumberField'

export function DimensionTab() {
  const design = useDesignStore((s) => s.design)
  const { addPoint, insertAfter, updatePoint, removePoint, setDiameterKind, setThickness, clearAll } = useDesignStore.getState()
  const { points, diameterKind, thickness } = design
  const locked = isBent(design.bends)
  const stations = toStations(points, { diameterKind, thickness })
  const diameterBad = (d: number) => !(d > 0) || (diameterKind === 'outer' && d - 2 * thickness <= 0)

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="group" disabled={locked}>
        <legend>設定</legend>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span>直径の種類</span>
          <label className="flex items-center gap-1">
            <input type="radio" checked={diameterKind === 'outer'} onChange={() => setDiameterKind('outer')} /> 外径
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" checked={diameterKind === 'inner'} onChange={() => setDiameterKind('inner')} /> 内径
          </label>
          <label className="flex items-center gap-1">
            板厚 <NumberField value={thickness} onChange={setThickness} min={0} className="w-16" label="板厚" /> mm
          </label>
        </div>
      </fieldset>

      <fieldset className="group" disabled={locked}>
        <legend>測定点（単位 mm）</legend>
        <div className="sunken overflow-x-auto">
          <table className="grid">
            <thead>
              <tr>
                <th>No</th>
                <th>前の点からの距離</th>
                <th>直径</th>
                <th>位置 s</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={p.id}>
                  <td className="text-center">{i + 1}</td>
                  <td>
                    {i === 0 ? (
                      <span className="block pr-1 text-right">0（開始）</span>
                    ) : (
                      <NumberField
                        value={p.distance}
                        onChange={(v) => updatePoint(i, { distance: v })}
                        invalid={!(p.distance > 0)}
                        min={0}
                        className="w-full"
                        label={`距離 ${i + 1}`}
                        autoFocus={i === points.length - 1 && Number.isNaN(p.distance)}
                      />
                    )}
                  </td>
                  <td>
                    <NumberField
                      value={p.diameter}
                      onChange={(v) => updatePoint(i, { diameter: v })}
                      invalid={diameterBad(p.diameter)}
                      min={0}
                      className="w-full"
                      label={`直径 ${i + 1}`}
                      autoFocus={points.length === 1 && Number.isNaN(p.diameter)}
                    />
                  </td>
                  <td className="text-right font-mono">{Number.isFinite(stations[i].s) ? stations[i].s.toFixed(1) : '—'}</td>
                  <td className="whitespace-nowrap">
                    <button className="btn !min-h-7 !px-2" title="この下に挿入（区間を二等分）" onClick={() => insertAfter(i)}>
                      挿入
                    </button>
                    <button className="btn !min-h-7 !px-2" disabled={points.length <= 1} onClick={() => removePoint(i)}>
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex gap-2">
          <button className="btn" onClick={addPoint}>
            ＋ 測定点を追加
          </button>
          <button className="btn" onClick={() => window.confirm('寸法と曲げをすべて消去します。よろしいですか？') && clearAll()}>
            すべてクリア
          </button>
        </div>
      </fieldset>
    </div>
  )
}
