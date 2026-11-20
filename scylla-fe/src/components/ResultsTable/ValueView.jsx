import { describeValue, VALUE_CLASS } from '../../services/valueFormat.js'
import { LockIcon } from '../ui/icons.jsx'

// Long single-line values are clipped by CSS; this caps the DOM text size.
const MAX_INLINE = 400

export function MaskedPill({ label }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded border border-gray-700 bg-gray-800/80 px-1.5 py-px font-sans text-[11px] text-gray-400"
      title="Hidden by the data-masking policy"
    >
      <LockIcon className="w-3 h-3" />
      masked · {label}
    </span>
  )
}

export function NullValue() {
  return <span className="italic text-gray-500 select-none">null</span>
}

/** Single-line value for grid cells. */
export function InlineValue({ value }) {
  const v = describeValue(value)
  if (v.kind === 'null') return <NullValue />
  if (v.kind === 'masked') return <MaskedPill label={v.label} />
  const text = v.text.length > MAX_INLINE ? v.text.slice(0, MAX_INLINE) + '…' : v.text
  return <span className={VALUE_CLASS[v.kind]}>{text}</span>
}
