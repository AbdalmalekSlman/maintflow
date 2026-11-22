import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import tarfile
import tempfile
import time
import warnings
from urllib.request import build_opener, HTTPRedirectHandler, ProxyHandler


SHA = re.compile(r"[a-f0-9]{40}")
DIGEST = re.compile(r"[a-f0-9]{64}")
PROJECT = re.compile(r"[a-z0-9]{20}")
PRIVATE = re.compile(r"^\.env(?:\.|$)|^(?:\.npmrc|id_rsa|id_ed25519)$|\.(?:pem|key|p12|pfx|db|sqlite3?)$", re.I)
PRIVATE_MARKERS = re.compile(rb"sb_secret_[a-zA-Z0-9_-]{24,}|gh[pousr]_[a-zA-Z0-9_]{24,}|github_pat_[a-zA-Z0-9_]{24,}|-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----\s+[-+/=a-zA-Z0-9]{32,}")
JWT = re.compile(rb"\beyJ[a-zA-Z0-9_-]{8,}\.(eyJ[a-zA-Z0-9_-]{8,})\.[a-zA-Z0-9_-]{16,}\b")
STAGING_PROJECT = "dmrmqrtjmpeyoekicctp"
NONPRODUCTION_PROJECTS = {"dmrmqrtjmpeyoekicctp", "nufovhdkroobbwqxiszt"}
DEPLOY_REF = "refs/remotes/origin/deploy"
PRODUCTION_UNIT = "maintflow.service"
CANDIDATE_UNIT = "maintflow-candidate.service"
CCPS_REMOTE = "git@github.com:AbdalmalekSlman/CCPs-INST.git"
PROJECT_FILE = Path("/etc/maintflow/production-project")
TRUSTED_ROOT = Path("/etc/maintflow/trusted_root.jsonl")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def project_url(project):
    require(PROJECT.fullmatch(project) and project not in NONPRODUCTION_PROJECTS, "Invalid production Supabase project reference")
    return f"https://{project}.supabase.co"


def read_root_owned_text(path, limit):
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK), "r", encoding="ascii") as stream:
        info = os.fstat(stream.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o222,
                "Production trust configuration must be a root-owned read-only file")
        require(0 < info.st_size <= limit, "Invalid production trust configuration size")
        return stream.read(limit)


def read_production_project(path):
    project = read_root_owned_text(path, 128).strip()
    project_url(project)
    return project


def checksum(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def verify_provenance(archive, bundle):
    read_root_owned_text(TRUSTED_ROOT, 2 * 1024**2)
    result = subprocess.check_output([
        "/usr/bin/gh", "attestation", "verify", str(archive),
        "--repo", "AbdalmalekSlman/CCPs-INST", "--bundle", str(bundle),
        "--custom-trusted-root", str(TRUSTED_ROOT),
        "--signer-workflow", "AbdalmalekSlman/CCPs-INST/.github/workflows/maintflow-publish.yml",
        "--source-ref", "refs/heads/maintflow-release-control", "--deny-self-hosted-runners",
        "--format", "json", "--jq", ".[].verificationResult.signature.certificate.sourceRepositoryIdentifier",
    ], text=True, timeout=30)
    identities = result.splitlines()
    require(identities and all(value.strip().strip('"') == "1454977197" for value in identities),
            "Attestation was not signed by the original CCPs-INST repository")


def validate_metadata(metadata, source, url, target="production"):
    require(SHA.fullmatch(source) and metadata.get("revision") == source, "Unexpected MaintFlow source SHA")
    require(metadata.get("target") == target and metadata.get("supabaseUrl") == url,
            "Artifact does not match the approved target and Supabase project")
    require(metadata.get("platform") == "linux" and metadata.get("arch") == "x64" and
            str(metadata.get("node", "")).startswith("v24.") and
            DIGEST.fullmatch(str(metadata.get("publicKeySha256") or "")), "Invalid artifact runtime metadata")


def verify_runtime(release, project, rehearsal=False):
    metadata = json.loads((release / "release.json").read_text(encoding="utf-8"))
    url = f"https://{STAGING_PROJECT}.supabase.co" if rehearsal else project_url(project)
    validate_metadata(metadata, metadata.get("revision") or "", url, "staging" if rehearsal else "production")
    if not rehearsal:
        health_marker(release)
    require(os.environ.get("NEXT_PUBLIC_SUPABASE_URL") == url, "Runtime Supabase project does not match the approved target")
    key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
    require(key and hashlib.sha256(key.encode()).hexdigest() == metadata["publicKeySha256"],
            "Runtime public client key does not match the artifact")
    for name in ("SUPABASE_SERVICE_ROLE_KEY", "AUTH_RATE_LIMIT_SECRET"):
        require(os.environ.get(name), f"Missing runtime configuration: {name}")
    origin = "http://localhost:18100" if rehearsal else "https://ccp-inst.duckdns.org"
    require(os.environ.get("AUTH_TRUSTED_ORIGIN") == origin, "Invalid trusted origin for target")


def audit_credentials(destination):
    import base64

    for path in destination.rglob("*"):
        if not path.is_file() or path.is_symlink():
            continue
        with path.open("rb") as stream:
            # Overlap chunks so a token crossing a read boundary is still checked.
            previous = b""
            for chunk in iter(lambda: stream.read(1 << 20), b""):
                data = previous + chunk
                require(not PRIVATE_MARKERS.search(data), "Archive includes a recognizable private credential")
                for match in JWT.finditer(data):
                    payload = match.group(1)
                    try:
                        claims = json.loads(base64.urlsafe_b64decode(payload + b"=" * (-len(payload) % 4)))
                    except (ValueError, UnicodeError):
                        continue
                    require(not isinstance(claims, dict) or claims.get("role") != "service_role",
                            "Archive includes a Supabase service-role JWT")
                previous = data[-4096:]


def unpack(archive, destination):
    require(not destination.is_symlink() and (not destination.exists() or
            (destination.is_dir() and not any(destination.iterdir()))), "Extraction directory must be empty")
    with tarfile.open(archive, "r:gz") as package:
        members = package.getmembers()
        require(len(members) < 40000 and sum(member.size for member in members) <= 512 * 1024**2,
                "Archive exceeds extraction limits")
        for member in members:
            path = PurePosixPath(member.name)
            require(not path.is_absolute() and ".." not in path.parts and not any(PRIVATE.search(part) for part in path.parts),
                    "Archive contains a disallowed path")
            require(member.isfile() or member.isdir(), "Archive links and special files are forbidden")
            member.mode = 0o755 if member.isdir() else (0o755 if member.mode & 0o100 else 0o644)
        package.extractall(destination, members=members, filter="data")

    for path in ("server.js", "release.json", "public/file.svg", "node_modules/next/package.json"):
        require((destination / path).is_file(), f"Release missing {path}")
    require(any((destination / ".next/static").rglob("*.js")), "Release missing Next.js static assets")
    audit_credentials(destination)


def switch_current(root, release, name="current"):
    with tempfile.TemporaryDirectory(dir=root, prefix=".switch-") as temporary:
        replacement = Path(temporary) / "current"
        replacement.symlink_to(release, target_is_directory=True)
        os.replace(replacement, root / name)


def service(action, unit):
    allowed = {("start", CANDIDATE_UNIT), ("stop", CANDIDATE_UNIT), ("restart", PRODUCTION_UNIT)}
    if action == "is-active" and unit in (PRODUCTION_UNIT, CANDIDATE_UNIT):
        command = ["/usr/bin/systemctl", action, unit]
    else:
        require((action, unit) in allowed, "Unsupported service command")
        command = ["/usr/bin/sudo", "-n", "/usr/bin/systemctl", action, unit]
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL)


def has_candidate_headroom():
    current = subprocess.check_output(["systemctl", "show", PRODUCTION_UNIT, "-p", "MemoryCurrent", "--value"], text=True).strip()
    return current.isdecimal() and int(current) <= 450_000_000


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def health_marker(release):
    meta = json.loads((release / "release.json").read_text(encoding="utf-8"))
    revision = meta.get("revision") or ""
    require(SHA.fullmatch(revision), "Invalid release health revision")
    require((release / "public/maintflow-revision.txt").read_text(encoding="ascii").strip() == revision,
            "Release health marker does not match metadata")
    return revision


def check_health(port, unit, revision):
    opener = build_opener(ProxyHandler({}), NoRedirects())
    for attempt in range(20):
        try:
            service("is-active", unit)
            with opener.open(f"http://127.0.0.1:{port}/maintflow-revision.txt", timeout=2) as response:
                if response.read(128).strip() != revision.encode():
                    raise OSError("Listener is not serving the expected MaintFlow release")
            for path in ("/", "/file.svg"):
                with opener.open(f"http://127.0.0.1:{port}{path}", timeout=2) as response:
                    if response.status != 200 or not response.read(1):
                        raise OSError("Empty or unhealthy response")
            return
        except (OSError, subprocess.CalledProcessError):
            if attempt == 19:
                raise
            time.sleep(1)


def record_and_prune(root, release, previous):
    releases = root / "releases"
    history = root / "activation-history.json"
    try:
        order = json.loads(history.read_text(encoding="utf-8")) if history.exists() else []
        require(isinstance(order, list) and all(isinstance(name, str) and SHA.fullmatch(name) for name in order),
                "Invalid release history")
    except (OSError, ValueError):
        warnings.warn("Invalid release history; cleanup skipped", stacklevel=2)
        return
    order = list(dict.fromkeys([release.name, previous.name, *order]))
    with tempfile.TemporaryDirectory(dir=root, prefix=".history-") as directory:
        pending = Path(directory) / "history"
        pending.write_text(json.dumps(order), encoding="utf-8")
        os.replace(pending, history)
    good = []
    for name in order:
        path = releases / name
        if path.is_symlink() or not path.is_dir() or path.resolve().parent != releases.resolve():
            continue
        try:
            health_marker(path)
        except (OSError, ValueError):
            continue
        good.append(path)
    protected = {(root / name).resolve() for name in ("current", "candidate")}
    protected.update((release.resolve(), previous.resolve(), *good[:3]))
    if not shutil.rmtree.avoids_symlink_attacks:
        return
    for path in good[3:]:
        if path not in protected and not path.is_symlink():
            shutil.rmtree(path)


def activate(root, release):
    releases = (root / "releases").resolve(strict=True)
    current = root / "current"
    require(current.is_symlink(), "Initial cutover must be performed by the hosting provider")
    previous = current.resolve(strict=True)
    require(previous.parent == releases and (previous / "server.js").is_file(), "Existing MaintFlow release required")
    old_revision, new_revision = health_marker(previous), health_marker(release)
    check_health(8100, PRODUCTION_UNIT, old_revision)
    if previous == release:
        return
    require(has_candidate_headroom(), "Insufficient headroom for a second MaintFlow process")

    candidate = CANDIDATE_UNIT
    switch_current(root, release, name="candidate")
    try:
        service("start", candidate)
        check_health(18100, candidate, new_revision)
    finally:
        service("stop", candidate)

    switch_current(root, release)
    try:
        service("restart", PRODUCTION_UNIT)
        check_health(8100, PRODUCTION_UNIT, new_revision)
    except (OSError, ValueError, subprocess.CalledProcessError):
        switch_current(root, previous)
        service("restart", PRODUCTION_UNIT)
        check_health(8100, PRODUCTION_UNIT, old_revision)
        raise RuntimeError("New release failed; previous MaintFlow release restored") from None
    record_and_prune(root, release, previous)


def install(root, repo, project, prepare_only):
    import fcntl

    require(os.geteuid() != 0, "Run release installation as the dedicated deployment user")
    url = project_url(project)
    releases = (root / "releases").resolve(strict=True)
    require(releases == root.resolve() / "releases" and releases.stat().st_uid == os.geteuid(),
            "Expected a deployment-owned, non-symlink releases directory")
    git = ["git", "-C", str(repo)]

    def git_output(*args):
        return subprocess.check_output([*git, *args])

    with (root / ".deploy.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        subprocess.run([*git, "fetch", "--no-tags", CCPS_REMOTE, f"refs/heads/deploy:{DEPLOY_REF}"], check=True)
        commit = git_output("rev-parse", DEPLOY_REF).decode().strip()
        require(SHA.fullmatch(commit), "Invalid deploy tip")
        release = releases / commit
        require(not release.is_symlink(), "Release directory must not be a symlink")
        expected = git_output("show", f"{commit}:SHA256SUMS").decode().strip()
        require(re.fullmatch(r"[a-f0-9]{64}  maintflow\.tar\.gz", expected), "Malformed release checksum")
        metadata = json.loads(git_output("show", f"{commit}:release.json"))
        validate_metadata(metadata, metadata.get("revision") or "", url)

        if not release.exists():
            size = int(git_output("cat-file", "-s", f"{commit}:maintflow.tar.gz"))
            require(0 < size <= 95 * 1024**2, "Archive exceeds Git release size limit")
            bundle_size = int(git_output("cat-file", "-s", f"{commit}:provenance.jsonl"))
            require(0 < bundle_size <= 200_000, "Missing or invalid provenance bundle")
            with tempfile.TemporaryDirectory(dir=releases, prefix=".install-") as temporary:
                temporary = Path(temporary)
                archive = temporary / "maintflow.tar.gz"
                with archive.open("wb") as stream:
                    subprocess.run([*git, "show", f"{commit}:maintflow.tar.gz"], stdout=stream, check=True)
                require(checksum(archive) == expected.split()[0], "Archive checksum mismatch")
                bundle = temporary / "provenance.jsonl"
                bundle.write_bytes(git_output("show", f"{commit}:provenance.jsonl"))
                verify_provenance(archive, bundle)
                extracted = temporary / "package"
                extracted.mkdir(mode=0o755)
                unpack(archive, extracted)
                require(json.loads((extracted / "release.json").read_text(encoding="utf-8")) == metadata,
                        "Artifact and Git metadata differ")
                cache = extracted / ".next/cache"
                require(not cache.is_symlink(), "Cache path must be a directory")
                cache.mkdir(mode=0o750, exist_ok=True)
                import grp

                group = grp.getgrnam("maintflow-cache").gr_gid
                os.chown(cache, -1, group)
                cache.chmod(0o2770)
                health_marker(extracted)
                extracted.rename(release)
        require(json.loads((release / "release.json").read_text(encoding="utf-8")) == metadata,
                "Installed release metadata differs from approved Git metadata")
        if not prepare_only:
            activate(root, release)
        print(f"Verified MaintFlow release {commit}")


def main():
    parser = argparse.ArgumentParser(description="Prepare or activate a provider-approved MaintFlow Git release")
    parser.add_argument("--root", type=Path, default=Path("/srv/maintflow"))
    parser.add_argument("--repo", type=Path)
    parser.add_argument("--project-config", type=Path, default=PROJECT_FILE)
    parser.add_argument("--prepare-only", action="store_true")
    parser.add_argument("--verify-runtime", type=Path)
    parser.add_argument("--verify-rehearsal", type=Path)
    args = parser.parse_args()
    if args.verify_rehearsal:
        verify_runtime(args.verify_rehearsal, STAGING_PROJECT, rehearsal=True)
        return
    project = read_production_project(args.project_config)
    if args.verify_runtime:
        verify_runtime(args.verify_runtime, project)
    elif args.repo:
        install(args.root, args.repo, project, args.prepare_only)
    else:
        parser.error("--repo is required for installation")


if __name__ == "__main__":
    main()
