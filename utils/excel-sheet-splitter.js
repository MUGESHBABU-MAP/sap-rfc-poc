/**
 * Excel Sheet Splitter (Phase 3.17B)
 *
 * Generic utility for splitting datasets that exceed Excel's row limit.
 * Uses a safe maximum (1,000,000 rows) to account for header rows,
 * totals rows, and future metadata.
 *
 * Excel XLSX Limits:
 *   Max Rows: 1,048,576
 *   Max Columns: 16,384
 *
 * Safe Limit Used: 1,000,000 rows per sheet
 */

const EXCEL_MAX_ROWS = 1048576;
const SAFE_MAX_ROWS = 1000000;

/**
 * Split an array of records into chunks of at most chunkSize.
 *
 * @param {Array} records - The full array to split
 * @param {number} [chunkSize=SAFE_MAX_ROWS] - Max records per chunk
 * @returns {Array[]} Array of arrays, each at most chunkSize length
 */
function splitIntoChunks(records, chunkSize) {
  const size = chunkSize || SAFE_MAX_ROWS;
  if (!records || records.length === 0) return [[]];
  if (records.length <= size) return [records];

  const chunks = [];
  for (let i = 0; i < records.length; i += size) {
    chunks.push(records.slice(i, i + size));
  }
  return chunks;
}

/**
 * Split an array of index references into chunks of at most chunkSize.
 * Used when working with index arrays instead of direct record arrays.
 *
 * @param {number[]} indices - Array of index references
 * @param {number} [chunkSize=SAFE_MAX_ROWS] - Max indices per chunk
 * @returns {number[][]} Array of index arrays
 */
function splitIndicesIntoChunks(indices, chunkSize) {
  const size = chunkSize || SAFE_MAX_ROWS;
  if (!indices || indices.length === 0) return [[]];
  if (indices.length <= size) return [indices];

  const chunks = [];
  for (let i = 0; i < indices.length; i += size) {
    chunks.push(indices.slice(i, i + size));
  }
  return chunks;
}

/**
 * Get the number of sheets required for a given record count.
 *
 * @param {number} recordCount - Total number of data records (excludes header)
 * @returns {number} Number of sheets required (minimum 1)
 */
function getRequiredSheetCount(recordCount) {
  if (recordCount <= 0) return 1;
  if (recordCount <= SAFE_MAX_ROWS) return 1;
  return Math.ceil(recordCount / SAFE_MAX_ROWS);
}

/**
 * Build split sheet names for a base sheet name and record count.
 *
 * If recordCount <= SAFE_MAX_ROWS, returns [baseName] (no splitting).
 * If recordCount > SAFE_MAX_ROWS, returns [baseName_1, baseName_2, ...].
 *
 * Sheet names are truncated to 31 characters (Excel limit).
 *
 * @param {string} baseName - Original sheet name (e.g., "Inventory Report")
 * @param {number} recordCount - Total number of data records
 * @returns {string[]} Array of sheet names
 */
function buildSplitSheetNames(baseName, recordCount) {
  const sheetCount = getRequiredSheetCount(recordCount);

  if (sheetCount === 1) {
    return [baseName.substring(0, 31)];
  }

  const names = [];
  for (let i = 1; i <= sheetCount; i++) {
    const suffix = `_${i}`;
    // Ensure total name length <= 31 chars (Excel worksheet name limit)
    const maxBaseLen = 31 - suffix.length;
    const truncatedBase = baseName.substring(0, maxBaseLen);
    names.push(truncatedBase + suffix);
  }
  return names;
}

/**
 * Determine if a record count requires sheet splitting.
 *
 * @param {number} recordCount - Number of data records
 * @returns {boolean} true if splitting is needed
 */
function requiresSplitting(recordCount) {
  return recordCount > SAFE_MAX_ROWS;
}

module.exports = {
  splitIntoChunks,
  splitIndicesIntoChunks,
  getRequiredSheetCount,
  buildSplitSheetNames,
  requiresSplitting,
  SAFE_MAX_ROWS,
  EXCEL_MAX_ROWS,
};
