# MaintFlow pull deployment

`maintflow` remains the development repository. In `CCPs-INST`, `maintflow-release-control` holds the reviewed workflow and approved source request. `deploy` holds only `maintflow.tar.gz`, `SHA256SUMS`, and `release.json`. The VPS pulls `deploy` with its existing read-only SSH key. The workflow has no VPS connection, server credential, VPS address, or access to the private Supabase keys.

## Private rehearsal now

The rehearsal uses the MaintFlow repository and the separate Supabase staging project. Keep the existing updater, Flask, port `8100`, nginx and public DNS in service. Leave both CCPs-INST branches and the production database untouched during this rehearsal.

1. In **MaintFlow → Settings → Environments → maintflow-build-staging**, add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` under **Environment variables** using the staging project. Restrict the environment to the approved feature branch during rehearsal. The [read-only feature-branch workflow](../../.github/workflows/standalone-release.yml) builds Linux x64 on a push to `feature/employee-number-auth`. With neither variable set, a push produces a synthetic `smoke` artifact for CI verification. Use only an artifact named `maintflow-staging-<source-sha>-linux` for the VPS. After saving the public variables, rerun the approved feature-branch workflow with **Re-run all jobs** or publish the next reviewed feature-branch commit. The rehearsal verifier rejects synthetic and production artifacts.
2. Download and extract the outer Actions artifact ZIP on the administrator's machine. Transfer the inner `.tar.gz` and its `.sha256` file to a private VPS location using your existing authorized access. Verify the checksum from that directory, then use the shared validator to unpack into a fresh rehearsal directory:

   ```sh
   sha256sum -c maintflow-staging-<source-sha>-linux-x64.tar.gz.sha256
   PYTHONPATH=/usr/local/lib/maintflow python3 -B -c 'from pathlib import Path; from deploy_release import unpack; import sys; unpack(Path(sys.argv[1]), Path(sys.argv[2]))' \
     maintflow-staging-<source-sha>-linux-x64.tar.gz /srv/maintflow-rehearsal/releases/<source-sha>
   ```

3. Use the dedicated `maintflow-rehearsal` service account, root-owned release files, and a `.next/cache` directory writable by that account. Point `/srv/maintflow-rehearsal/current` at the reviewed rehearsal release. Install only [`maintflow-rehearsal.service`](maintflow-rehearsal.service) for this phase and set `/etc/maintflow/rehearsal.env` to the staging URL and keys, a rehearsal-only rate-limit secret, and `AUTH_TRUSTED_ORIGIN=http://localhost:18100`. Keep it root-owned and mode `0600`. Install the root-owned validator at `/usr/local/lib/maintflow/deploy_release.py` and confirm the actual Node path in the unit. The production units and approval file can wait.
4. Run `sudo systemd-analyze verify /etc/systemd/system/maintflow-rehearsal.service`, `sudo systemctl daemon-reload`, and `sudo systemctl start maintflow-rehearsal.service`. Verify the listener is `127.0.0.1:18100`. Use `ssh -N -L 18100:127.0.0.1:18100 <authorized-user>@<server>` and open `http://localhost:18100`. Check the home page, static files, and protected routes. Record `MemoryCurrent`, `MemoryPeak`, and `NRestarts` for the rehearsal unit. Stop only that unit after rehearsal. Port `18100` is also reserved for later private production candidates, so the two units cannot run together.

## GitHub setup after provider approval

1. Create `maintflow-release-control` in CCPs-INST without changing `main`. Restrict writes to release maintainers. Install [`ccps-workflow.yml`](ccps-workflow.yml) as `.github/workflows/maintflow-publish.yml` there. Copy `deploy_release.py` and `publish_deploy.py` into `deployment/pull/` on that branch. The control branch push trigger works without adding this workflow to default `main`.
2. In **CCPs-INST → Settings → Environments**, create `maintflow-build-production` and `maintflow-publish-production`. Limit both to `maintflow-release-control`. Add a reviewer to the publish environment where available. The build environment needs only the three public variables below. The publish environment needs only `MAINTFLOW_PRODUCTION_SUPABASE_REF`. Verify Actions policy allows the publish job's repository-scoped `contents: write`. The build job uses `contents: read`, and the publisher performs a normal fast-forward push specifically to `refs/heads/deploy`.
3. Publish the reviewed MaintFlow source commit to its own repository using the normal review process. In the control branch, commit `deployment/maintflow-release.json` containing `{"sourceSha":"<full-reviewed-maintflow-commit>"}`. The workflow checks out that exact revision, runs Node 24 lint and type checks and the Next.js Linux x64 build, extracts and smoke-tests the artifact, and stages it for the separately gated publish job. When a job fails, no deploy commit is pushed. The workflow does not restart services or trigger the VPS.
4. Review the resulting `deploy` commit and build summary, then record its exact SHA and source SHA on the VPS. This separate approval prevents an unexpected branch tip from being activated. Keep the `CCPs-INST` history bundle and old Flask backups described in the [cutover runbook](../CCPS-INST-cutover.md).

### Variables and Supabase isolation

| Location | Name | Purpose |
|---|---|---|
| GitHub build environment **Variables** | `NEXT_PUBLIC_SUPABASE_URL` | Approved production HTTPS Supabase URL. Inlined at build time. |
| GitHub build environment **Variables** | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Approved public client key, never a service key. Inlined at build time. |
| Both GitHub environment **Variables** | `MAINTFLOW_PRODUCTION_SUPABASE_REF` | Public project reference independently checked against the build URL. |
| VPS runtime environment file | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Must exactly match the artifact's public URL and key fingerprint. |
| VPS runtime environment file | `SUPABASE_SERVICE_ROLE_KEY` | Private project key, used by server-side Supabase administration. |
| VPS runtime environment file | `AUTH_RATE_LIMIT_SECRET` | Private per-environment HMAC secret. |
| VPS runtime environment file | `AUTH_TRUSTED_ORIGIN` | Exact production browser origin, `https://ccp-inst.duckdns.org`. |
| systemd unit | `NODE_ENV`, `HOSTNAME`, `PORT` | `production`, `127.0.0.1`, `8100` for production. |

The build and VPS checks reject the known development and staging project references. The VPS also rejects a runtime URL or public key that differs from the built artifact. Maintain a distinct approved production project. The public key is checked against that project's read-only Auth settings endpoint during the build. Use a separate staging build and disposable accounts for private staging. PostgreSQL data is remote, so SQLite and old uploads are needed only for Flask rollback. Supabase Free projects may pause after inactivity and do not include automatic backups. Before production approval, confirm the production backup schedule, retention and recovery objectives, and demonstrate an isolated restore.

## VPS setup and safe activation

1. Verify Ubuntu x64, glibc compatibility with the GitHub runner, Node.js 24 at the configured path, Python 3.12 or newer with `tarfile` data filtering, systemd memory accounting, and private port `18100` availability. The production process uses the current Flask port `8100` after cutover. The host needs HTTPS access to Supabase and existing SSH access to GitHub. There is no npm install or build on the VPS.
2. Have the provider create the `maintflow` service account. Keep `/srv/maintflow` and `/srv/maintflow/releases` owned and writable by root or a dedicated administrator, and readable/traversable by `maintflow`. Keep the fetch-only CCPs-INST clone separate and accessible to the existing deploy-key account. Install `deploy_release.py` at `/usr/local/lib/maintflow/deploy_release.py` as root-owned. Install the two example systemd units after review. Use the real Node installation path. Create `/etc/maintflow/production.env` using [`runtime.env.example`](runtime.env.example) with root ownership and mode `0600`. Keep `/etc/maintflow` traversable by the service account for the nonsecret approval file, which can be root-owned mode `0644`.
3. Write `/etc/maintflow/approval.json` with `deployCommit`, `sourceSha`, and `productionProjectRef`. Copy both full Git SHAs from the reviewed build and `deploy` commit. Confirm the reference independently in the production Supabase dashboard. The archive checksum is bound to the approved Git commit; the installer also compares the metadata outside the archive with the file inside it.
4. For a dry preparation, run as the provider administrator, substituting the actual fetch checkout and account:

   ```sh
   /usr/bin/python3 -B /usr/local/lib/maintflow/deploy_release.py \
     --repo /path/to/CCPs-INST-fetch --fetch-user existing-deploy-user --prepare-only
   ```

   It fetches only `deploy`, checks the approved tip and SHA-256, limits and filters archive extraction, validates the standalone files, and installs them under `/srv/maintflow/releases/<deployCommit>`. No service starts in prepare-only mode. You can test the candidate privately using `maintflow-candidate@<deployCommit>.service` on port `18100` and an SSH tunnel. Stop that unit after checking the home page, assets, and protected redirects. Use the approved staging build and staging settings for tests that modify data.
5. After successful initial cutover, replace only the CCPs-INST update task with the same command **without** `--prepare-only`. Keep the task under a provider-managed service account or root-owned timer. The script uses the existing fetch identity for Git operations and serializes installation with a lock. It requires a running, healthy MaintFlow production service and a valid previous release, so it cannot take over the initial Flask cutover. It tests the new release privately, stops the candidate, atomically updates `current`, restarts only `maintflow.service`, then checks port `8100`. A failing activation restores the previous symlink and restarts and checks the previous release. Candidate failures leave the existing service in place. Keep at least the previous verified release. Installed releases are administrator-owned, with a writable cache only.

### Writable paths and memory

- Next.js can use `.next/cache` for optimized images and filesystem caching. The installer creates a per-release `.next/cache` owned by `maintflow`. The service gives it write access there and a private `/tmp`. MaintFlow currently has no `next/image` imports or explicit timed ISR routes. The remaining release tree stays read-only. If a future change introduces filesystem-backed ISR writes outside `.next/cache`, validate it in staging and configure an explicit writable cache or cache handler before release.
- Production `MemoryMax=700000000` is 700 MB in decimal bytes. The private candidate unit is capped at 200 MB, and the script skips in-place validation if production currently exceeds 450 MB. Confirm the VPS provider's aggregate policy. Observed memory from the short Windows smoke test is a baseline. Validate Linux cgroup peak memory and performance under representative load before enabling automation.
- Monitor `systemctl show maintflow.service -p MemoryCurrent -p MemoryPeak -p MemoryMax -p NRestarts` and `journalctl -u maintflow.service`. Keep the existing nginx certificate and renewal mechanism; use [`nginx-location.conf`](nginx-location.conf) only inside the intended HTTPS vhost. Verify HTTPS redirects and health from both loopback and the public endpoint after an approved switch.

## Initial cutover checklist

1. Obtain explicit owner and provider approval. Confirm the separate production database, provider backups and restore, and approve the exact Linux artifact and deploy SHA. Pass private staging checks and VPS memory tests.
2. In the maintenance window, pause only the legacy Flask updater. Keep the Flask checkout, data, service unit and original vhost available. Privately validate the candidate on `18100` and stop it. Create the initial `current` symlink under provider control.
3. Stop the old Flask service to free `8100`, start `maintflow.service`, and verify loopback plus public HTTPS health. If an nginx edit is needed, run `nginx -t` before a graceful reload. Confirm the password-protected dashboard redirects and that nginx presents the original hostname and certificate. Enable the new scheduled pull after verification.
4. For initial rollback, pause the MaintFlow updater, stop only MaintFlow, restore the original Flask service and nginx vhost if changed, and verify the public site. For subsequent MaintFlow releases, the updater restores the prior working symlink on failure. Investigate failed rollbacks via systemd logs before another attempt. The updater targets only MaintFlow systemd units and does not manage Flask, nginx or any unrelated portal.
