import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
from urllib.request import urlopen

from deploy_release import checksum, health_marker, project_url, require, unpack, validate_metadata


BRANCH = "refs/heads/deploy"
FILES = ("maintflow.tar.gz", "SHA256SUMS", "release.json", "provenance.jsonl")


def verify_review(reviews):
    require(isinstance(reviews, list) and any(
        review.get("state") == "approved" and review.get("user", {}).get("id") == 114194821
        and any(env.get("name") == "maintflow-publish-production" for env in review.get("environments", []))
        for review in reviews
    ), "This run has no recorded owner approval for production publication")


def verify_workflow_review():
    run = os.environ.get("GITHUB_RUN_ID", "")
    require(run.isdecimal() and os.environ.get("GITHUB_RUN_ATTEMPT") == "1"
            and os.environ.get("GITHUB_REPOSITORY", "").lower() == "abdalmalekslman/ccps-inst"
            and os.environ.get("GITHUB_REF") == "refs/heads/maintflow-release-control",
            "Production publication requires a new control-branch release request")
    with urlopen(f"https://api.github.com/repos/AbdalmalekSlman/CCPs-INST/actions/runs/{run}/approvals", timeout=15) as response:
        verify_review(json.load(response))


def publish(repo, package, source, production_project):
    def git(*args, data=None):
        return subprocess.check_output(["git", "-C", str(repo), *args], input=data).decode().strip()

    require({path.name for path in package.iterdir()} == set(FILES), "Unexpected publishable files")
    archive = package / "maintflow.tar.gz"
    require(0 < (package / "provenance.jsonl").stat().st_size <= 200_000, "Missing or invalid provenance bundle")
    require(0 < archive.stat().st_size <= 95 * 1024**2, "Archive exceeds Git release limit")
    require((package / "SHA256SUMS").read_text(encoding="utf-8").strip() == f"{checksum(archive)}  {archive.name}",
            "Artifact checksum mismatch")
    metadata = json.loads((package / "release.json").read_text(encoding="utf-8"))
    validate_metadata(metadata, source, project_url(production_project))
    with tempfile.TemporaryDirectory() as temporary:
        extracted = Path(temporary)
        unpack(archive, extracted)
        health_marker(extracted)
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
    verify_workflow_review()
    commit = publish(args.repository, args.package, args.source_sha, args.production_project)
    print(f"Published deploy commit {commit}")
