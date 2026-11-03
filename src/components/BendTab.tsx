import { foldParams, MAX_FOLD_DEG } from '../geometry/fold'
import { bendProblem, draftFold, foldablePoints, useDesignStore } from '../store/designStore'
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
  const { startBend, pickPoint, confirmPick, setPhi, confirmDir, setAmount, confirmAmount, cancelBend, removeBend, removeAllBends } = useDesignStore.getState()
  const { profile, check } = useDerived()
  if (!profile || !check) return <p>寸法にエラーがあるため曲げられません。</p>

  const candidates = foldablePoints(design)
  const f = draftFold(design, draft)
  const problem = f ? bendProblem(design, f) : null
  const sOf = (i: number) => profile.stations[i]?.s ?? NaN
  const folds = design.points
    .map((p, i) => ({ i, fold: design.folds.find((x) => x.pointId === p.id) }))
    .filter((x): x is { i: number; fold: NonNullable<typeof x.fold> } => !!x.fold)

  return (
    <div className="flex flex-col gap-3">
      {!draft && (
        <button className="btn primary self-start" disabled={candidates.length === 0} onClick={startBend}>
          曲げを追加
        </button>
      )}
      {!draft && candidates.length === 0 && <p>曲げるには、寸法タブで測定点を 3 点以上入力してください（先頭と末尾以外の測定点で曲げます）。</p>}

      {draft && (
        <fieldset className="group">
          <legend>曲げを追加（手順 {draft.step === 'pick' ? 1 : draft.step === 'dir' ? 2 : 3} / 3）</legend>
          {draft.step === 'pick' && (
            <>
              <p>折る測定点を選んでください。3D 画面をタップしても選べます。区間の途中で曲げたいときは、先に寸法タブの「挿入」で測定点を追加してください。</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {candidates.map((i) => (
                  <button key={i} className={`btn !px-2 ${draft.index === i ? 'on' : ''}`} onClick={() => pickPoint(i)}>
                    No.{i + 1}（{sOf(i).toFixed(0)}mm）
                  </button>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <button className="btn primary" disabled={draft.index === null} onClick={confirmPick}>
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
              <p>測定点 No.{draft.index + 1} から先を曲げる方向を、軸まわりの角度で指定してください。3D 画面の赤い矢印の向きに曲がります。矢印が見えにくいときは 3D 画面をドラッグして回してください。</p>
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
                測定点 No.{draft.index + 1} で、方向 {draft.phiDeg.toFixed(0)}° に曲げる角度を指定してください（{MAX_FOLD_DEG}° まで）。3D 画面に結果を表示しています。
              </p>
              <div className="mt-2 flex items-center gap-1">
                <span className="pr-1">曲げ角度</span>
                <button className="btn !px-2" onClick={() => setAmount({ thetaDeg: Math.max(0, draft.thetaDeg - 5) })}>
                  −5
                </button>
                <NumberField value={draft.thetaDeg} onChange={(v) => setAmount({ thetaDeg: v })} min={0} className="w-20" label="曲げ角度" />
                <button className="btn !px-2" onClick={() => setAmount({ thetaDeg: draft.thetaDeg + 5 })}>
                  ＋5
                </button>
                <span>°</span>
              </div>
              {problem && <p className="warn mt-1">決定できません: {problem}</p>}
              <div className="mt-2 flex gap-2">
                <button className="btn primary" disabled={!!problem || !(draft.thetaDeg >= 0)} onClick={confirmAmount}>
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
        {folds.length === 0 ? (
          <p>曲げはまだありません（直線）。</p>
        ) : (
          <div className="sunken overflow-x-auto">
            <table className="grid">
              <thead>
                <tr>
                  <th>測定点</th>
                  <th>位置 s</th>
                  <th>方向</th>
                  <th>角度</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {folds.map(({ i, fold }) => {
                  const p = foldParams(fold)
                  return (
                    <tr key={fold.id}>
                      <td className="text-center">No.{i + 1}</td>
                      <td className="text-right font-mono">{sOf(i).toFixed(0)}</td>
                      <td className="text-right font-mono">{p.phiDeg.toFixed(0)}°</td>
                      <td className="text-right font-mono">{p.thetaDeg.toFixed(1)}°</td>
                      <td>
                        <button className="btn !min-h-7 !px-2" disabled={!!draft} onClick={() => removeBend(fold.id)}>
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
        {folds.length > 0 && (
          <button className="btn mt-2" disabled={!!draft} onClick={removeAllBends}>
            曲げをすべて削除
          </button>
        )}
      </fieldset>

      {check.issues.map((i, k) => (
        <p key={k} className="warn">
          {i.level === 'error' ? '×' : '△'} {i.message}
        </p>
      ))}
    </div>
  )
}
