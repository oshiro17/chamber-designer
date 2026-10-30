import { handleParams } from '../geometry/bend'
import { WARN_RATIO } from '../geometry/shapeCheck'
import { bendProblem, draftHandle, useDesignStore } from '../store/designStore'
import { useDerived } from '../store/derived'
import { NumberField } from './NumberField'

const DIRS = [
  { deg: 0, label: '上' },
  { deg: 90, label: '手前' },
  { deg: 180, label: '下' },
  { deg: 270, label: '奥' },
]

export function BendTab() {
  const design = useDesignStore((s) => s.design)
  const draft = useDesignStore((s) => s.draft)
  const { startBend, confirmPick, setPhi, confirmDir, setAmount, confirmAmount, cancelBend, removeBend, removeAllBends } = useDesignStore.getState()
  const { profile, check } = useDerived()
  if (!profile || !check) return <p>寸法にエラーがあるため曲げられません。</p>

  const h = draftHandle(draft)
  const problem = h ? bendProblem(design, h) : null

  return (
    <div className="flex flex-col gap-3">
      {!draft && (
        <button className="btn primary self-start" onClick={startBend}>
          曲げを追加
        </button>
      )}

      {draft && (
        <fieldset className="group">
          <legend>曲げを追加（手順 {draft.step === 'pick' ? 1 : draft.step === 'dir' ? 2 : 3} / 3）</legend>
          {draft.step === 'pick' && (
            <>
              <p>3D 画面で、曲げたい位置の中心をタップしてください。</p>
              <p className="mt-1 font-mono">位置 s = {draft.s === null ? '未選択' : `${draft.s.toFixed(0)} mm`}</p>
              <div className="mt-2 flex gap-2">
                <button className="btn primary" disabled={draft.s === null} onClick={confirmPick}>
                  決定
                </button>
                <button className="btn" onClick={cancelBend}>
                  取消
                </button>
              </div>
            </>
          )}

          {draft.step === 'dir' && (
            <>
              <p>曲げる方向を、軸まわりの角度で指定してください。3D 画面の赤い矢印の向きに曲がります。矢印が見えにくいときは 3D 画面をドラッグして回してください。</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {DIRS.map((d) => (
                  <button key={d.deg} className={`btn ${Math.round(draft.phiDeg) === d.deg ? 'on' : ''}`} onClick={() => setPhi(d.deg)}>
                    {d.label}（{d.deg}°）
                  </button>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button className="btn" onClick={() => setPhi(draft.phiDeg - 5)}>
                  −5°
                </button>
                <NumberField value={Math.round(draft.phiDeg * 10) / 10} onChange={setPhi} className="w-20" label="方向" />
                <span>°</span>
                <button className="btn" onClick={() => setPhi(draft.phiDeg + 5)}>
                  ＋5°
                </button>
              </div>
              <div className="mt-2 flex gap-2">
                <button className="btn primary" onClick={confirmDir}>
                  決定
                </button>
                <button className="btn" onClick={cancelBend}>
                  取消
                </button>
              </div>
            </>
          )}

          {draft.step === 'amount' && (
            <>
              <p>
                方向 {draft.phiDeg.toFixed(0)}° に曲げる角度と、曲げ半径（中心軸）を指定してください。3D 画面に結果を表示しています。
              </p>
              <table className="mt-2">
                <tbody>
                  <tr>
                    <td className="pr-2">曲げ角度</td>
                    <td className="flex items-center gap-1 py-1">
                      <button className="btn !px-2" onClick={() => setAmount({ thetaDeg: Math.max(0, draft.thetaDeg - 5) })}>
                        −5
                      </button>
                      <NumberField value={draft.thetaDeg} onChange={(v) => setAmount({ thetaDeg: v })} min={0} className="w-20" label="曲げ角度" />
                      <button className="btn !px-2" onClick={() => setAmount({ thetaDeg: draft.thetaDeg + 5 })}>
                        ＋5
                      </button>
                      <span>°</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="pr-2">曲げ半径</td>
                    <td className="flex items-center gap-1 py-1">
                      <button className="btn !px-2" onClick={() => setAmount({ radius: Math.max(10, draft.radius - 10) })}>
                        −10
                      </button>
                      <NumberField value={draft.radius} onChange={(v) => setAmount({ radius: v })} min={1} className="w-20" label="曲げ半径" />
                      <button className="btn !px-2" onClick={() => setAmount({ radius: draft.radius + 10 })}>
                        ＋10
                      </button>
                      <span>mm</span>
                    </td>
                  </tr>
                </tbody>
              </table>
              {problem ? <p className="warn mt-1">決定できません: {problem}</p> : <p className="mt-1">曲げる範囲: {h!.width.toFixed(0)} mm（s = {(draft.s - h!.width / 2).toFixed(0)}〜{(draft.s + h!.width / 2).toFixed(0)}）</p>}
              <div className="mt-2 flex gap-2">
                <button className="btn primary" disabled={!!problem} onClick={confirmAmount}>
                  決定
                </button>
                <button className="btn" onClick={cancelBend}>
                  取消
                </button>
              </div>
            </>
          )}
        </fieldset>
      )}

      <fieldset className="group">
        <legend>曲げ一覧</legend>
        {design.bends.length === 0 ? (
          <p>曲げはまだありません（直線）。</p>
        ) : (
          <div className="sunken overflow-x-auto">
            <table className="grid">
              <thead>
                <tr>
                  <th>No</th>
                  <th>位置 s</th>
                  <th>方向</th>
                  <th>角度</th>
                  <th>半径</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {design.bends.map((b, i) => {
                  const p = handleParams(b)
                  return (
                    <tr key={b.id}>
                      <td className="text-center">{i + 1}</td>
                      <td className="text-right font-mono">{b.s.toFixed(0)}</td>
                      <td className="text-right font-mono">{p.phiDeg.toFixed(0)}°</td>
                      <td className="text-right font-mono">{p.thetaDeg.toFixed(1)}°</td>
                      <td className="text-right font-mono">{Number.isFinite(p.radius) ? p.radius.toFixed(0) : '—'}</td>
                      <td>
                        <button className="btn !min-h-7 !px-2" disabled={!!draft} onClick={() => removeBend(b.id)}>
                          削除
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {design.bends.length > 0 && (
          <button className="btn mt-2" disabled={!!draft} onClick={removeAllBends}>
            曲げをすべて削除
          </button>
        )}
      </fieldset>

      <fieldset className="group">
        <legend>チェック</legend>
        <table>
          <tbody>
            <tr>
              <td className="pr-3">中心軸長</td>
              <td className="font-mono">
                {profile.length.toFixed(1)} mm（誤差 {check.lengthError.toExponential(0)} mm）
              </td>
            </tr>
            <tr>
              <td className="pr-3">最小曲げ半径</td>
              <td className={`font-mono ${check.minRatio < WARN_RATIO ? 'warn' : ''}`}>
                {Number.isFinite(check.minRadius) ? `${check.minRadius.toFixed(0)} mm（外径の ${check.minRatio.toFixed(2)} 倍）` : '直線'}
              </td>
            </tr>
          </tbody>
        </table>
        {check.issues.map((i, k) => (
          <p key={k} className="warn mt-1">
            {i.level === 'error' ? '×' : '△'} {i.message}
          </p>
        ))}
      </fieldset>
    </div>
  )
}
