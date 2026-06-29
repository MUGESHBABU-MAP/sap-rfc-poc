/**
 * MCP Tool Registration (Phase 4.1)
 *
 * Registers all tools from the registry into the MCP request handler.
 * Each tool's handler is bound to the shared context.
 */
const { getAllTools } = require("../registry");

/**
 * Build the tool definitions list (for tools/list response).
 * @returns {object[]}
 */
function buildToolDefinitions() {
  return getAllTools().map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

/**
 * Execute a tool by name with arguments and context.
 * @param {string} toolName
 * @param {object} args
 * @param {MCPContext} context
 * @returns {Promise<object>}
 */
async function executeTool(toolName, args, context) {
  const { getTool } = require("../registry");
  const tool = getTool(toolName);

  if (!tool) {
    throw new ToolNotFoundError(toolName);
  }

  return await tool.handler(args, context);
}

class ToolNotFoundError extends Error {
  constructor(toolName) {
    super(`Unknown tool: ${toolName}`);
    this.code = "TOOL_NOT_FOUND";
    this.toolName = toolName;
  }
}

module.exports = { buildToolDefinitions, executeTool, ToolNotFoundError };
