import argparse
import json
from pathlib import Path
import subprocess
import tempfile

from deploy_release import STAGING_PROJECT, checksum, require, unpack, validate_metadata


def prepare(archive, digest_file, output):
    output = output.resolve()
    require(not output.exists(), "Rehearsal bundle output already exists")
    require(0 < archive.stat().st_size <= 95 * 1024**2, "Staging archive exceeds Git file limit")
    digest = checksum(archive)
    require(digest_file.read_text(encoding="ascii").strip() == f"{digest}  {archive.name}", "Staging checksum mismatch")

    with tempfile.TemporaryDirectory(dir=output.parent, prefix="r-") as directory:
        root = Path(directory)
        extracted = root / "x"
        unpack(archive, extracted)
        record = json.loads((extracted / "release.json").read_text(encoding="utf-8"))
        validate_metadata(record, record.get("revision") or "", f"https://{STAGING_PROJECT}.supabase.co", "staging")
        digest_path = root / "SHA256SUMS"
        digest_path.write_text(f"{digest}  maintflow.tar.gz\n", encoding="ascii")

        def git(*args, data=None):
            return subprocess.check_output(["git", "-C", str(root), *args], input=data).decode().strip()

        git("init", "--bare")
        entries = {"maintflow.tar.gz": archive.resolve(), "SHA256SUMS": digest_path.resolve(),
                   "release.json": (extracted / "release.json").resolve()}
        tree = git("mktree", "-z", data="".join(
            f"100644 blob {git('hash-object', '-w', str(path))}\t{name}\0" for name, path in entries.items()).encode())
        commit = git("-c", "user.name=MaintFlow Rehearsal", "-c", "user.email=maintflow-rehearsal@example.invalid",
                     "commit-tree", tree, "-m", f"Staging rehearsal from {record['revision']}")
        branch = "refs/heads/maintflow-rehearsal"
        git("update-ref", branch, commit)
        git("bundle", "create", str(output), branch)
        return commit


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create a local-only staging rehearsal Git bundle")
    parser.add_argument("archive", type=Path)
    parser.add_argument("checksum", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    print(f"Prepared local rehearsal commit {prepare(args.archive, args.checksum, args.output)}")
