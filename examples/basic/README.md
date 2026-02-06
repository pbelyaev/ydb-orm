# basic example

Runs against a local YDB.

## Requirements

- docker

## Run

From repo root:

```bash
docker compose -f examples/ydb-local/docker-compose.yml up -d

cd examples/basic
npm ci
npm run dev
```

Environment variables (optional):

- `YDB_ENDPOINT` (default `grpc://localhost:2136`)
- `YDB_DATABASE` (default `/local`)
