/**
 * Phase 3.11 - Validate Returns Stock (MSLB + MSKU integration)
 *
 * Run: node tests/test-returns-stock.js
 *
 * Validates that returnsQty and returnsValue are populated
 * from MSLB (vendor) and MSKU (customer) special stock tables.
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const SAPService = require("../services/sap.service");
const InventoryDatasetService = require("../services/inventory-dataset.service");

const TEST_PLANT = process.env.TEST_PLANT || "1000";

async function testReturnsStock() {
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
    console.log("Connected to SAP\n");
    console.log("=== Returns Stock Validation ===\n");

    const service = new InventoryDatasetService(sap);
    const records = await service.getInventoryDataset({ plant: TEST_PLANT });

    console.log(`\nTotal records: ${records.length}`);

    // Find records with returns stock
    let returnsCount = 0;
    let totalReturnsQty = 0;
    let totalReturnsValue = 0;

    for (let i = 0; i < records.length; i++) {
      if (records[i].returnsQty > 0) {
        returnsCount++;
        totalReturnsQty += records[i].returnsQty;
        totalReturnsValue += records[i].returnsValue;
      }
    }

    console.log(`\n--- Returns Stock Summary ---`);
    console.log(`  Records with returns stock: ${returnsCount}`);
    console.log(`  Total returns qty: ${totalReturnsQty}`);
    console.log(`  Total returns value: ${round2(totalReturnsValue)}`);

    // Sample records
    if (returnsCount > 0) {
      console.log(`\n--- Sample Records (first 10 with returns stock) ---`);
      console.log(
        "Material".padEnd(18) +
          "Plant".padEnd(6) +
          "Location".padEnd(10) +
          "Returns Qty".padEnd(14) +
          "Returns Value",
      );
      console.log("-".repeat(62));

      let printed = 0;
      for (let i = 0; i < records.length && printed < 10; i++) {
        if (records[i].returnsQty > 0) {
          const r = records[i];
          console.log(
            r.material.padEnd(18) +
              r.plant.padEnd(6) +
              r.storageLocation.padEnd(10) +
              String(r.returnsQty).padEnd(14) +
              String(r.returnsValue),
          );
          printed++;
        }
      }
    } else {
      console.log("\n  No returns stock found in MSLB/MSKU for this plant.");
      console.log(
        "  This is expected if customer doesn't use consignment/subcontracting.",
      );
    }

    console.log(
      `\n--- Status: ${returnsCount > 0 ? "POPULATED" : "ZERO (MSLB/MSKU may be empty)"} ---`,
    );

    await sap.disconnect();
    console.log("\nDone.");
  } catch (err) {
    console.error("ERROR:", err.message || err);
  }
}

function round2(val) {
  return Math.round(val * 100) / 100;
}

testReturnsStock();
