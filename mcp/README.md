# MCP Server - Inventory & GL Reconciliation

## Architecture

```
MCP Client (Kiro / Next.js / Claude)
    ↓ JSON-RPC (stdio)
MCP Server (mcp/server.js)
    ↓
Tool Registry (mcp/registry.js)
    ↓
Tool Handlers (mcp/tools/*)
    ↓
Existing Services (services/*)
    ↓
SAP RFC
    ↓
SAP System
```

The MCP layer is a **thin wrapper** over existing services.
No business logic is duplicated.

## Start

```bash
node mcp/server.js
```

The server uses stdio transport (reads JSON-RPC from stdin, writes to stdout).

## Tools

| Tool                     | Description                               |
| ------------------------ | ----------------------------------------- |
| `inventory.dataset`      | Extract inventory records from SAP        |
| `inventory.summary`      | Get inventory summary by storage location |
| `inventory.specialStock` | Get special stock distribution            |
| `gl.dataset`             | Extract GL balance records                |
| `gl.summary`             | Get GL summary by company code            |
| `reconciliation.run`     | Full reconciliation + workbook generation |
| `reconciliation.history` | Query run history / audit trail           |
| `configuration.validate` | Validate run parameters                   |
| `system.health`          | System health check                       |
| `system.connection`      | SAP connection validation                 |
| `system.metadata`        | Server metadata and configuration         |

## JSON-RPC Protocol

### Initialize

```json
{ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {} }
```

### List Tools

```json
{ "jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {} }
```

### Call Tool

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "reconciliation.run",
    "arguments": {
      "companyCode": "1000",
      "plant": "1000",
      "fiscalYear": "2026"
    }
  }
}
```

## Testing

```bash
node mcp/test-mcp.js
```

## Design Principles

- Every tool is a thin wrapper — validate input, call service, return JSON
- Dependency injection via Context object
- No tool instantiates services directly
- No duplicated business logic
- REST APIs remain fully supported alongside MCP
