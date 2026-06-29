/**
 * MCP Tool Registry (Phase 4)
 *
 * Central registry for all MCP tools.
 * Tools auto-register during server startup.
 */

// Inventory tools
const inventoryDataset = require("./tools/inventory/inventory-dataset.tool");
const inventorySummary = require("./tools/inventory/inventory-summary.tool");
const specialStock = require("./tools/inventory/special-stock.tool");

// GL tools
const glDataset = require("./tools/gl/gl-dataset.tool");
const glSummaryTool = require("./tools/gl/gl-summary.tool");

// Reconciliation tools
const runReconciliation = require("./tools/reconciliation/run-reconciliation.tool");
const runHistory = require("./tools/reconciliation/run-history.tool");
const configuration = require("./tools/reconciliation/configuration.tool");

// System tools
const health = require("./tools/system/health.tool");
const connection = require("./tools/system/connection.tool");
const metadata = require("./tools/system/metadata.tool");

/**
 * Get all registered tools as an array.
 * @returns {MCPTool[]}
 */
function getAllTools() {
  return [
    inventoryDataset,
    inventorySummary,
    specialStock,
    glDataset,
    glSummaryTool,
    runReconciliation,
    runHistory,
    configuration,
    health,
    connection,
    metadata,
  ];
}

/**
 * Get a tool by name.
 * @param {string} name
 * @returns {MCPTool|null}
 */
function getTool(name) {
  return getAllTools().find((t) => t.name === name) || null;
}

/**
 * Get tool definitions for tools/list response.
 * @returns {object[]}
 */
function getToolDefinitions() {
  return getAllTools().map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}

module.exports = { getAllTools, getTool, getToolDefinitions };
