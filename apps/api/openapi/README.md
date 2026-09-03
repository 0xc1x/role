# OpenAPI export

Generate a static OpenAPI document from the Nest app:

```bash
bun run openapi:export
```

This boots `AppModule` (without listening), builds the Swagger document, and writes:

```
openapi/openapi.json
```

Requires the same env vars as a normal boot (see `.env.example`). In CI, provide dummy but valid values if the database is not needed for document generation, or point `DATABASE_URL` at a reachable host.
