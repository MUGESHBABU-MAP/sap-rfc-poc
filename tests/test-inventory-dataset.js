/**
 * Phase 1 - Test Inventory Dataset Service against live SAP
 *
 * Run: node tests/test-inventory-dataset.js
 *
 * Tests:
 *   1. Connects to SAP
 *   2. Calls getInventoryDataset() with no filters (limited by SAP rowcount)
 *   3. Validates record structure
 *   4. Prints sample records and stats
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const SAPService = require("../services/sap.service");
const InventoryDatasetService = require("../services/inventory-dataset.service");

async function testInventoryDataset() {
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

    const service = new InventoryDatasetService(sap);

    console.log("=== Test 1: getInventoryDataset() - No Filters ===");
    const records = await service.getInventoryDataset();

    console.log(`Records returned: ${records.length}`);

    if (records.length > 0) {
      // Validate record structure
      const expectedFields = [
        "material",
        "materialType",
        "materialDescription",
        "materialGroup",
        "plant",
        "storageLocation",
        "baseUnit",
        "unrestrictedQty",
        "unrestrictedValue",
        "transitQty",
        "transitValue",
        "qualityQty",
        "qualityValue",
        "restrictedQty",
        "restrictedValue",
        "blockedQty",
        "blockedValue",
        "returnsQty",
        "returnsValue",
        "standardCost",
        "movingAveragePrice",
        "totalQuantity",
        "totalInventoryValue",
        "valueDerived",
      ];

      const sample = records[0];
      console.log("\n--- Field Validation ---");
      let allPresent = true;
      for (const field of expectedFields) {
        const present = field in sample;
        if (!present) allPresent = false;
        console.log(`  ${field}: ${present ? "✓" : "✗ MISSING"}`);
      }
      console.log(`\nAll fields present: ${allPresent ? "YES" : "NO"}`);

      // Sample records
      console.log("\n--- Sample Records (first 3) ---");
      console.log(JSON.stringify(records.slice(0, 3), null, 2));

      // Stats
      const withCost = records.filter(
        (r) => r.standardCost > 0 || r.movingAveragePrice > 0,
      );
      const withValue = records.filter((r) => r.totalInventoryValue > 0);
      const plants = [...new Set(records.map((r) => r.plant))];
      const locations = [...new Set(records.map((r) => r.storageLocation))];

      console.log("\n--- Statistics ---");
      console.log(`  Total records: ${records.length}`);
      console.log(`  Records with cost data: ${withCost.length}`);
      console.log(`  Records with inventory value > 0: ${withValue.length}`);
      console.log(`  Unique plants: ${plants.join(", ")}`);
      console.log(`  Unique storage locations: ${locations.join(", ")}`);
    }

    // Test with filter
    if (records.length > 0) {
      const testPlant = records[0].plant;
      console.log(
        `\n\n=== Test 2: getInventoryDataset({ plant: '${testPlant}' }) ===`,
      );
      const filtered = await service.getInventoryDataset({ plant: testPlant });
      console.log(`Records returned: ${filtered.length}`);
    }

    await sap.disconnect();
    console.log(
      "\nDisconnected. Phase 1 inventory dataset validation complete.",
    );
  } catch (err) {
    console.error("ERROR:", err.message || err);
  }
}

testInventoryDataset();
