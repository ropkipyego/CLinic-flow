# ClinicFlow

Simple clinic management. Built to grow.

ClinicFlow is a lightweight outpatient clinic system for:

Reception → Doctor consultation → Small laboratory → In-house pharmacy → Cashier

It is tenant-ready, role-secured, and built around:

**Patient → Encounter → Clinical services → Charges → Payment**

## Stack

- PostgreSQL + Prisma migrations
- Node.js / Express API at `/api/v1`
- React + Vite frontend
- SMS/email service adapters (disabled in development)
- Docker Compose for development and production

## Quick start

```bash
docker compose up -d postgres
# Postgres is published on host port 5434 to avoid clashing with other local databases.

cd backend
cp ../.env.example .env
# set DATABASE_URL=postgresql://clinicflow:clinicflow@localhost:5434/clinicflow
npm install
npx prisma migrate dev --name init
npm run db:seed
npm run dev

# another terminal
cd frontend
npm install
npm run dev
```

Open http://localhost:5174 (API: http://localhost:4000)

### Demo users

Password for all seed users: `Password123!`

| Role | Email |
| --- | --- |
| Super Admin | admin@demo.clinic |
| Reception | reception@demo.clinic |
| Doctor | doctor@demo.clinic |
| Lab | lab@demo.clinic |
| Pharmacy | pharmacy@demo.clinic |
| Cashier | cashier@demo.clinic |

Seed data never runs automatically in production.

### Go-live

Production starts with **one Super Admin** (`ADMIN`). That account creates every other staff user (reception, doctor, lab, pharmacy, cashier) from Administration. Staff emails should use the clinic domain so they stay consistent.

Walk-in laboratory tests and over-the-counter pharmacy sales do **not** add a consultation fee. A child under 18 needs a parent or guardian name and phone.

The cashier queue shows every unpaid visit, including walk-ins and OTC. Payments are idempotent, so a retried or offline-synced collection cannot double-charge.

Offline: if the network drops, the browser saves mutating work locally and syncs it when the clinic is back online. UI filters and selected visits are remembered on the same computer.

## Tests

```bash
cd backend
DATABASE_URL=postgresql://clinicflow:clinicflow@localhost:5432/clinicflow npm test
```

Critical workflow coverage: registration, encounter, consultation, lab order/result, prescription, dispense + stock deduction, charges, payment, receipt, walk-in lab (no consult fee), OTC pharmacy (minors need a guardian), payment idempotency, tenant isolation, and role authorization.

## Environments

Commit only `.env.example`. Copy it to `.env.development`, `.env.staging`, or `.env.production`.

Development defaults:

- `EMAIL_ENABLED=false`
- `SMS_ENABLED=false`

Live SMS/email will not send from development unless `ALLOW_DEV_MESSAGING=true` is also set.

## Deployment and backups

See [docs/deployment.md](docs/deployment.md) and [docs/backup.md](docs/backup.md).

Production Compose does not publish PostgreSQL. Only the application/web port is exposed.
