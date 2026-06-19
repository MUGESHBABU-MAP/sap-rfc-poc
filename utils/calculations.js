/**
 * Sum a specific numeric field across an array of row objects.
 * SAP returns numbers as strings, so we parseFloat.
 */
function sumField(rows, fieldName) {
  return rows.reduce((total, row) => {
    const val = parseFloat(row[fieldName]) || 0;
    return total + val;
  }, 0);
}

module.exports = { sumField };
