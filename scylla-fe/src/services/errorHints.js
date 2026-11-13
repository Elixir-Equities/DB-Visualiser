/**
 * One line of plain-language advice for the Scylla/CQL errors people hit most.
 * The raw message is always shown as well — this only adds context.
 */
const HINTS = [
  {
    test: /ALLOW FILTERING/i,
    hint: 'This filter is not on the partition key, so Scylla would have to scan the whole table. Filter by the partition key (see the Schema tab) — or append ALLOW FILTERING only if a full scan is acceptable.',
  },
  {
    test: /unconfigured (table|columnfamily)|table .* does not exist/i,
    hint: 'That table does not exist in this keyspace. Check the spelling and the keyspace prefix.',
  },
  {
    test: /keyspace .* does not exist|no keyspace has been specified/i,
    hint: 'Prefix the table with its keyspace, e.g. keyspace_name.table_name.',
  },
  {
    test: /undefined (name|column)|unknown identifier|undefined column name/i,
    hint: 'A column in the query does not exist on this table. The Schema tab lists every column.',
  },
  {
    test: /PRIMARY KEY column .* cannot be restricted|clustering column .* cannot be restricted|partition key parts/i,
    hint: 'Restrictions must follow the primary key order: every partition key column first, then clustering columns from left to right.',
  },
  {
    test: /syntax ?exception|no viable alternative|mismatched input|line \d+:\d+/i,
    hint: 'CQL syntax error — the position (line:column) in the message points at the problem.',
  },
  {
    test: /timed? ?out|timeout/i,
    hint: 'The query took too long. Narrow it with a partition key restriction or a smaller LIMIT.',
  },
  {
    test: /duplicate column names/i,
    hint: 'Give each selected expression a unique alias with AS.',
  },
  {
    test: /unable to safely mask/i,
    hint: 'This result contains protected data that could not be masked, so it was withheld. Select fewer or different columns.',
  },
  {
    test: /^network error$|network ?error|failed to fetch|ECONN/i,
    hint: 'The server could not be reached. Check your connection and the status indicator at the top right.',
  },
]

export function errorHint(message) {
  if (!message) return null
  return HINTS.find(({ test }) => test.test(message))?.hint ?? null
}
