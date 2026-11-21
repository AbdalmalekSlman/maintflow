# MaintFlow provider runbook

## Rehearsal only

The current milestone uses the **existing Linux x64 staging artifact from bfa8a9d**. Review the legacy updater's units, cron, or hosting panel first. Confirm its exact fetch, checkout and trigger select only CCPs-INST main and that it ignores other branches. Record the result without keys or environment contents. Obtain the owner's explicit publication approval after verifying isolation. The local rehearsal bundle has no remote changes. The staging branch contains only maintflow.tar.gz, SHA256SUMS and release.json, and has no ancestry from main. It is outside the production workflow's trigger. The production installer fetches only deploy and rejects staging metadata.

For the authorized publisher, import the reviewed bundle into a disposable CCPs-INST clone and inspect the tree. After the gate above, an authorized GitHub writer may push only the explicit rehearsal ref. Confirm the branch is absent or review any existing history first. Use a normal push.

```sh
git bundle verify /path/to/maintflow-rehearsal.bundle
git fetch /path/to/maintflow-rehearsal.bundle refs/heads/maintflow-rehearsal:refs/heads/maintflow-rehearsal
git ls-tree -r --name-only refs/heads/maintflow-rehearsal
# Only after permission and legacy-updater isolation are confirmed:
git push origin refs/heads/maintflow-rehearsal:refs/heads/maintflow-rehearsal
```

### VPS web console procedure

Keep Flask, nginx, the existing updater and port 8100 unchanged. Verify Node.js 24 at /opt/node24/bin/node, Ubuntu x64 and Python 3.12 or newer. Reserve loopback port 18100 and check that the three provider portal paths in InaccessiblePaths exist so systemd can mask them. Treat a missing path as a provider review item. The rehearsal service needs only /srv/maintflow-rehearsal/current, its writable cache and a private temporary directory. It has no portal mounts.

As the approved repository fetch identity with the existing read-only deploy key, use a dedicated scratch Git checkout and an empty artifact directory. The existing Flask checkout remains in place.

```sh
umask 077
scratch=$(mktemp -d)
git init --bare "$scratch/rehearsal.git"
git -C "$scratch/rehearsal.git" fetch --no-tags git@github.com:AbdalmalekSlman/CCPs-INST.git refs/heads/maintflow-rehearsal
git -C "$scratch/rehearsal.git" ls-tree -r --name-only FETCH_HEAD
git -C "$scratch/rehearsal.git" show FETCH_HEAD:maintflow.tar.gz > "$scratch/maintflow.tar.gz"
git -C "$scratch/rehearsal.git" show FETCH_HEAD:SHA256SUMS > "$scratch/SHA256SUMS"
git -C "$scratch/rehearsal.git" show FETCH_HEAD:release.json > "$scratch/release.json"
(cd "$scratch" && sha256sum -c SHA256SUMS)
```

For this rehearsal only, have the provider create the unprivileged maintflow-rehearsal service account and an isolated rehearsal directory, then run the extraction as the unprivileged deployment operator into a new directory entrusted to that operator. Install the validator root-owned at /usr/local/lib/maintflow/deploy_release.py. Use the prepared unit and create root-owned mode 0600 /etc/maintflow/rehearsal.env using staging values and AUTH_TRUSTED_ORIGIN=http://localhost:18100. Grant the runtime user write access only to the release's .next/cache. Point /srv/maintflow-rehearsal/current at the validated release. Apply the same cache-group pattern as production with a separate rehearsal group, or have the provider set this single cache directory's owner during setup.

```sh
release=/srv/maintflow-rehearsal/releases/bfa8a9d6f21661a6e050c5858646a71679eb513b
test ! -e "$release"
PYTHONPATH=/usr/local/lib/maintflow python3 -B -c 'from pathlib import Path; import json,sys; from deploy_release import unpack,validate_metadata,STAGING_PROJECT; a,m,d=map(Path,sys.argv[1:]); unpack(a,d); actual=json.loads((d/"release.json").read_text()); assert actual==json.loads(m.read_text()); validate_metadata(actual,d.name,f"https://{STAGING_PROJECT}.supabase.co","staging")' "$scratch/maintflow.tar.gz" "$scratch/release.json" "$release"
```

As provider administrator, validate and load the unit, then run the checks from the VPS web console:

```sh
sudo systemd-analyze verify /etc/systemd/system/maintflow-rehearsal.service
sudo systemctl daemon-reload
sudo systemctl start maintflow-rehearsal.service
ss -ltn 'sport = :18100'
curl -fsS -o /dev/null -w 'Home HTTP %{http_code}\n' http://127.0.0.1:18100/
curl -fsS -o /dev/null -w 'Public asset HTTP %{http_code}\n' http://127.0.0.1:18100/file.svg
asset=$(find "$release/.next/static" -type f -name '*.js' -printf '%P\n' | head -n 1)
test -n "$asset"
curl -fsS -o /dev/null -w 'Next.js asset HTTP %{http_code}\n' "http://127.0.0.1:18100/_next/static/$asset"
curl -sS -o /dev/null -w 'Protected route HTTP %{http_code}\n' http://127.0.0.1:18100/dashboard/work-orders
sudo journalctl -u maintflow-rehearsal.service --since '15 minutes ago' --no-pager
systemctl show maintflow-rehearsal.service -p MemoryCurrent -p MemoryPeak -p MemoryMax -p CPUUsageNSec -p CPUQuotaPerSecUSec -p NRestarts
cg=$(systemctl show maintflow-rehearsal.service -p ControlGroup --value)
sudo cat "/sys/fs/cgroup$cg/memory.current" "/sys/fs/cgroup$cg/memory.peak" "/sys/fs/cgroup$cg/cpu.stat"
```

Expect loopback only, HTTP 200 for home and both assets, and 307 for the protected route. For a read-only staging database check, the provider can run the following with the root-owned environment file. Pass the key to curl over standard input and show only the status. This request selects zero rows and runs no login, reset or rate-limit tests.

```sh
sudo sh -c '
  set -eu
  . /etc/maintflow/rehearsal.env
  test "$NEXT_PUBLIC_SUPABASE_URL" = "https://dmrmqrtjmpeyoekicctp.supabase.co"
  {
    printf "header = \"apikey: %s\"\n" "$SUPABASE_SERVICE_ROLE_KEY"
    case "$SUPABASE_SERVICE_ROLE_KEY" in eyJ*) printf "header = \"Authorization: Bearer %s\"\n" "$SUPABASE_SERVICE_ROLE_KEY";; esac
  } | curl --config - --silent --show-error --fail --output /dev/null --write-out "Staging database HTTP %{http_code}\n" "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/inventory?select=id&limit=0"
'
sudo systemctl stop maintflow-rehearsal.service
```

Record sanitized status and memory figures. Keep the tested archive and logs until review. Once the provider confirms the service is stopped, remove only the rehearsal symlink if it points to the reviewed SHA, and remove that exact release directory and the scratch directory after checking their resolved paths against the expected rehearsal and temporary roots. Leave production release directories, Flask and the portal alone. The rehearsal and the production candidate share port 18100 and run at different times.

## Production after separate cutover approval

Use the [production checklist](production-checklist.md) to track the database, backup, approval and cutover prerequisites.

Maintain development in [MaintFlow](https://github.com/AbdalmalekSlman/maintflow). In the public CCPs-INST repository create the maintflow-release-control branch after provider and owner approval. Install [ccps-workflow.yml](ccps-workflow.yml) at .github/workflows/maintflow-publish.yml and copy deploy_release.py and publish_deploy.py to deployment/pull on the control branch. Restrict control branch changes to trusted maintainers. Main remains the Flask branch.

1. In **CCPs-INST → Settings → Environments**, create maintflow-build-production and maintflow-publish-production. Select **Selected branches and tags** and allow only the **branch** maintflow-release-control on both. Under **Required reviewers** on the publish environment select AbdalmalekSlman. Disable administrator bypass. If the owner also submits release requests, either leave self-review enabled for that owner or arrange a separate requester and then enable **Prevent self-review**. Keep the publication gate active in both cases. Public repositories support required reviewers on current GitHub plans. If the controls are unavailable or the review API cannot verify the owner's approval, publication stops. There is no ungated mode.
2. Configure only public production variables below. Submit deployment/maintflow-release.json containing the full reviewed MaintFlow source SHA at the control branch. Use a fresh request for each run. The publish job requires first-attempt owner approval for that environment in GitHub's review history, then uses GitHub OIDC to attest the archive and pushes a fast-forward commit to deploy. The production package tree contains maintflow.tar.gz, SHA256SUMS, release.json and provenance.jsonl. Production verification rejects a matching checksum alone if the attestation is absent, invalid, or from another workflow or repository.
3. Protect the deploy branch against direct writes where GitHub rules permit allowing the Actions publisher. Even if the repository owner can write the branch directly, an unsigned or differently signed artifact cannot pass VPS activation. No personal access token, private runtime secret or VPS credential goes into GitHub.

| Location | Names and uses |
|---|---|
| GitHub build environment Variables | NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY for the approved production build, plus MAINTFLOW_PRODUCTION_SUPABASE_REF for the target check |
| GitHub publish environment Variables | MAINTFLOW_PRODUCTION_SUPABASE_REF |
| VPS production.env or rehearsal.env | NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY match the artifact; SUPABASE_SERVICE_ROLE_KEY and AUTH_RATE_LIMIT_SECRET are server-only; AUTH_TRUSTED_ORIGIN identifies the exact browser origin |
| systemd ExecStart | NODE_ENV=production, HOSTNAME=127.0.0.1, PORT=8100 for production and 18100 for rehearsal or a candidate |

### One-time VPS setup

- In /etc/maintflow/production-project put only the separately approved production project reference, owned by root, mode 0444. The VPS rejects the known development and staging refs. Install trusted GitHub CLI at /usr/bin/gh. As provider administrator, obtain GitHub's trusted root with gh attestation trusted-root and install the resulting trusted_root.jsonl at /etc/maintflow/trusted_root.jsonl, root-owned mode 0444. Refresh the trust file under provider control as needed. The updater uses the bundled attestation and pinned workflow, source branch and repository ID for offline verification. It needs no GitHub API token on the VPS.
- Create a dedicated unprivileged maintflow-deploy account and a separate maintflow runtime user. Both must be members of maintflow-cache. Assign /srv/maintflow/releases and the /srv/maintflow pointer/history directory to maintflow-deploy. Give maintflow read and traverse privileges, without write access to release code or its parent directories. The updater creates a setgid group-writable .next/cache for each release. The runtime service exposes only that cache and a private /tmp for writes. The deploy identity can replace service code and must be treated as trusted: restrict interactive access, protect its existing fetch key and SSH known-hosts, and keep the runtime identity separate. Maintain a fetch-only Git directory at /var/lib/maintflow-deploy/CCPs-INST.git owned by maintflow-deploy. The existing read-only deploy key should be usable by that identity.
- Install the Python script, production, candidate and updater units as root-owned files. Install the [three-command sudo policy](maintflow-deploy.sudoers) via visudo and verify it with sudo -l -U maintflow-deploy. The deployment user gets only candidate start and stop and MaintFlow restart. The updater unit omits NoNewPrivileges so those three sudo calls can work. Root is needed for users and groups, systemd, sudoers, the protected portal mounts, the read-only trust files, and protected environment files. Downloads, checks, extraction, release switching and retention run as maintflow-deploy.
- Run systemd-analyze verify on the installed units, confirm the portal paths are masked, and confirm MaintFlow can read /opt/node24, /srv/maintflow and required /etc/maintflow files while writing only the declared cache. The service environment files stay root-owned mode 0600 and systemd reads them on behalf of the runtime. Confirm candidate load fits the host's shared budget: the production and rehearsal caps remain 700 MB, the candidate has its tighter 200 MB cap, and every unit has CPUQuota=50%. These are per-unit limits, not a shared cgroup cap.

Validate a prospective production release by running the updater with --prepare-only as maintflow-deploy. The fetch uses only CCPs-INST/deploy. Checksum, attestation, target metadata, files and known credential patterns are checked before installing. Production starts only on the existing hostname after separate cutover approval. Keep Flask's source, service and data available per the [legacy backup runbook](../CCPS-INST-cutover.md). Privately verify the production-bound candidate only when the production project is approved. Stop that candidate, pause the legacy updater, release port 8100 from Flask, establish the initial current symlink and start MaintFlow. Preserve nginx TLS and validate with nginx -t before any separately approved reload.

After a healthy initial cutover the provider may schedule maintflow-updater.service. The updater requires a healthy existing MaintFlow release. Candidate failure leaves the active service alone. Activation failure restores the previous pointer and checks it again. Successful activation retains the current release and two prior successful releases. Cleanup examines only validated SHA directories in the activation journal, protects active and candidate links, and ignores unknown or failed releases. An unsafe platform or invalid journal skips cleanup. Initial rollback remains provider-managed: pause MaintFlow's updater, stop only MaintFlow, restore the old Flask service and vhost if changed, and check the original HTTPS site. Regular release rollback never restarts Flask, nginx or the provider's portal.

See the [Supabase Free backup and recovery procedure](supabase-free-backups.md).
