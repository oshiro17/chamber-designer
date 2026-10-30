import { useState } from 'react'
import { useDesignStore } from '../store/designStore'
import { deleteSaved, listSaved, saveNamed, type SavedDesign } from '../store/library'

/** ヘッダー右の［保存］［開く］。開くと保存した設計の一覧を出す */
export function Library() {
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<SavedDesign[]>([])
  const { say, loadDesign } = useDesignStore.getState()

  const save = () => {
    const name = window.prompt('保存する名前（例: KX125 純正）')?.trim()
    if (!name) return
    if (listSaved().some((e) => e.name === name) && !window.confirm(`「${name}」は保存済みです。上書きしますか？`)) return
    try {
      saveNamed(name, useDesignStore.getState().design)
      say(`「${name}」を保存しました`)
      if (open) setList(listSaved())
    } catch {
      say('保存できませんでした（ブラウザの保存容量が足りないか、プライベートブラウズの可能性があります）')
    }
  }

  return (
    <div className="relative flex gap-1">
      <button className="btn !min-h-8" onClick={save}>
        保存
      </button>
      <button
        className={`btn !min-h-8 ${open ? 'on' : ''}`}
        onClick={() => {
          setList(listSaved())
          setOpen((o) => !o)
        }}
      >
        開く
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-30 max-h-[60dvh] w-[min(92vw,360px)] overflow-y-auto rounded border border-[#ccc] bg-white p-2 shadow-lg">
          {list.length === 0 ? (
            <p className="p-2 text-[#777]">保存した設計はありません</p>
          ) : (
            <table className="grid">
              <tbody>
                {list.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <div>{e.name}</div>
                      <div className="text-[12px] text-[#888]">{new Date(e.savedAt).toLocaleString('ja-JP')}</div>
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <button
                        className="btn !min-h-8 !px-2"
                        onClick={() => {
                          if (!window.confirm(`「${e.name}」を開きます。いまの画面の内容は置き換わります（保存していない変更は消えます）`)) return
                          loadDesign(e.design, e.name)
                          setOpen(false)
                        }}
                      >
                        開く
                      </button>
                      <button
                        className="btn !min-h-8 !px-2"
                        onClick={() => {
                          if (!window.confirm(`「${e.name}」を削除しますか？`)) return
                          deleteSaved(e.id)
                          setList(listSaved())
                        }}
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
