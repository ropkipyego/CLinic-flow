# ClinicFlow deployment

## Environments

| File | Use |
| --- | --- |
| `.env.example` | Committed template |
| `.env.development` | Local development (not committed) |
| `.env.staging` | Staging (not committed) |
| `.env.production` | Production (not committed) |

Copy `.env.example` to the environment file you need. Development defaults keep `EMAIL_ENABLED=false` and `SMS_ENABLED=false`. Production must set a unique `JWT_SECRET` and must never set `SEED_ON_START=true`.

## Local development without Docker for the API

1. Start PostgreSQL: `docker compose up -d postgres` (host port 5434)
2. `cd backend && cp ../.env.example .env && npm install`
3. `npx prisma migrate dev --name init`
4. `npm run db:seed`
5. `npm run dev`
6. In another terminal: `cd frontend && npm install && npm run dev`

Demo login: `admin@demo.clinic` / `Password123!` (also reception, doctor, lab, pharmacy, cashier).

## Migrations

Never change production schema by hand.

```bash
cd backend
npx prisma migrate dev --name describe_the_change
# production / staging
npx prisma migrate deploy
```

## Production compose

```bash
export POSTGRES_PASSWORD='a-strong-password'
docker compose -f docker-compose.prod.yml up -d --build
```

Only the web port is published. PostgreSQL stays on the Docker network.

## Health checks

- API: `GET /health`
- Frontend container proxies `/health` to the API

## Seed data

`npm run db:seed` refuses to run when `NODE_ENV=production`.
