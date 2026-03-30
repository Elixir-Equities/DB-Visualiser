/**
 * @typedef {Object} Keyspace
 * @property {string} name
 * @property {Table[]} tables
 */

/**
 * @typedef {Object} Table
 * @property {string} name
 * @property {string} keyspace
 */

/**
 * @typedef {Object} QueryResult
 * @property {string[]} columns
 * @property {Array<Record<string, unknown>>} rows
 * @property {number} duration_ms
 * @property {string|null} error
 */
