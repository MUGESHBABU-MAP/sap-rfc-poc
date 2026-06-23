/**
 * Safe Cell Value Helper
 *
 * Ensures all values written to Excel cells are valid.
 * Prevents workbook corruption from undefined, NaN, Infinity, or objects.
 *
 * Rules:
 *   undefined → ""
 *   null → ""
 *   NaN → 0
 *   Infinity → 0
 *   -Infinity → 0
 *   Date → ISO string
 *   Object → JSON.stringify
 *   Other → value as-is
 */

/**
 * Sanitize a value for safe Excel cell writing.
 * @param {*} value
 * @returns {string|number}
 */
function safeCell(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "number") {
    if (isNaN(value) || !isFinite(value)) return 0;
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

/**
 * Sanitize a numeric value for Excel. Returns 0 for invalid numbers.
 * @param {*} value
 * @returns {number}
 */
function safeNum(value) {
  if (value === undefined || value === null) return 0;
  const num = typeof value === "number" ? value : parseFloat(value);
  if (isNaN(num) || !isFinite(num)) return 0;
  return num;
}

/**
 * Sanitize a string value for Excel. Returns "" for invalid.
 * @param {*} value
 * @returns {string}
 */
function safeStr(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

module.exports = { safeCell, safeNum, safeStr };
