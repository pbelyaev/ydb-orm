# express-crud example

A tiny Express app demonstrating `@pbelyaev/ydb-orm` with **YDB local**.

## Run

```bash
# from repo root
sudo docker compose -f examples/ydb-local/docker-compose.yml up -d

cd examples/express-crud
npm install
npm run dev
```

Server: http://localhost:3000

## Resources

- `users`
- `posts`

### Examples

```bash
curl -X POST http://localhost:3000/users \
  -H 'content-type: application/json' \
  -d '{"id": "1", "email": "a@b.com", "name": "Pavel"}'

curl http://localhost:3000/users

curl -X POST http://localhost:3000/posts \
  -H 'content-type: application/json' \
  -d '{"id": "p1", "userId": "1", "title": "Hello", "body": "World"}'

curl http://localhost:3000/posts
```

Env (optional):
- `YDB_ENDPOINT` (default `grpc://localhost:2136`)
- `YDB_DATABASE` (default `/local`)
