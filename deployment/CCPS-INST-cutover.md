# MaintFlow cutover on the CCPs-INST VPS

Keep `AbdalmalekSlman/maintflow` as the source of record. Use `CCPs-INST` as the deployment mirror only after the owner approves its first replacement commit. The candidate commit preserves the old Git history and replaces the tracked tree with the exact approved MaintFlow tree.

## 1. Back up and inventory the live site

1. Record the live checkout path and commit, Python executable and package versions, service name, update-job name and schedule, nginx vhost path, TLS renewal mechanism, and actual upstream port. Check `node --version`, free RAM and disk, and a free loopback port. Keep the currently running Flask service and updater in place during preparation.
2. On the VPS, create a timestamped private backup directory with `umask 077`. Use `sqlite3 /actual/path/cmms.db ".backup '/private/backup/cmms.db'"` and run `sqlite3 /private/backup/cmms.db 'PRAGMA integrity_check;'`. Expect `ok`. Archive `uploads/` and any retained `reports/` with permissions preserved. For the final snapshot, agree on a brief write freeze so the filesystem and database snapshot represent the same point in time. Use SQLite's backup command for the live database so its WAL is accounted for.
3. Back up the current Flask checkout and any local overrides, the service definition, updater, nginx vhost, and environment files. Preserve protected files and credentials in the host's encrypted or access-controlled backup location. Back up the TLS configuration and verify renewal access. Record checksums and test restoring the database, media and Python dependencies into an isolated directory.
4. Keep the verified Git history bundle separately from the data backup. To recover the tracked source into a new directory, run `git clone CCPs-INST-before-maintflow.bundle restored-ccps`. Git history alone cannot restore the database, uploaded files or secrets.

## 2. Prepare a private MaintFlow release

Install Node.js 24 LTS in an isolated location. Give a dedicated unprivileged `maintflow` account a release tree such as `/srv/maintflow/releases/` and permission to write its own build/cache files only. Keep the old checkout, Python service account and local data out of this tree. Confirm the account can reach npm, the build's font provider and the intended Supabase project over HTTPS. Confirm which `PORT` is free.

For each release, check out the exact approved source SHA into a new release directory. As the `maintflow` account, provide the following environment variables. The public variables must point to the same Supabase project during build and startup. A build for staging must be rebuilt before using a separate production database.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Target project URL, provided at build time and runtime |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Target public client key, provided at build time and runtime |
| `SUPABASE_SERVICE_ROLE_KEY` | Target server-only runtime key |
| `AUTH_RATE_LIMIT_SECRET` | Server-only random secret unique to that environment |
| `PORT` | Service environment variable, for example `3100` |

```sh
npm ci --include=dev
npm run lint -- --max-warnings=0
npx --no-install tsc --noEmit
npm run build
PORT=3100 npm start
```

Open an SSH tunnel to the private staging process (`ssh -N -L 3100:127.0.0.1:3100 <user>@<server>`). Test through `http://localhost:3100`, with staging Supabase and disposable accounts. Use an independent private port for a candidate when later releases must be checked while a current MaintFlow release is running. Build first and replace the `current` symlink only after the candidate responds. Keep the preceding release directory to enable rollback.

## 3. Prepare the deployment-mirror commit

From the primary repository, use the verified old mirror or an up-to-date read-only clone of `CCPs-INST`. Use full reviewed SHAs for both inputs. Save the bundle outside any tracked tree.

```text
node deployment/prepare-ccps-release.mjs . <approved-maintflow-sha> <path-to-ccps-mirror> <approved-ccps-main-sha> <new-candidate.bundle>
```

The script creates a local Git bundle for a commit whose sole parent is the approved `CCPs-INST` main commit. It neither patches the source checkout nor contacts GitHub. Verify the bundle from a CCPs-INST clone with `git bundle verify <new-candidate.bundle>`, then fetch its `refs/heads/maintflow-cutover-candidate` into a local review ref and review the complete diff. Scan the approved source tree for secrets before preparing or publishing a candidate. The filename check in the utility is an additional safeguard.

```sh
git bundle verify /path/to/new-candidate.bundle
git fetch /path/to/new-candidate.bundle refs/heads/maintflow-cutover-candidate:refs/heads/maintflow-cutover-candidate
git diff main refs/heads/maintflow-cutover-candidate
```

Before publishing, compare the current remote `main` against the candidate's parent. If either repository has moved from what was approved, regenerate and review a new candidate. Once approval is explicit and the Flask updater is fenced, use a normal fast-forward push of the reviewed candidate SHA to `refs/heads/main`. The server's existing read-only CCPs-INST deploy key can keep fetching that repository. Publishing requires a separate GitHub identity with write access and any checks required by branch protection.

## 4. Prepare isolated services and routing

Have the server owner install and validate a `maintflow.service` equivalent to the example below. Substitute the real Node path and chosen port. Supply `/etc/maintflow/production.env` with restricted permissions, separately from the staging secret file. Keep secrets out of release trees and process output.

```ini
[Unit]
Description=MaintFlow Next.js
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=maintflow
Group=maintflow
WorkingDirectory=/srv/maintflow/current
Environment=NODE_ENV=production
Environment=PORT=3100
EnvironmentFile=/etc/maintflow/production.env
ExecStart=/opt/node24/bin/node /srv/maintflow/current/node_modules/next/dist/bin/next start --hostname 127.0.0.1
Restart=on-failure
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

Prepare a copy of the existing HTTPS vhost that preserves the hostname, certificate and renewal configuration. The candidate `location /` should send application traffic to the MaintFlow service. Preserve any separate TLS challenge handling. Keep the exact original vhost ready to restore.

```nginx
location / {
    proxy_pass http://127.0.0.1:3100;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;
}
```

Replace the old Flask updater only at cutover. Its replacement should accept an approved immutable mirror commit, serialize deployments, build in a new directory using the pinned runtime, smoke-test a loopback candidate, atomically activate the release, and restart only MaintFlow. If activation fails, repoint `current` to the previous release and restart MaintFlow. Log revision and outcome without secrets. Validate that the existing deploy key is readable to the designated fetch account without copying its private contents into the application tree. Keep the old updater's unit or schedule backed up and disabled until a rollback is complete or retirement is approved.

## 5. Cutover and rollback

1. Obtain explicit approval, agree on the maintenance window, verify restorable Flask backups, and confirm there is a distinct approved production Supabase project with the correct schema, verified backup/restore and production settings. Complete the staging browser flow first. Hold the cutover if any of those gates are open.
2. Pause the legacy update job before pushing the replacement tree. Leave the old Flask service on its existing loopback address for rollback. Start MaintFlow privately and check `curl --fail http://127.0.0.1:3100/` and an unauthenticated protected route's redirect. Verify the production build targets the approved production Supabase project without printing secrets.
3. Fast-forward the mirror and switch only the existing nginx vhost upstream. Run `sudo nginx -t` before a graceful `sudo systemctl reload nginx`. Check `https://ccp-inst.duckdns.org/`, protected redirects, browser sign-in, a permitted disposable work-order flow, TLS renewal configuration and logs. Confirm a dashboard redirect retains the public HTTPS origin. Enable the revised updater after the handoff succeeds. The old site has no public hostname during this period.
4. For immediate rollback, pause the new updater, restore the original nginx vhost, run `sudo nginx -t`, gracefully reload nginx, and check the old homepage, sign-in and attachment access. If the old service was stopped, start it from its preserved checkout and environment. Restore SQLite and uploads from the final snapshot only if necessary and with writes stopped. If the deployment mirror must also revert, publish a reviewed revert commit without force-pushing. Resume the old updater only after main contains the Flask tree again. Supabase records created after cutover remain separate and need an explicit reconciliation decision.
