import { useEffect, useState } from 'react'

interface Props {
  /** NaN は未入力として空欄で表示する */
  value: number
  onChange: (v: number) => void
  invalid?: boolean
  min?: number
  disabled?: boolean
  className?: string
  label?: string
  autoFocus?: boolean
}

const show = (v: number) => (Number.isFinite(v) ? String(v) : '')

/** 入力途中の文字列を保持し、数値か空欄（NaN）のときだけ onChange する */
export function NumberField({ value, onChange, invalid = false, min, disabled, className = 'w-20', label, autoFocus }: Props) {
  const [text, setText] = useState(show(value))

  useEffect(() => {
    const cur = text.trim() === '' ? NaN : Number(text)
    if (!Object.is(cur, value) && cur !== value) setText(show(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const blank = text.trim() === ''
  const parsed = Number(text)
  const bad = !blank && (invalid || !Number.isFinite(parsed) || (min !== undefined && parsed < min))

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      autoFocus={autoFocus}
      disabled={disabled}
      className={`field text-right ${bad ? 'warn' : ''} ${className}`}
      style={bad ? { background: '#ffe0e0' } : undefined}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        const v = e.target.value.trim() === '' ? NaN : Number(e.target.value)
        if (Number.isNaN(v) || Number.isFinite(v)) onChange(v)
      }}
      onFocus={(e) => {
        e.target.select()
        // キーボードが出きってから、入力欄を見える範囲の中央へスクロールする
        const el = e.target
        setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 350)
      }}
    />
  )
}
