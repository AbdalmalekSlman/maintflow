# MaintFlow cutover on the CCPs-INST VPS

Keep `AbdalmalekSlman/maintflow` as the source of record. Use `CCPs-INST` as the deployment mirror only after the owner approves its first replacement commit. The candidate commit preserves the old Git history and replaces the tracked tree with the exact approved MaintFlow tree.

## 1. Back up and inventory the live site

1. Record the live checkout path and commit, Python executable and package versions, service name, update-job name and schedule, nginx vhost path, TLS renewal mechanism, and actual upstream port. Check `node --version`, free RAM and disk, and a free loopback port. Keep the currently running Flask service and updater in place during preparation.
2. On the VPS, create a timestamped private backup directory with `umask 077`. Use `sqlite3 /actual/path/cmms.db ".backup '/private/backup/cmms.db'"` and run `sqlite3 /private/backup/cmms.db 'PRAGMA integrity_check;'`. Expect `ok`. Archive `uploads/` and any retained `reports/` with permissions preserved. For the final snapshot, agree on a brief write freeze so the filesystem and database snapshot represent the same point in time. Use SQLite's backup command for the live database so its WAL is accounted for.
3. Back up the current Flask checkout and any local overrides, the service definition, updater, nginx vhost, and environment files. Preserve protected files and credentials in the host's encrypted or access-controlled backup location. Back up the TLS configuration and verify renewal access. Record checksums and test restoring the database, media and Python dependencies into an isolated directory.
4. Keep the verified Git history bundle separately from the data backup. To recover the tracked source into a new directory, run `git clone CCPs-INST-before-maintflow.bundle restored-ccps`. Git history alone cannot restore the database, uploaded files or secrets.

## 2. Build a standalone release and test privately

The development repository owns the [build-only workflow](../.github/workflows/standalone-release.yml). Install Node.js 24 LTS on the VPS and confirm its CPU architecture and glibc compatibility with the workflow's Ubuntu 24.04 x64 runner. Build for a matching Linux runner if the VPS differs. The VPS needs Node and HTTPS access to Supabase and the approved asset source.

In the MaintFlow repository, open **Settings ? Environments**. Create `maintflow-build-staging` and, after production database approval, `maintflow-build-production`. Add only the two public variables below to the matching environment. Restrict the production build environment to reviewed refs, and require approval where your GitHub plan supports it. Open **Actions ? Build MaintFlow standalone release ? Run workflow**, choose the approved source ref and target, and download the artifact and checksum. GitHub requires the workflow to exist on the default branch before its manual dispatch is available. The existing draft PR remains the review path for that change.

| Variable | Location and purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | GitHub build environment and VPS runtime environment. URL for the selected Supabase project. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | GitHub build environment and VPS runtime environment. Public client key for the same project. |
| `SUPABASE_SERVICE_ROLE_KEY` | VPS runtime only. Server-only key for privileged Supabase queries. |
| `AUTH_RATE_LIMIT_SECRET` | VPS runtime only. Random secret unique to each environment. |
| `AUTH_TRUSTED_ORIGIN` | VPS runtime only. Use `https://ccp-inst.duckdns.org` for production and the exact browser origin for private staging, such as `http://localhost:18100`. |
| `PORT` | Runtime listener port. Default `8100`; use an unused port such as `18100` for private staging. |
| `HOSTNAME` | The packaged launcher sets it to `127.0.0.1`. |
| `NODE_ENV` | Runtime mode. The systemd unit declares `production`. |

The public values are embedded at build time. Match them on the VPS, and build a fresh artifact for production. Use separate root-owned, mode 0600 systemd environment files under `/etc/maintflow/`.

To reproduce the build on a compatible Linux build machine with the two public variables set:

```sh
npm ci --include=dev
npm run lint -- --max-warnings=0
npx --no-install next typegen
npx --no-install tsc --noEmit
npm run build
npm run package:standalone
```

The package includes the launcher, generated server, traced dependencies, public assets, Next.js static assets, and release metadata. On the VPS, create a new versioned release directory under `/srv/maintflow/releases/`. Have the deployment owner verify the approved SHA-256 and unpack the separately approved archive there:

```sh
sha256sum -c maintflow-staging-<source-sha>-linux-x64.tar.gz.sha256
tar --no-same-owner --no-same-permissions -xzf maintflow-staging-<source-sha>-linux-x64.tar.gz -C /srv/maintflow/releases/<release-id>
```

Give `maintflow` read/execute access to release files and write access to the runtime cache only (for example the release's `.next/cache`). Keep release ownership and the `current` symlink under the deployment owner. Start the extracted package using Node 24 and `node start.mjs`, with the staging variables and `PORT=18100` supplied by the staging service. Test through `ssh -N -L 18100:127.0.0.1:18100 <user>@<server>` with disposable Supabase accounts. Check assets, protected redirects, sign-in, PM dispatch and a stock deduction.

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
Environment=PORT=8100
MemoryAccounting=true
MemoryMax=700000000
EnvironmentFile=/etc/maintflow/production.env
ExecStart=/opt/node24/bin/node /srv/maintflow/current/start.mjs
Restart=on-failure
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

Prepare a copy of the existing HTTPS vhost that preserves the hostname, certificate and renewal configuration. The candidate `location /` should send application traffic to the MaintFlow service. Preserve any separate TLS challenge handling. Keep the exact original vhost ready to restore.

```nginx
location / {
    proxy_pass http://127.0.0.1:8100;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Port $server_port;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;
}
```

### Approved release activation

After approval, publish the reviewed Linux archive and checksum as assets on a versioned CCPs-INST GitHub Release tagged at the reviewed mirror commit. Record the artifact filename, SHA-256, MaintFlow source SHA, mirror SHA and Linux architecture in an approval record controlled by the deployment owner. GitHub Actions artifacts are temporary build outputs. The release asset is the delivery copy. For the public repository, HTTPS asset downloads can use the public release URL. The existing read-only SSH key fetches Git refs only.

At cutover, replace the Flask updater with a separate provider-owned timer or job. Serialize runs with `flock`. Process only a tag and checksum from the local approval record, verify the tag resolves to the approved mirror SHA, download to a private directory, verify the hash, and extract to a new release directory. Compare the artifact's `release.json` with the approved source SHA and platform. Reject failed validation and leave the active symlink alone. Smoke-test each candidate on an unused private port before switching `current`. Stop the candidate process before activating it on the fixed production port. If the VPS lacks headroom for two simultaneous Next.js processes, run candidate verification off-host on matching Linux before scheduling activation. The timer and service remain for the provider to review and install.

Monitor production memory using `systemctl show maintflow.service -p MemoryCurrent -p MemoryPeak -p MemoryMax -p NRestarts` and `journalctl -u maintflow.service`. Load-test authenticated paths and watch for cache growth, OOM events and restart loops under the confirmed 700 MB limit.

## 5. Cutover and rollback

1. Obtain explicit approval, agree on the maintenance window, verify restorable Flask backups, and confirm the separate approved production Supabase project with its correct schema, backup/restore and runtime settings. Confirm the private staging browser flow and Linux memory checks first. Retain SQLite and uploads for rollback.
2. Pause the legacy updater before publishing the replacement tree. Keep Flask on port 8100 while validating the production artifact privately on a free alternate port. Check the home page and protected routes, then stop the temporary candidate. Preserve the existing Flask checkout, service and the exact original nginx/TLS configuration.
3. Publish the reviewed fast-forward mirror commit and approved release asset. During the change window, stop Flask and start MaintFlow on port 8100. Validate nginx with `sudo nginx -t` and use a graceful reload if changing the vhost. Check the loopback health endpoint, `https://ccp-inst.duckdns.org/`, protected redirects, the public HTTPS origin, browser sign-in, an approved disposable workflow check, TLS and logs. Enable the new updater only after the handoff succeeds.
4. For immediate rollback, pause the new updater, stop MaintFlow to free port 8100, start Flask from its preserved checkout, restore the original nginx vhost if changed, and validate and reload nginx. Check the old homepage, sign-in and attachment access. Restore data from backup only if needed and while writes are stopped. Use a reviewed revert commit if the mirror must return to Flask, and resume the old updater after reviewing its target. For a later MaintFlow release failure, restore the previous release symlink, restart MaintFlow and verify health. Any Supabase writes made during the failed release need a separate reconciliation decision.
