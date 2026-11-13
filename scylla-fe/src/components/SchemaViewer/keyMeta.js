/** Visual treatment for each primary-key role, shared by schema and grid views. */
export const KEY_META = {
  partition_key: {
    label: 'partition key',
    short: 'PK',
    badge: 'bg-indigo-500/15 text-indigo-200 border border-indigo-500/40',
    text: 'text-indigo-200',
  },
  clustering: {
    label: 'clustering',
    short: 'CK',
    badge: 'bg-cyan-500/10 text-cyan-200 border border-cyan-500/40',
    text: 'text-cyan-200',
  },
  regular: {
    label: 'regular',
    short: '',
    badge: 'bg-gray-800 text-gray-400 border border-gray-700',
    text: 'text-gray-200',
  },
  static: {
    label: 'static',
    short: 'S',
    badge: 'bg-amber-500/10 text-amber-200 border border-amber-500/40',
    text: 'text-amber-100',
  },
}
