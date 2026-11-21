# MaintFlow cutover on the CCPs-INST VPS

Keep `AbdalmalekSlman/maintflow` as the source of record. Use `CCPs-INST` as the deployment mirror only after the owner approves its first replacement commit. The candidate commit preserves the old Git history and replaces the tracked tree with the exact approved MaintFlow tree.

## 1. Back up and inventory the live site

1. Record the live checkout path and commit, Python executable and package versions, service name, update-job name and schedule, nginx vhost path, TLS renewal mechanism, and actual upstream port. Check `node --version`, free RAM and disk, and a free loopback port. Keep the currently running Flask service and updater in place during preparation.
2. On the VPS, create a timestamped private backup directory with `umask 077`. Use `sqlite3 /actual/path/cmms.db ".backup '/private/backup/cmms.db'"` and run `sqlite3 /private/backup/cmms.db 'PRAGMA integrity_check;'`. Expect `ok`. Archive `uploads/` and any retained `reports/` with permissions preserved. For the final snapshot, agree on a brief write freeze so the filesystem and database snapshot represent the same point in time. Use SQLite's backup command for the live database so its WAL is accounted for.
3. Back up the current Flask checkout and any local overrides, the service definition, updater, nginx vhost, and environment files. Preserve protected files and credentials in the host's encrypted or access-controlled backup location. Back up the TLS configuration and verify renewal access. Record checksums and test restoring the database, media and Python dependencies into an isolated directory.
4. Keep the verified Git history bundle separately from the data backup. To recover the tracked source into a new directory, run `git clone CCPs-INST-before-maintflow.bundle restored-ccps`. Git history alone cannot restore the database, uploaded files or secrets.

## 2. Provider-approved pull deployment

Use the [pull deployment runbook](pull/README.md) for the separate CCPs-INST control and deploy branches, GitHub release build, systemd and nginx, and the initial cutover and rollback. Keep the reviewed replacement-source bundle as an offline reference. The live architecture pulls compiled release files from the CCPs-INST deploy branch.
