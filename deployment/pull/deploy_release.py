import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile
import tempfile
import time
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


def require(condition, message):
    if not condition:
        raise ValueError(message)


def project_url(project):
    require(PROJECT.fullmatch(project) and project not in NONPRODUCTION_PROJECTS, "Invalid production Supabase project reference")
    return f"https://{project}.supabase.co"


def checksum(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


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
    with tarfile.open(archive, "r:gz") as package:
        members = package.getmembers()
        require(len(members) < 40000 and sum(member.size for member in members) <= 512 * 1024**2,
                "Archive exceeds extraction limits")
        for member in members:
            path = PurePosixPath(member.name)
            require(not path.is_absolute() and ".." not in path.parts and not any(PRIVATE.search(part) for part in path.parts),
                    "Archive contains a disallowed path")
            require(member.isfile() or member.isdir() or member.issym() or member.islnk(), "Unsupported archive entry")
            if member.issym() or member.islnk():
                require(not any(PRIVATE.search(part) for part in PurePosixPath(member.linkname).parts), "Disallowed link target")
        package.extractall(destination, members=members, filter="data")

    for path in ("server.js", "release.json", "public/file.svg", "node_modules/next/package.json"):
        require((destination / path).is_file(), f"Release missing {path}")
    require(any((destination / ".next/static").rglob("*.js")), "Release missing Next.js static assets")
    audit_credentials(destination)


def switch_current(root, release):
    with tempfile.TemporaryDirectory(dir=root, prefix=".switch-") as temporary:
        replacement = Path(temporary) / "current"
        replacement.symlink_to(release, target_is_directory=True)
        os.replace(replacement, root / "current")


def service(action, unit):
    subprocess.run(["systemctl", action, unit], check=True, stdout=subprocess.DEVNULL)


def has_candidate_headroom():
    current = subprocess.check_output(["systemctl", "show", PRODUCTION_UNIT, "-p", "MemoryCurrent", "--value"], text=True).strip()
    return current.isdecimal() and int(current) <= 450_000_000


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def check_health(port, unit):
    opener = build_opener(ProxyHandler({}), NoRedirects())
    for attempt in range(20):
        try:
            pid = subprocess.check_output(["systemctl", "show", unit, "-p", "MainPID", "--value"], text=True).strip()
            sockets = subprocess.check_output(["ss", "-Hltnp", f"sport = :{port}"], text=True)
            if not pid.isdecimal() or pid == "0" or not any(
                f"127.0.0.1:{port}" in line.split() and re.search(rf"\bpid={pid}(?:,|\))", line)
                for line in sockets.splitlines()
            ):
                raise OSError("The expected MaintFlow service does not own its loopback port")
            for path in ("/", "/file.svg"):
                with opener.open(f"http://127.0.0.1:{port}{path}", timeout=2) as response:
                    require(response.status == 200 and response.read(1), "Empty or unhealthy response")
            return
        except OSError:
            if attempt == 19:
                raise
            time.sleep(1)


def activate(root, release, commit):
    releases = (root / "releases").resolve(strict=True)
    current = root / "current"
    require(current.is_symlink(), "Initial cutover must be performed by the hosting provider")
    previous = current.resolve(strict=True)
    require(previous.parent == releases and (previous / "server.js").is_file(), "Existing MaintFlow release required")
    service("is-active", PRODUCTION_UNIT)
    check_health(8100, PRODUCTION_UNIT)
    if previous == release:
        return
    require(has_candidate_headroom(), "Insufficient headroom for a second MaintFlow process")

    candidate = f"maintflow-candidate@{commit}.service"
    try:
        service("start", candidate)
        check_health(18100, candidate)
    finally:
        service("stop", candidate)

    switch_current(root, release)
    try:
        service("restart", PRODUCTION_UNIT)
        check_health(8100, PRODUCTION_UNIT)
    except (OSError, ValueError, subprocess.CalledProcessError):
        switch_current(root, previous)
        service("restart", PRODUCTION_UNIT)
        check_health(8100, PRODUCTION_UNIT)
        raise RuntimeError("New release failed; previous MaintFlow release restored") from None


def install(root, repo, fetch_user, approval, prepare_only):
    import fcntl
    import pwd

    commit, source, project = (approval[field] for field in ("deployCommit", "sourceSha", "productionProjectRef"))
    require(SHA.fullmatch(commit) and SHA.fullmatch(source), "Approval must contain full Git SHAs")
    url = project_url(project)
    releases = (root / "releases").resolve(strict=True)
    release = releases / commit
    git = ["runuser", "-u", fetch_user, "--", "git", "-C", str(repo)]

    def git_output(*args):
        return subprocess.check_output([*git, *args])

    with (root / ".deploy.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        subprocess.run([*git, "fetch", "--no-tags", "origin", f"refs/heads/deploy:{DEPLOY_REF}"], check=True)
        require(git_output("rev-parse", DEPLOY_REF).decode().strip() == commit, "Deploy tip does not match the approved commit")
        expected = git_output("show", f"{commit}:SHA256SUMS").decode().strip()
        require(re.fullmatch(r"[a-f0-9]{64}  maintflow\.tar\.gz", expected), "Malformed release checksum")
        metadata = json.loads(git_output("show", f"{commit}:release.json"))
        validate_metadata(metadata, source, url)

        if not release.exists():
            size = int(git_output("cat-file", "-s", f"{commit}:maintflow.tar.gz"))
            require(0 < size <= 95 * 1024**2, "Archive exceeds Git release size limit")
            with tempfile.TemporaryDirectory(dir=releases, prefix=".install-") as temporary:
                temporary = Path(temporary)
                archive = temporary / "maintflow.tar.gz"
                with archive.open("wb") as stream:
                    subprocess.run([*git, "show", f"{commit}:maintflow.tar.gz"], stdout=stream, check=True)
                require(checksum(archive) == expected.split()[0], "Archive checksum mismatch")
                extracted = temporary / "package"
                extracted.mkdir(mode=0o755)
                unpack(archive, extracted)
                require(json.loads((extracted / "release.json").read_text(encoding="utf-8")) == metadata,
                        "Artifact and Git metadata differ")
                cache = extracted / ".next/cache"
                require(not cache.is_symlink(), "Cache path must be a directory")
                cache.mkdir(mode=0o750, exist_ok=True)
                account = pwd.getpwnam("maintflow")
                os.chown(cache, account.pw_uid, account.pw_gid)
                cache.chmod(0o750)
                extracted.rename(release)
        require(json.loads((release / "release.json").read_text(encoding="utf-8")) == metadata,
                "Installed release metadata differs from approved Git metadata")
        if not prepare_only:
            activate(root, release, commit)
        print(f"Verified MaintFlow release {commit}")


def main():
    parser = argparse.ArgumentParser(description="Prepare or activate a provider-approved MaintFlow Git release")
    parser.add_argument("--root", type=Path, default=Path("/srv/maintflow"))
    parser.add_argument("--repo", type=Path)
    parser.add_argument("--fetch-user")
    parser.add_argument("--approval", type=Path, default=Path("/etc/maintflow/approval.json"))
    parser.add_argument("--prepare-only", action="store_true")
    parser.add_argument("--verify-runtime", type=Path)
    parser.add_argument("--verify-rehearsal", type=Path)
    args = parser.parse_args()
    if args.verify_rehearsal:
        verify_runtime(args.verify_rehearsal, STAGING_PROJECT, rehearsal=True)
        return
    approval = json.loads(args.approval.read_text(encoding="utf-8"))
    if args.verify_runtime:
        verify_runtime(args.verify_runtime, approval["productionProjectRef"])
    elif args.repo and args.fetch_user:
        install(args.root, args.repo, args.fetch_user, approval, args.prepare_only)
    else:
        parser.error("--repo and --fetch-user are required for installation")


if __name__ == "__main__":
    main()
