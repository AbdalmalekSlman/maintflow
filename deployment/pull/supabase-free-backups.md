# Supabase Free backup and recovery

Supabase Free does not include automatic daily backups or point-in-time restore. Projects may pause after seven days of inactivity. Maintain a logical backup outside Supabase so recovery can proceed even if the source project is paused or unavailable. Confirm a backup window and target before enabling this procedure.

## Export and retain

1. Designate a company data owner, a backup operator and a recovery operator. The owner authorizes each environment's export scope and retention. The backup operator can read the necessary database objects and encrypt/upload backups. The recovery operator holds separately managed decryption access. Limit and log those permissions. Keep the database password and decryption material outside Git, application hosts and deployment logs.
2. Use a protected backup machine with an encrypted scratch volume, `umask 077`, the supported Supabase CLI and a project-linked work directory. Verify the project reference and TLS connection before export. Supply the database password using the operator's secret manager or CLI prompt. Do not put a password in a command-line URI or enable shell tracing. For an approved project the current CLI's linked-project exports are:

   ```sh
   supabase db dump --remote -f roles.sql --role-only
   supabase db dump --remote -f schema.sql
   supabase db dump --remote -f data.sql --data-only --use-copy -x storage.buckets_vectors -x storage.vector_indexes
   ```

   Review the [Supabase backup and restore procedure](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) for Auth and Storage data, custom managed-schema changes, and installed extensions. Verify the authorized backup covers the Auth data required by profile foreign keys. Record Auth settings, callback URLs, storage configuration and other platform settings separately. Export storage objects separately if used. Keep key material in the company secret manager.
3. Start with nightly exports and an extra export before database changes. Encrypt each backup to the recovery team's public recipient before copying it to access-controlled offsite storage. For example, tar the dump files and pipe directly into `age -r <approved-public-recipient> -o <timestamp>.tar.gz.age`. Store an encrypted-object SHA-256, source project reference, timestamp and export status. Verify the remote object and remove the temporary plaintext files according to company policy. Retain 7 daily, 4 weekly and 3 monthly copies unless policy requires otherwise. Alert the owner on a missed or failed backup. Nightly backups target an RPO of about 24 hours if every run succeeds.

### Automate the nightly export

- Run on an approved Linux backup machine under a dedicated account. Give it a pinned Supabase CLI, a staging-tested noninteractive login from the secret manager, the age public recipient, and a write-only or narrowly scoped offsite upload identity. Keep decrypt access and retention/delete permissions with separate operators. Set least-privilege permissions for the managed backup connection that still allow an Auth-inclusive export.
- Schedule the job with the backup machine's systemd timer at 02:00 UTC using `OnCalendar=*-*-* 02:00:00 UTC`, `Persistent=true`, and `RandomizedDelaySec=10m`. Use a dedicated oneshot service and an `OnFailure=` notification unit wired to the owner's alert service. Also alert if offsite storage has no verified new object after 26 hours. Use the same job for approved pre-migration exports.
- In the job, use a lock to prevent overlapping exports and a new mode-0700 directory on the encrypted volume. Fail if the linked project differs from the configured project or if any export, encryption, or upload step fails. Use `set -euo pipefail` in the Bash job and a trap to remove that job's scratch files. Publish the checksum and completion record only after verifying the uploaded encrypted object. Configure retention in storage so ordinary upload credentials cannot remove earlier backups. Log timestamps, source reference and result only.
- Dry-run the timer and failure alerts with a disposable staging export before enabling the production job. Then complete a restore drill using the same encrypted format and credentials separation. The backup host, offsite destination, and notification route must be selected before enabling the timer.

## Restore and rehearse

1. At least monthly, restore a reviewed backup into a disposable, access-restricted Supabase-compatible environment, using the official order for roles, schema and data. Check the destination reference before each write. Disable outgoing integrations in the restore environment and use approved remapped or disposable data when possible. Never restore over staging or production during a drill.
2. Verify the encrypted-object checksum, decrypt using the authorized recovery identity, restore the compatible Postgres/Supabase versions and confirm the expected table counts, constraints, RLS and Auth-profile links without printing real records. Restore storage objects if applicable. Record elapsed time and failures to establish an actual RTO. Delete the restore once the owner signs off.
3. During an incident the data owner approves the recovery point and destination. The recovery operator verifies and restores, and the application owner validates readiness and authorizes the connection change. The hosting provider restores infrastructure only as scoped by that plan.

This file describes the procedure. No production records were exported or restored during preparation.
