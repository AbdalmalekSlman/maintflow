import argparse
import json
from pathlib import Path
import subprocess
import tempfile

from deploy_release import checksum, project_url, require, unpack, validate_metadata


BRANCH = "refs/heads/deploy"
FILES = ("maintflow.tar.gz", "SHA256SUMS", "release.json")


def publish(repo, package, source, production_project):
    def git(*args, data=None):
        return subprocess.check_output(["git", "-C", str(repo), *args], input=data).decode().strip()

    require({path.name for path in package.iterdir()} == set(FILES), "Unexpected publishable files")
    archive = package / "maintflow.tar.gz"
    require(0 < archive.stat().st_size <= 95 * 1024**2, "Archive exceeds Git release limit")
    require((package / "SHA256SUMS").read_text(encoding="utf-8").strip() == f"{checksum(archive)}  {archive.name}",
            "Artifact checksum mismatch")
    metadata = json.loads((package / "release.json").read_text(encoding="utf-8"))
    validate_metadata(metadata, source, project_url(production_project))
    with tempfile.TemporaryDirectory() as temporary:
        extracted = Path(temporary)
        unpack(archive, extracted)
        require(json.loads((extracted / "release.json").read_text(encoding="utf-8")) == metadata,
                "Artifact and Git metadata differ")

    tree_entries = []
    for name in FILES:
        oid = git("hash-object", "-w", str((package / name).resolve()))
        tree_entries.append(f"100644 blob {oid}\t{name}\0")
    tree = git("mktree", "-z", data="".join(tree_entries).encode())
    parent = git("ls-remote", "origin", BRANCH).split()
    parent_args = []
    if parent:
        git("fetch", "--no-tags", "origin", BRANCH)
        previous = git("rev-parse", "FETCH_HEAD")
        if git("rev-parse", f"{previous}^{{tree}}") == tree:
            return previous
        parent_args = ["-p", previous]

    commit = git("-c", "user.name=github-actions[bot]", "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com",
                 "commit-tree", tree, *parent_args, "-m", f"MaintFlow standalone release {source}")
    git("push", "origin", f"{commit}:{BRANCH}")
    return commit


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("repository", type=Path)
    parser.add_argument("package", type=Path)
    parser.add_argument("source_sha")
    parser.add_argument("production_project")
    args = parser.parse_args()
    commit = publish(args.repository, args.package, args.source_sha, args.production_project)
    print(f"Published deploy commit {commit}")
