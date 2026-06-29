# MCP Server - Inventory & GL Reconciliation (Phase 4.1)

## Architecture

```
MCP Client (Kiro / Next.js / Claude)
    ↓ HTTP POST /mcp (JSON-RPC 2.0)
Express Server (mcp/server.js)
    ↓
Auth Provider (mcp/auth/) — stub, future JWT
    ↓
HTTP Transport (mcp/transport/)
    ↓
Tool Registration (mcp/registration/)
    ↓
Tool Registry (mcp/registry.js)
    ↓
Tool Handlers (mcp/tools/*)
    ↓
Context (mcp/context.js) — Dependency Injection
    ↓
Existing Services (services/*)
    ↓
SAP RFC → SAP System
```

## Start

```bash
node mcp/server.js
```

Server listens on `http://localhost:3001/mcp` (configurable via `MCP_PORT` env var).

## Endpoints

| Method | Path      | Description           |
| ------ | --------- | --------------------- |
| POST   | `/mcp`    | MCP JSON-RPC endpoint |
| GET    | `/mcp`    | Server info           |
| GET    | `/health` | Health check          |

## Configuration (.env)

```
MCP_PORT=3001
MCP_HOST=0.0.0.0
MCP_AUTH_ENABLED=false
```

## Tools (11 registered)

| Tool                     | Description                           |
| ------------------------ | ------------------------------------- |
| `inventory.dataset`      | Extract inventory records from SAP    |
| `inventory.summary`      | Inventory summary by storage location |
| `inventory.specialStock` | Special stock distribution            |
| `gl.dataset`             | GL balance records from FAGLFLEXT     |
| `gl.summary`             | GL summary by company code            |
| `reconciliation.run`     | Full reconciliation + workbook        |
| `reconciliation.history` | Run history / audit trail             |
| `configuration.validate` | Validate run parameters               |
| `system.health`          | System health check                   |
| `system.connection`      | SAP connection validation             |
| `system.metadata`        | Server configuration                  |

## Protocol

JSON-RPC 2.0 over HTTP. Example requests:

### Initialize

```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

### List Tools

```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

### Call Tool

```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"system.health","arguments":{}}}'
```

### Run Reconciliation

```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"reconciliation.run","arguments":{"companyCode":"1000","plant":"1000","fiscalYear":"2026"}}}'
```

## Testing

```bash
node mcp/test-mcp.js
# or
node mcp/tests/test-mcp-protocol.js
```

## Folder Structure

```
mcp/
├── server.js                    # Express HTTP server
├── context.js                   # Dependency injection container
├── registry.js                  # Tool registry
├── transport/
│   └── httpTransport.js         # HTTP POST transport
├── auth/
│   └── authProvider.js          # Auth stub (future JWT)
├── registration/
│   └── registerTools.js         # Tool registration helper
├── tools/
│   ├── inventory/
│   │   ├── inventory-dataset.tool.js
│   │   ├── inventory-summary.tool.js
│   │   └── special-stock.tool.js
│   ├── gl/
│   │   ├── gl-dataset.tool.js
│   │   └── gl-summary.tool.js
│   ├── reconciliation/
│   │   ├── run-reconciliation.tool.js
│   │   ├── run-history.tool.js
│   │   └── configuration.tool.js
│   └── system/
│       ├── health.tool.js
│       ├── connection.tool.js
│       └── metadata.tool.js
├── tests/
│   └── test-mcp-protocol.js
├── test-mcp.js                  # Alias
└── README.md
```

## Design Decisions

- **No official SDK**: `@modelcontextprotocol/sdk` requires Node 18+ and ESM. This project uses Node 14 + CommonJS (required by `node-rfc`). The protocol is implemented manually but is wire-compatible with any MCP client.
- **HTTP transport**: Production-ready. No STDIO. Compatible with Next.js backend and Kubernetes.
- **Auth stub**: Ready for JWT when needed. Middleware-based, non-invasive.
- **Thin wrappers**: Tools only validate → call service → return JSON. Zero business logic.
- **Existing services unchanged**: All business logic lives in `services/`. MCP is purely an interface layer.
