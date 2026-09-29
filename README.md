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
| Admin | manager@demo.clinic |
| Reception | reception@demo.clinic |
| Doctor | doctor@demo.clinic |
| Lab | lab@demo.clinic |
| Pharmacy | pharmacy@demo.clinic |
| Cashier | cashier@demo.clinic |

Seed data never runs automatically in production.

### Go-live

Production starts with **one Super Admin**. That account (or a clinic Admin) creates more **Admins** from Rights & roles, plus station staff. Admin can run prices, catalogs, staff (except Super Admin), reports, and SMS. Staff emails should use the clinic domain.

Walk-in laboratory tests and over-the-counter pharmacy sales do **not** add a consultation fee. A child under 18 needs a parent or guardian name and phone.

**Patients:** search the registry by name, phone, or number before registering. Matching files are blocked unless you confirm they are a different person.

**Prices:** Clinic → Price list. Search a hospital charge, lab test, or medicine and change the KES amount. New visits use the new price. “Apply printed lists” reloads the official sheets (lab, hospital charges, pharmacy selling prices). A visit still bills **Normal consultation (CONSULT)** at the current CONSULT price, not Special consultation.

**Services:** Administration → Services to add extra hospital charges. Implant removal had no printed amount and starts at KES 500 — change it on the Price list.

**Laboratory:** Tests & prices tab to add or edit tests. Applying the clinic lab list updates names and prices.

**Pharmacy:** add stock items, import CSV, issue an LPO, receive a GRN against that LPO (stock increases on receive), then stock-take to correct the shelf. New catalog items still start at **0 on hand**.

The cashier queue shows every unpaid visit, including walk-ins and OTC. Payments are idempotent, so a retried or offline-synced collection cannot double-charge.

Offline: if the network drops, the browser saves mutating work locally and syncs it when the clinic is back online. UI filters and selected visits are remembered on the same computer.

### Bought domain

Set the live clinic URL in `.env.production` before `docker compose -f docker-compose.prod.yml up`:

```
FRONTEND_URL=https://your-clinic-domain.com,https://www.your-clinic-domain.com
APP_URL=https://your-clinic-domain.com
JWT_SECRET=a-long-random-secret
SEED_ON_START=false
```

The web container serves the app on port 80 and proxies `/api` to the API. Put TLS (Caddy, nginx, or the registrar’s HTTPS) in front of that port. Seed never runs in production. Create the first Super Admin yourself, then use Rights & roles to add Admins.

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
