#!/usr/bin/env bash
set -euo pipefail
set +x
umask 077

if [[ $# != 4 || $1 != */rclone-dedicated.conf || ! -s $1 || ! -s $2 || ! -s $3 || ! $4 =~ ^[A-Za-z0-9_-]+$ ]]; then
  printf 'Supply verified Drive configuration and folder ID, Supabase CA, and public age recipient\n' >&2
  exit 2
fi

export PATH="/opt/maintflow-backup/bin:$PATH"
export RCLONE_CONFIG=$1 PGSSLROOTCERT=$2 MAINTFLOW_BACKUP_RECIPIENTS=$3
export MAINTFLOW_BACKUP_PROJECT_REF=tkofnsyqywhixuotbiet
export MAINTFLOW_BACKUP_POOLER_HOST=aws-1-ap-northeast-1.pooler.supabase.com
export MAINTFLOW_BACKUP_HISTORY=present
export MAINTFLOW_BACKUP_REMOTE=maintflow_gdrive:MaintFlow-Production-Backups
script_directory=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
folder_id=$(rclone lsjson --dirs-only maintflow_gdrive: |
  python3 -c '
import json, sys
matches = [item for item in json.load(sys.stdin) if item.get("IsDir") and item["Name"] == "MaintFlow-Production-Backups"]
print(matches[0].get("ID", "") if len(matches) == 1 else "")
')
if [[ $folder_id != "$4" ]]; then
  printf 'Drive folder does not match the verified backup destination\n' >&2
  exit 2
fi

state=/run/maintflow-production-backup
install -d -m 0700 "$state"
exec 8>"$state/lock"
flock -n 8
scratch=$(mktemp -d "$state/scheduled.XXXXXXXX")
mount -t tmpfs -o noswap,nodev,nosuid,noexec,mode=0700,size=512m tmpfs "$scratch" || { rmdir -- "$scratch"; exit 1; }
trap 'unset PGPASSWORD; cd /; umount -- "$scratch"; rmdir -- "$scratch"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
export MAINTFLOW_BACKUP_SCRATCH="$scratch"
cd "$scratch"
IFS= read -r -s PGPASSWORD
[[ -n $PGPASSWORD ]]
export PGPASSWORD
bash "$script_directory/backup-supabase.sh" | tee "$scratch/export-receipt.txt"
unset PGPASSWORD
stamp=$(sed -nE 's/^Verified offsite MaintFlow backup for project tkofnsyqywhixuotbiet at ([0-9]{8}T[0-9]{6}Z)$/\1/p' "$scratch/export-receipt.txt")
[[ $stamp =~ ^[0-9]{8}T[0-9]{6}Z$ ]]
printf 'PASS\nmaintflow-tkofnsyqywhixuotbiet-%s.tar.gz.age\n' "$stamp" > "$state/last-scheduled-export"
