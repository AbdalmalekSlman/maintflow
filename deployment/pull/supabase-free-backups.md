# Supabase Free backup and recovery

Supabase Free does not include automatic daily backups or point-in-time restore. Projects may pause after seven days of inactivity. Maintain a logical backup outside Supabase so recovery can proceed even if the source project is paused or unavailable. Confirm a backup window and target before enabling this procedure.

## Production Session Pooler preflight

1. In [maintflow-production](https://supabase.com/dashboard/project/tkofnsyqywhixuotbiet), choose **Connect → Session pooler**. Use the displayed pooler hostname, port `5432`, database `postgres`, and username `postgres.tkofnsyqywhixuotbiet` for the initial owner-authorized backup. Obtain the trusted SSL root certificate from the Dashboard and verify the hostname. Run this on the protected backup machine:

   ```sh
   PGSSLMODE=verify-full PGSSLROOTCERT=/private/path/supabase-ca.crt \
     psql -X -W -h POOLER_HOST_FROM_DASHBOARD -p 5432 \
     -U postgres.tkofnsyqywhixuotbiet -d postgres -v ON_ERROR_STOP=1 \
     -c "select current_database(), current_user, current_setting('server_version_num');"
   ```

   Enter the existing database password only at the local masked prompt. Do not construct a password-bearing URI in a command line. For unattended operation, use the protected backup service's secret injection and verify that the exact CLI version resolves the intended production endpoint with TLS before enabling its timer. [Supabase connection instructions](https://supabase.com/docs/guides/database/connecting-to-postgres)
2. Create a private scratch folder on a volume with verified encryption and restrict it to the backup operator. The recovery owner should generate an `age` identity on trusted storage with `age-keygen -o /private/path/maintflow-production.agekey`. Put only the public recipient in the backup configuration and keep the private identity in the recovery owner's vault with a separate recovery copy. Choose a private, approved rclone remote prefix dedicated to production.
3. As of November 22, 2026, production had zero Auth users, identities, sessions, application profiles, and Storage buckets or objects. Its migration journal held three entries. Check these counts again from the source at export time. Record managed Auth settings, trusted origins and redirect URLs, signing key configuration, SMTP and hooks separately, using secret-manager references for credentials. If Storage becomes populated, back up the object bytes as well as the database metadata.

## Export and retain

1. Designate a company data owner, a backup operator and a recovery operator. The owner authorizes each environment's export scope and retention. The backup operator can read the necessary database objects and encrypt/upload backups. The recovery operator holds separately managed decryption access. Limit and log those permissions. Keep the database password and decryption material outside Git, application hosts and deployment logs.
2. Use a protected backup machine with an encrypted scratch volume, `umask 077`, the supported Supabase CLI and a project-linked work directory. Verify the project reference and TLS connection before export. Supply the database password using the operator's secret manager or CLI prompt. Do not put a password in a command-line URI or enable shell tracing. For an approved project the current CLI's linked-project exports are:

   ```sh
   supabase db dump --remote -f roles.sql --role-only
   supabase db dump --remote -f schema.sql
   supabase db dump --remote -f data.sql --data-only --use-copy -x storage.buckets_vectors -x storage.vector_indexes
   ```

   Review the [Supabase backup and restore procedure](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) for Auth and Storage data, custom managed-schema changes, and installed extensions. Verify the authorized backup covers the Auth data required by profile foreign keys. Record Auth settings, callback URLs, storage configuration and other platform settings separately. Export storage objects separately if used. Keep key material in the company secret manager.
   Record whether `supabase_migrations.schema_migrations` exists on the source. When it does, the script separately exports its schema and data. Keep the reviewed Git migrations and source revision with the backup inventory even when there is no hosted journal.
3. Start with nightly exports and an extra export before database changes. Encrypt each backup to the recovery team's public recipient before copying it to access-controlled offsite storage. For example, tar the dump files and pipe directly into `age -r <approved-public-recipient> -o <timestamp>.tar.gz.age`. Store an encrypted-object SHA-256, source project reference, timestamp and export status. Verify the remote object and remove the temporary plaintext files according to company policy. Retain 7 daily, 4 weekly and 3 monthly copies unless policy requires otherwise. Alert the owner on a missed or failed backup. Nightly backups target an RPO of about 24 hours if every run succeeds.

### Automate the nightly export

- Run [backup-supabase.sh](backup-supabase.sh) on an approved Linux backup machine under a dedicated account. Install a pinned Supabase CLI v3 with its supported container runtime, Bash, age, rclone and the standard Linux utilities used by the script. Provide the age public recipients file and an offsite upload identity that can read back uploaded objects for verification. Keep decrypt access and retention/delete permissions with separate operators. Set least-privilege permissions for the managed backup connection that still allow an Auth-inclusive export.
- In the backup service's protected configuration, set `MAINTFLOW_BACKUP_PROJECT_REF`, `MAINTFLOW_BACKUP_SCRATCH` (a private directory on an encrypted mount), `MAINTFLOW_BACKUP_RECIPIENTS` (the public recipients file), `MAINTFLOW_BACKUP_REMOTE` (the approved rclone prefix), and `MAINTFLOW_BACKUP_HISTORY` (`present` or `absent`, based on read-only catalog checks). Inject the scoped Supabase login and its database password through the secret manager. Use `ExecStart=/usr/bin/bash /opt/maintflow-backup/backup-supabase.sh` under the dedicated account. The script explicitly selects the configured Supabase project for every dump. It requires `present` for production `tkofnsyqywhixuotbiet` and checks that the data dump includes both Auth users and identities, even for an empty project.
- Schedule the job with the backup machine's systemd timer at 02:00 UTC using `OnCalendar=*-*-* 02:00:00 UTC`, `Persistent=true`, and `RandomizedDelaySec=10m`. Use a dedicated oneshot service and an `OnFailure=` notification unit wired to the owner's alert service. Also alert if offsite storage has no verified new object after 26 hours. Use the same job for approved pre-migration exports.
- The job locks per project, uses a fresh private scratch directory, and verifies the encrypted object by reading it back before uploading its checksum as the completion marker. Treat archives without a completion marker as failed jobs. Configure retention in storage so ordinary upload credentials cannot remove earlier backups. Keep backup logs access-restricted and alert on exit status or an overdue completion marker.
- Dry-run the timer and failure alerts with a disposable staging export before enabling the production job. Then complete a restore drill using the same encrypted format and credentials separation. The backup host, offsite destination, and notification route must be selected before enabling the timer.

## Restore and rehearse

1. At least monthly, restore a reviewed backup into a disposable, access-restricted Supabase-compatible environment, using the official order for roles, schema and data. Check the destination reference before each write. Disable outgoing integrations in the restore environment and use approved remapped or disposable data when possible. Never restore over staging or production during a drill.
2. Verify the encrypted-object checksum, decrypt using the authorized recovery identity, restore the compatible Postgres/Supabase versions and confirm the expected table counts, constraints, RLS and Auth-profile links without printing real records. Restore storage objects if applicable. Record elapsed time and failures to establish an actual RTO. Delete the restore once the owner signs off.
3. During an incident the data owner approves the recovery point and destination. The recovery operator verifies and restores, and the application owner validates readiness and authorizes the connection change. The hosting provider restores infrastructure only as scoped by that plan.

This file describes the procedure. No production records were exported or restored during preparation.

For the restore drill, retrieve the named archive and sidecar into an empty encrypted directory and use `sha256sum -c <archive>.sha256`. Decrypt and list it with `age --decrypt -i <protected-recovery-identity> <archive> | tar -tzf -`. Verify it contains only `roles.sql`, `schema.sql`, `data.sql`, `backup-inventory.txt` and, for a source with a journal, `history_schema.sql` and `history_data.sql`. Extract those exact entries into the encrypted directory. Restore only into the disposable destination according to the official procedure for roles, schema, data, Auth and storage, including its managed-schema exclusions and `ON_ERROR_STOP`. Compare expected critical table counts and the migration journal with the backup inventory. Confirm `public.users.id` references `auth.users.id`, that there are zero orphan profiles, that RLS is enabled on the application tables, and that an anonymous role cannot read the operational tables. A fixture administrator and an inventory fixture can verify the last-admin and stock constraints without using real accounts. Keep the completion and restore reports with the encrypted backup.

### Development recovery checkpoint

- Source is `maintflow-db` (`nufovhdkroobbwqxiszt`, PostgreSQL 17). A read-only inventory found nine public tables with RLS enabled, 19 application functions, 17 application triggers, 45 public policies, 39 public table constraints, and 17 public indexes. It found three Auth users, three Auth identities, three application profiles, and zero orphan links. All three Auth users have a stored password verifier. Record counts only.
- The source had no Supabase migration journal. Record that absence alongside the exact Git revision used for the recovery. No Storage buckets or objects, Edge Functions, application Realtime tables, or application triggers on managed Auth and Storage tables were found. Record the managed settings separately, including Auth provider and signup settings, Site URL and callbacks, JWT/token policy, and any SMTP or hook configuration. Keep private signing material, API keys and SMTP credentials in the approved secret manager. A PostgreSQL restore checks Auth records and relationships. A Supabase-compatible runtime is needed to exercise Auth as a service.
- Before pausing development, require a checked encrypted archive in the approved backup destination and a successful restore of that archive in an isolated PostgreSQL 17 instance. Record the restore counts, results, date and approved recovery identity. Preserve an encrypted copy outside the development machine.
