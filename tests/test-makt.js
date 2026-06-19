/**
 * Phase 1.1 - Validate MAKT (Material Descriptions)
 *
 * Fields: MATNR, SPRAS, MAKTX, MAKTG
 * Purpose: Confirm material descriptions are accessible.
 *          SPRAS = 'E' for English descriptions.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const SAPService = require("../services/sap.service");
const parseRows = require("../utils/parse-rows");

async function testMakt() {
  const sap = new SAPService({
    user: process.env.SAP_USER,
    passwd: process.env.SAP_PASSWORD,
    ashost: process.env.SAP_ASHOST,
    sysnr: process.env.SAP_SYSNR,
    client: process.env.SAP_CLIENT,
    lang: process.env.SAP_LANG,
  });

  try {
    await sap.connect();
    console.log("Connected to SAP - reading MAKT (Material Descriptions)...\n");

    const fields = ["MATNR", "SPRAS", "MAKTX"];

    console.log(`Requesting fields: ${fields.join(", ")}`);
    console.log("Filter: SPRAS = 'E' (English)");
    console.log("---");

    const result = await sap.readTable("MAKT", fields, {
      rowCount: 20,
      where: ["SPRAS = 'E'"],
    });
    const rows = parseRows(result);

    console.log(`\nRows returned: ${rows.length}`);
    console.log("\nSample records:");
    console.log(JSON.stringify(rows.slice(0, 10), null, 2));

    // Validate field availability
    console.log("\n--- Field Availability ---");
    if (rows.length > 0) {
      const sample = rows[0];
      for (const field of fields) {
        const hasValue = sample[field] !== undefined && sample[field] !== "";
        console.log(
          `  ${field}: ${hasValue ? "✓ available" : "✗ empty/missing"} (value: "${sample[field] || ""}")`,
        );
      }
    } else {
      console.log("  No rows returned - table may be empty or inaccessible.");
    }

    await sap.disconnect();
    console.log("\nDisconnected.");
  } catch (err) {
    console.error("ERROR:", err.message || err);
  }
}

testMakt();
