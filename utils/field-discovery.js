/**
 * Field Discovery Utility
 *
 * Shared helper for SAP field discovery tests.
 * Analyzes rows and produces field statistics:
 *   - Sample values
 *   - Non-blank count
 *   - Distinct values
 */

/**
 * Analyze fields from parsed SAP rows.
 * @param {object[]} rows - parsed rows from RFC_READ_TABLE
 * @param {string[]} fields - field names to analyze
 * @returns {FieldAnalysis[]}
 */
function analyzeFields(rows, fields) {
  const results = [];

  for (let f = 0; f < fields.length; f++) {
    const fieldName = fields[f];
    const distinctSet = new Set();
    let nonBlankCount = 0;
    const samples = [];

    for (let i = 0; i < rows.length; i++) {
      const val = rows[i][fieldName] || "";
      if (val !== "") {
        nonBlankCount++;
        distinctSet.add(val);
        if (samples.length < 5) {
          samples.push(val);
        }
      }
    }

    results.push({
      field: fieldName,
      totalRows: rows.length,
      nonBlankCount,
      blankCount: rows.length - nonBlankCount,
      distinctCount: distinctSet.size,
      samples,
      distinctValues:
        distinctSet.size <= 20
          ? [...distinctSet]
          : [...distinctSet].slice(0, 20),
    });
  }

  return results;
}

/**
 * Print field analysis to console.
 * @param {string} tableName
 * @param {FieldAnalysis[]} analysis
 */
function printAnalysis(tableName, analysis) {
  console.log(
    `\n--- ${tableName} Field Analysis (${analysis[0] ? analysis[0].totalRows : 0} rows) ---\n`,
  );

  console.log(
    "Field".padEnd(12) +
      "Non-Blank".padEnd(12) +
      "Distinct".padEnd(10) +
      "Samples",
  );
  console.log("-".repeat(80));

  for (let i = 0; i < analysis.length; i++) {
    const a = analysis[i];
    console.log(
      a.field.padEnd(12) +
        String(a.nonBlankCount).padEnd(12) +
        String(a.distinctCount).padEnd(10) +
        a.samples.slice(0, 3).join(", "),
    );
  }
}

module.exports = { analyzeFields, printAnalysis };
