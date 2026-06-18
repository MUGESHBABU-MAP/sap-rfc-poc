function parseRows(result) {
  const fields = result.FIELDS.map((f) => f.FIELDNAME);

  return result.DATA.map((row) => {
    const values = row.WA.split("|");

    const obj = {};

    fields.forEach((field, index) => {
      obj[field] = values[index]
        ? values[index].trim()
        : "";
    });

    return obj;
  });
}

module.exports = parseRows;