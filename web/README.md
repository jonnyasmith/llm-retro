# LLM Retro web

The SvelteKit control plane runs either natively for development or as the
long-running `web` service in Compose.

For the native development loop, start the database from the repository root
and then run the web service with the host `DATABASE_URL` from `.env`:

```sh
docker compose up -d db
cd web
set -a && source ../.env && set +a
pnpm dev
```

Vite serves the app with HMR. OrbStack exposes the host Docker socket at
`/var/run/docker.sock`; the Compose service mounts the same socket read-write.

`GET /api/health` performs `SELECT 1` and returns whether Postgres is connected.
