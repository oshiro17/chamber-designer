import { useState } from 'react'
import { useDesignStore } from '../store/designStore'
import { NumberField } from './NumberField'

/** 3D 表示の右上（視点ボタンの横）に置く、チャンバー全体の向きの操作。回す軸を選んでバーで角度を決める。形と寸法は変わらない */
export function OrientControl() {
  const orient = useDesignStore((s) => s.design.orient)
  const setOrient = useDesignStore((s) => s.setOrient)
  const [axis, setAxis] = useState<'zDeg' | 'xDeg'>('zDeg')
  const value = orient[axis]
  const set = (v: number) => Number.isFinite(v) && setOrient({ [axis]: Math.max(-180, Math.min(180, v)) })

  return (
    <div className="flex items-center gap-1 rounded bg-white/90 px-1.5 py-0.5 text-[13px]">
      <span className="font-bold">向き</span>
      <button className={`btn !min-h-7 !px-2 ${axis === 'zDeg' ? 'on' : ''}`} onClick={() => setAxis('zDeg')}>
        傾ける
      </button>
      <button className={`btn !min-h-7 !px-2 ${axis === 'xDeg' ? 'on' : ''}`} onClick={() => setAxis('xDeg')}>
        倒す
      </button>
      <input
        type="range"
        min={-180}
        max={180}
        step={1}
        value={value}
        onChange={(e) => set(Number(e.target.value))}
        className="h-7 w-28 accent-[#222]"
        aria-label="回転角度"
      />
      <NumberField value={value} onChange={set} className="!min-h-7 w-14" label="回転角度" />
      <span>°</span>
      <button className="btn !min-h-7 !px-2" disabled={orient.zDeg === 0 && orient.xDeg === 0} onClick={() => setOrient({ zDeg: 0, xDeg: 0 })}>
        戻す
      </button>
    </div>
  )
}
