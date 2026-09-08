# Legacy demo data cleanup

Run from the repository root. The script loads `apps/server/.env`, always targets `rdm-business`, and prints aggregate counts only.

```sh
pnpm --filter server exec tsx scripts/cleanup-demo-data.ts
```

The default is read-only. Only raw profiles without `dataVersion` are audited. A profile is eligible only when its original balances, XP, badges, and five example transactions are untouched and it has no real activity. Its only habit, if present, must match the entire original sample. Mixed or changed accounts are marked for review and preserved.

After reviewing the dry run and authorizing cleanup, pause app writes and use:

```sh
pnpm --filter server exec tsx scripts/cleanup-demo-data.ts --apply --backup-dir=/absolute/private/backup-directory
```

Apply requires MongoDB transaction support. It writes and flushes a private, uniquely named `.ejson` backup of every affected profile and habit before changing anything. Each account is rechecked inside a transaction; changed records are skipped. Only eligible synthetic balances, badges, and transactions are reset; exact sample habits are removed. Authentication accounts and all mixed/real activity remain.

## Remove only unchanged sample habits

To preserve every profile balance and transaction while removing only the exact, unmodified starter habit (including in a mixed account), inspect this narrower mode first:

```sh
pnpm --filter server exec tsx scripts/cleanup-demo-data.ts --dry-run --records-only
```

After reviewing the count, apply with a private backup directory:

```sh
pnpm --filter server exec tsx scripts/cleanup-demo-data.ts --apply --records-only --backup-dir=/absolute/private/backup-directory
```

This mode does not reset profiles or mark mixed accounts as migrated. Changed habits and other user-created records are preserved. The repository-local `.local-backups/` directory is ignored by Git if used for these sensitive backups.

## Recovery

Backups preserve MongoDB IDs and dates using Extended JSON. Keep them private and outside Git. To recover, use a reviewed MongoDB restore script with `EJSON.parse`, replacing affected `rdmprofiles` and reinserting missing `habits` by their original IDs. Do not overwrite an account that has acquired new activity since cleanup without reconciling that activity first.
