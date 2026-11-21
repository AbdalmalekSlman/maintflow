#!/usr/bin/env bash
set -euo pipefail
umask 077

ref=${MAINTFLOW_BACKUP_PROJECT_REF:?Set the authorized Supabase project reference}
scratch=${MAINTFLOW_BACKUP_SCRATCH:?Set the private directory on an encrypted volume}
recipients=${MAINTFLOW_BACKUP_RECIPIENTS:?Set the age public recipients file}
remote=${MAINTFLOW_BACKUP_REMOTE:?Set the rclone offsite destination}
history=${MAINTFLOW_BACKUP_HISTORY:?Set migration journal state to present or absent}

if [[ ! $ref =~ ^[a-z0-9]{20}$ || ! -d $scratch || ! -s $recipients || $remote != *:* || $remote == -* ]]; then
  printf 'Invalid MaintFlow backup configuration\n' >&2
  exit 2
fi
if [[ $history != present && $history != absent ]]; then
  printf 'Invalid migration journal state\n' >&2
  exit 2
fi
if [[ $ref == tkofnsyqywhixuotbiet && $history != present ]]; then
  printf 'The MaintFlow production backup must include the migration journal\n' >&2
  exit 2
fi

for program in supabase age rclone tar sha256sum flock grep; do
  command -v "$program" >/dev/null
done

exec 9>"$scratch/.maintflow-$ref.lock"
flock --nonblock 9
job=$(mktemp -d -- "$scratch/maintflow-$ref.XXXXXXXX")
trap 'rm -rf -- "$job"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

stamp=$(date -u +%Y%m%dT%H%M%SZ)
archive="maintflow-$ref-$stamp.tar.gz.age"

# Use an explicit reference for every export, even if this host is linked elsewhere.
supabase db dump --remote="$ref" --file "$job/roles.sql" --role-only
supabase db dump --remote="$ref" --file "$job/schema.sql"
supabase db dump --remote="$ref" --file "$job/data.sql" --data-only --use-copy \
  --exclude storage.buckets_vectors --exclude storage.vector_indexes
files=(roles.sql schema.sql data.sql backup-inventory.txt)
if [[ $history == present ]]; then
  supabase db dump --remote="$ref" --file "$job/history_schema.sql" --schema supabase_migrations
  supabase db dump --remote="$ref" --file "$job/history_data.sql" --schema supabase_migrations --data-only --use-copy
  files+=(history_schema.sql history_data.sql)
fi
printf 'project_ref=%s\nsnapshot_utc=%s\nmigration_journal=%s\n' "$ref" "$stamp" "$history" > "$job/backup-inventory.txt"
for file in "${files[@]}"; do
  test -s "$job/$file"
done
for table in users identities; do
  if ! grep -Eq "^COPY \"?auth\"?\.\"?$table\"? \(" "$job/data.sql"; then
    printf 'Backup is missing managed Auth COPY data for %s\n' "$table" >&2
    exit 1
  fi
done

tar -C "$job" -czf - "${files[@]}" |
  age --recipients-file "$recipients" --output "$job/$archive"
(cd "$job" && sha256sum "$archive" > "$archive.sha256")

target="${remote%/}/$archive"
rclone copyto --immutable "$job/$archive" "$target"
read -r local_digest _ < "$job/$archive.sha256"
remote_digest=$(rclone cat "$target" | sha256sum)
if [[ ${remote_digest%% *} != "$local_digest" ]]; then
  printf 'Offsite backup checksum mismatch for project %s\n' "$ref" >&2
  exit 1
fi
# The checksum file is also the completion record. Upload it only after verification.
rclone copyto --immutable "$job/$archive.sha256" "$target.sha256"
printf 'Verified offsite MaintFlow backup for project %s at %s\n' "$ref" "$stamp"
