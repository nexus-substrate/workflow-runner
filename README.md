# workflow-runner

Workflow template E2E exerciser for [nexus-agents](https://github.com/nexus-substrate/nexus-agents). Chains `list_workflows`, `run_graph_workflow`, and `query_trace`.

## Quick start

```bash
pnpm install
pnpm test        # Run unit tests
pnpm typecheck   # TypeScript strict check
pnpm build       # Compile to dist/
```

## MCP tools covered

| Tool | Purpose |
|------|---------|
| `list_workflows` | List available workflow templates |
| `run_graph_workflow` | Execute graph-based workflows |
| `query_trace` | Query execution traces |

## Live integration mode

```bash
NEXUS_LIVE=true npx tsx src/run-live.ts
```

## License

MIT
