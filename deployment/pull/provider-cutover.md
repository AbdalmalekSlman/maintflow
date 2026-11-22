# MaintFlow production VPS handoff

## Owner handoff before scheduling

Send this package once the separate production database, applied migration versions, backup restore drill and GitHub release approval are complete. Include the approved CCPs-INST deploy commit, MaintFlow source SHA, archive SHA-256, production Supabase reference and agreed change window. Supply the protected production runtime values through the agreed secret manager. The existing Flask updater has already been confirmed to fetch only `CCPs-INST/main` every two minutes.

## One server session

1. **Preserve Flask.** Record the live checkout SHA, Flask unit and updater job, SQLite and upload paths, current nginx vhost and certificate renewal setup. Create and verify the protected Flask backup using the [legacy backup instructions](../CCPS-INST-cutover.md#1-back-up-and-inventory-the-live-site). Keep Flask and the existing updater running while preparing the candidate. Confirm port 18100 is free and `/opt/node24/bin/node` is Node.js 24.
2. **Install the production prerequisites.** Follow [one-time VPS setup](README.md#one-time-vps-setup) for the two unprivileged accounts, cache group, read-only deploy key, fetch-only Git directory, pinned trust root, protected project reference and exact sudoers rules. Install the supplied production, candidate and updater unit files from this package, keeping the updater unscheduled. The updated Node.js units accept normal shutdown status 143. Set the five entries from [runtime.env.example](runtime.env.example) in root-owned mode-0600 `/etc/maintflow/production.env`. Use the canonical HTTPS origin and the production-only Supabase keys. Verify the units with `systemd-analyze verify` and run `systemctl daemon-reload`.
3. **Fetch and prepare privately.** Run these commands using the agreed production release values. Stop if the SHA or reported release differs. The installer verifies the archive SHA-256, attestation, metadata, and archive safety.

   ```sh
   set -eu
   deploy_commit='<owner-approved CCPs-INST deploy commit>'
   repo=/var/lib/maintflow-deploy/CCPs-INST.git
   sudo -u maintflow-deploy /usr/bin/python3 -B /usr/local/lib/maintflow/deploy_release.py \
     --repo "$repo" --prepare-only
   test "$(sudo -u maintflow-deploy git -C "$repo" rev-parse refs/remotes/origin/deploy)" = "$deploy_commit"
   release="/srv/maintflow/releases/$deploy_commit"
   sudo -u maintflow-deploy ln -sfnT -- "$release" /srv/maintflow/candidate
   sudo systemctl start maintflow-candidate.service
   curl -fsS --retry 10 --retry-connrefused --retry-delay 1 http://127.0.0.1:18100/ >/dev/null
   curl -fsS http://127.0.0.1:18100/file.svg >/dev/null
   sudo systemctl show maintflow-candidate.service -p MemoryPeak -p MemoryMax -p NRestarts
   sudo journalctl -u maintflow-candidate.service --since '10 minutes ago' --no-pager
   ```

   Confirm `curl -fsS http://127.0.0.1:18100/maintflow-revision.txt` returns the approved MaintFlow **source** SHA. Run the read-only database check from the [rehearsal procedure](README.md#vps-web-console-procedure) with the production environment file and exact approved production URL substituted. Share status only. Stop the candidate, confirm systemd reports a clean stop, and leave Flask serving until the owner gives the go-ahead.
4. **Switch within the approved window.** Pause the recorded Flask updater, stop only the recorded Flask service, and confirm port 8100 is free. Ensure `/srv/maintflow/current` does not already exist. Create it as a symlink to the validated release using the `maintflow-deploy` identity, then start `maintflow.service`. Keep the existing TLS settings. If changing the vhost is necessary, back up the file, apply the reviewed [nginx location](nginx-location.conf), run `nginx -t`, and reload only after it passes. Confirm home and static assets return HTTP 200 over HTTPS, protected routes redirect, the process listens on loopback, and systemd reports a stable process under its memory and CPU limits.
5. **Rollback on failure.** Leave the MaintFlow updater unscheduled, stop only `maintflow.service`, and restore the original nginx vhost if changed. Validate nginx before reloading. Restart Flask, verify the original public response, and resume the original updater. Keep the candidate files and sanitized logs for diagnosis. Once the first cutover is stable and the owner accepts it, enable MaintFlow at boot and schedule its updater. Keep the Flask archive and old updater disabled but recoverable. Future app rollbacks use the validated prior MaintFlow directory and leave nginx and other services alone.
