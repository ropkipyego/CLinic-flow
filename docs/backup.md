# ClinicFlow backups

Docker volumes are not a backup strategy. Take database dumps on a schedule and store them off the host.

## PostgreSQL dump

```bash
# From a machine that can reach the database container
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U clinicflow -d clinicflow --format=custom --file=/tmp/clinicflow.dump

docker compose -f docker-compose.prod.yml cp postgres:/tmp/clinicflow.dump \
  ./backups/clinicflow-$(date +%Y%m%d-%H%M%S).dump
```

Plain SQL alternative:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U clinicflow -d clinicflow > ./backups/clinicflow-$(date +%Y%m%d).sql
```

## Restore

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U clinicflow -d clinicflow --clean --if-exists /tmp/clinicflow.dump
```

## Object storage

When clinic logos or documents are stored via the object-storage adapter, back up that bucket or `STORAGE_LOCAL_DIR` in the same window as the database dump.

## Retention

Keep at least 7 daily and 4 weekly copies off-site. Test a restore on staging before relying on backups.
