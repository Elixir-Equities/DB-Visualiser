/**
 * Stroke icons shared across the app. Decorative by default (aria-hidden);
 * the button that wraps an icon carries the accessible label.
 */
function Icon({ className = 'w-3.5 h-3.5', strokeWidth = 2, children, fill = 'none' }) {
  return (
    <svg
      className={`flex-shrink-0 ${className}`}
      fill={fill}
      viewBox="0 0 24 24"
      stroke={fill === 'none' ? 'currentColor' : 'none'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const DatabaseIcon = (p) => (
  <Icon strokeWidth={1.6} {...p}>
    <ellipse cx="12" cy="5.5" rx="8" ry="2.5" />
    <path d="M4 5.5v13c0 1.38 3.58 2.5 8 2.5s8-1.12 8-2.5v-13M4 12c0 1.38 3.58 2.5 8 2.5s8-1.12 8-2.5" />
  </Icon>
)
export const RefreshIcon = (p) => (
  <Icon {...p}>
    <path d="M20 11a8 8 0 00-14.9-3.5M4 4v4h4M4 13a8 8 0 0014.9 3.5M20 20v-4h-4" />
  </Icon>
)
export const ChevronRightIcon = (p) => <Icon strokeWidth={2.5} {...p}><path d="M9 5l7 7-7 7" /></Icon>
export const ChevronLeftIcon = (p) => <Icon strokeWidth={2.5} {...p}><path d="M15 19l-7-7 7-7" /></Icon>
export const ChevronDownIcon = (p) => <Icon strokeWidth={2.5} {...p}><path d="M6 9l6 6 6-6" /></Icon>
export const FirstPageIcon = (p) => <Icon strokeWidth={2.5} {...p}><path d="M17 18l-6-6 6-6M7 6v12" /></Icon>
export const TableIcon = (p) => (
  <Icon strokeWidth={1.8} {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 10h18M9 10v10" />
  </Icon>
)
export const SearchIcon = (p) => <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Icon>
export const CloseIcon = (p) => <Icon {...p}><path d="M6 6l12 12M18 6L6 18" /></Icon>
export const PlayIcon = (p) => <Icon fill="currentColor" {...p}><path d="M7 4.5v15l12-7.5-12-7.5z" /></Icon>
export const CopyIcon = (p) => (
  <Icon {...p}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1" />
  </Icon>
)
export const CheckIcon = (p) => <Icon strokeWidth={2.5} {...p}><path d="M5 13l4 4L19 7" /></Icon>
export const DownloadIcon = (p) => <Icon {...p}><path d="M12 4v11m0 0l-4-4m4 4l4-4M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2" /></Icon>
export const HistoryIcon = (p) => <Icon {...p}><path d="M3 12a9 9 0 103-6.7L3 8M3 3v5h5M12 7v5l3 2" /></Icon>
export const ColumnsIcon = (p) => <Icon {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v16" /></Icon>
export const LockIcon = (p) => <Icon {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></Icon>
export const KeyIcon = (p) => <Icon {...p}><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l3 3M15 8l2 2" /></Icon>
export const AlertIcon = (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></Icon>
export const SortIcon = ({ dir, ...p }) => (
  <Icon strokeWidth={2.5} {...p}>
    {dir === 'asc' ? <path d="M12 19V5M6 11l6-6 6 6" /> : <path d="M12 5v14M6 13l6 6 6-6" />}
  </Icon>
)
export const SidebarIcon = (p) => <Icon {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></Icon>
export const EditIcon = (p) => <Icon {...p}><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" /></Icon>
