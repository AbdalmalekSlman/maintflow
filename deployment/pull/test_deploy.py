import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile
import shutil
import tempfile
import unittest
from unittest.mock import patch

import deploy_release as deploy
from publish_deploy import publish, verify_review


SOURCE = "1" * 40
PROJECT = "p" * 20
URL = f"https://{PROJECT}.supabase.co"
KEY = "sb_publishable_deployment_test"


def metadata():
    return dict(revision=SOURCE, target="production", supabaseUrl=URL, platform="linux", arch="x64",
                node="v24.0.0", publicKeySha256=hashlib.sha256(KEY.encode()).hexdigest())


def archive(path, extra=None):
    entries = {"server.js": "// fixture", "release.json": json.dumps(metadata()), "public/file.svg": "<svg/>", "public/maintflow-revision.txt": SOURCE,
               "node_modules/next/package.json": "{}", ".next/static/test.js": "// fixture"}
    with tarfile.open(path, "w:gz") as package:
        for name, value in (entries | (extra or {})).items():
            data = value.encode()
            entry = tarfile.TarInfo(name)
            entry.size = len(data)
            package.addfile(entry, io.BytesIO(data))


class DeploymentTests(unittest.TestCase):
    def test_extraction_checks_static_files_and_rejects_secrets_and_traversal(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            package = root / "maintflow.tar.gz"
            archive(package)
            destination = root / "valid"
            deploy.unpack(package, destination)
            self.assertTrue((destination / ".next/static/test.js").is_file())
            for name in (".env.production", "../escape", "nested/private.pem"):
                with self.subTest(name=name):
                    archive(package, {name: "fixture"})
                    with self.assertRaisesRegex(ValueError, "disallowed path"):
                        deploy.unpack(package, root / "invalid")
            archive(package, {"embedded.txt": "sb_" + "secret_" + "Z" * 32})
            with self.assertRaisesRegex(ValueError, "private credential"):
                deploy.unpack(package, root / "embedded")

    def test_runtime_ref_and_key_match_release(self):
        with tempfile.TemporaryDirectory() as tmp:
            release = Path(tmp)
            (release / "release.json").write_text(json.dumps(metadata()), encoding="utf-8")
            (release / "public").mkdir()
            (release / "public/maintflow-revision.txt").write_text(SOURCE, encoding="ascii")
            env = dict(NEXT_PUBLIC_SUPABASE_URL=URL, NEXT_PUBLIC_SUPABASE_ANON_KEY=KEY,
                       SUPABASE_SERVICE_ROLE_KEY="fixture", AUTH_RATE_LIMIT_SECRET="fixture",
                       AUTH_TRUSTED_ORIGIN="https://ccp-inst.duckdns.org")
            with patch.dict(deploy.os.environ, env, clear=True):
                deploy.verify_runtime(release, PROJECT)
                with self.assertRaisesRegex(ValueError, "Invalid production"):
                    deploy.verify_runtime(release, "dmrmqrtjmpeyoekicctp")
                with patch.dict(deploy.os.environ, {"NEXT_PUBLIC_SUPABASE_ANON_KEY": "other"}):
                    with self.assertRaisesRegex(ValueError, "public client key"):
                        deploy.verify_runtime(release, PROJECT)

    def test_rehearsal_accepts_only_staging(self):
        with tempfile.TemporaryDirectory() as tmp:
            release = Path(tmp)
            url = f"https://{deploy.STAGING_PROJECT}.supabase.co"
            record = metadata() | {"target": "staging", "supabaseUrl": url}
            (release / "release.json").write_text(json.dumps(record), encoding="utf-8")
            env = dict(NEXT_PUBLIC_SUPABASE_URL=url, NEXT_PUBLIC_SUPABASE_ANON_KEY=KEY,
                       SUPABASE_SERVICE_ROLE_KEY="fixture", AUTH_RATE_LIMIT_SECRET="fixture",
                       AUTH_TRUSTED_ORIGIN="http://localhost:18100")
            with patch.dict(deploy.os.environ, env, clear=True):
                deploy.verify_runtime(release, deploy.STAGING_PROJECT, rehearsal=True)
                with self.assertRaisesRegex(ValueError, "approved target"):
                    deploy.verify_runtime(release, PROJECT)
                (release / "release.json").write_text(json.dumps(record | {"target": "smoke"}), encoding="utf-8")
                with self.assertRaisesRegex(ValueError, "approved target"):
                    deploy.verify_runtime(release, deploy.STAGING_PROJECT, rehearsal=True)

    def test_failed_candidate_leaves_current_intact(self):
        self.check_activation([None, OSError("candidate unavailable")], ["new"])

    def test_health_rejects_a_different_service_on_the_port(self):
        with patch.object(deploy, "service"), patch.object(deploy.time, "sleep"), \
                patch.object(deploy, "build_opener") as opener:
            opener.return_value.open.return_value.__enter__.return_value.read.return_value = b"unrelated portal"
            with self.assertRaisesRegex(OSError, "expected MaintFlow release"):
                deploy.check_health(18100, deploy.CANDIDATE_UNIT, SOURCE)

    def test_failed_activation_restores_current(self):
        self.check_activation([None, None, OSError("new release unavailable"), None], ["new", "new", "old"])

    def check_activation(self, health_outcomes, expected_links):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            current = root / "current"
            previous = root / "releases/old"
            new = root / "releases/new"
            previous.mkdir(parents=True)
            (previous / "server.js").touch()
            original_resolve = Path.resolve

            def resolve(path, **kwargs):
                return previous if path == current else original_resolve(path, **kwargs)

            with patch.object(Path, "is_symlink", autospec=True, side_effect=lambda path: path == current), \
                    patch.object(Path, "resolve", autospec=True, side_effect=resolve), \
                    patch.object(deploy, "service") as service, \
                    patch.object(deploy, "has_candidate_headroom", return_value=True), \
                    patch.object(deploy, "health_marker", return_value=SOURCE), \
                    patch.object(deploy, "switch_current") as switch, \
                    patch.object(deploy, "check_health", side_effect=health_outcomes):
                with self.assertRaises((OSError, RuntimeError)):
                    deploy.activate(root, new)
                self.assertEqual([call.args[1].name for call in switch.call_args_list], expected_links)
                self.assertIn(("stop", deploy.CANDIDATE_UNIT), [call.args for call in service.call_args_list])
                self.assertEqual([call.args[1] for call in service.call_args_list if call.args[0] == "restart"],
                                 ["maintflow.service"] * (len(expected_links) - 1))

    def test_owner_review_is_required_for_the_production_environment(self):
        approved = {"state": "approved", "user": {"id": 114194821},
                    "environments": [{"name": "maintflow-publish-production"}]}
        verify_review([approved])
        for review in ([], [approved | {"state": "rejected"}],
                       [approved | {"user": {"id": 1}}],
                       [approved | {"environments": [{"name": "staging"}]}]):
            with self.assertRaisesRegex(ValueError, "no recorded owner approval"):
                verify_review(review)

    def test_provenance_verifier_pins_workflow_and_repository(self):
        with patch.object(deploy, "read_root_owned_text"), \
                patch.object(deploy.subprocess, "check_output", return_value="1454977197\n") as verify:
            deploy.verify_provenance(Path("archive"), Path("bundle"))
            command = verify.call_args.args[0]
            self.assertIn("AbdalmalekSlman/CCPs-INST/.github/workflows/maintflow-publish.yml", command)
            self.assertIn("refs/heads/maintflow-release-control", command)
            self.assertIn("--deny-self-hosted-runners", command)
            verify.return_value = "1\n"
            with self.assertRaisesRegex(ValueError, "original CCPs-INST repository"):
                deploy.verify_provenance(Path("archive"), Path("bundle"))

    def test_retention_preserves_current_previous_two_and_unmanaged_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            releases = root / "releases"
            releases.mkdir()
            paths = [releases / (str(i) * 40) for i in range(1, 6)]
            for path in paths:
                path.mkdir()
            (releases / "unrelated").mkdir()
            (root / "activation-history.json").write_text(json.dumps([path.name for path in paths[1:]]))
            with patch.object(deploy, "health_marker", return_value=SOURCE), \
                    patch.object(shutil.rmtree, "avoids_symlink_attacks", True):
                deploy.record_and_prune(root, paths[0], paths[1])
            self.assertEqual(set(releases.iterdir()), {*paths[:3], releases / "unrelated"})

    def test_unprivileged_service_calls_are_exact(self):
        with patch.object(deploy.subprocess, "run") as run:
            deploy.service("restart", deploy.PRODUCTION_UNIT)
            self.assertEqual(run.call_args.args[0], ["/usr/bin/sudo", "-n", "/usr/bin/systemctl", "restart", "maintflow.service"])
            with self.assertRaisesRegex(ValueError, "Unsupported"):
                deploy.service("restart", "ot_tracker.service")
            self.assertEqual(run.call_count, 1)

    def test_archive_links_are_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            package = root / "link.tar.gz"
            for link_type in (tarfile.SYMTYPE, tarfile.LNKTYPE):
                with tarfile.open(package, "w:gz") as tar:
                    link = tarfile.TarInfo("public/link")
                    link.type = link_type
                    link.linkname = "/opt/ot_tracker"
                    tar.addfile(link)
                with self.assertRaisesRegex(ValueError, "Archive links"):
                    deploy.unpack(package, root / "destination")

    def test_systemd_caps_and_portal_isolation(self):
        folder = Path(__file__).parent
        limits = {
            "maintflow.service": "700000000",
            "maintflow-candidate.service": "200000000",
            "maintflow-rehearsal.service": "700000000",
            "maintflow-updater.service": "700000000",
        }
        for unit, memory_limit in limits.items():
            with self.subTest(unit=unit):
                lines = (folder / unit).read_text().splitlines()
                self.assertIn("CPUQuota=50%", lines)
                self.assertIn(f"MemoryMax={memory_limit}", lines)
                self.assertIn("InaccessiblePaths=/opt/ot_tracker /etc/ot_tracker.env /etc/ot_tracker_git", lines)
                self.assertTrue(any(line.startswith("ReadWritePaths=/srv/maintflow") for line in lines))
                self.assertTrue(any(line.startswith("User=maintflow") for line in lines))
                self.assertFalse(any(line.startswith("CPUAccounting=") for line in lines))
                self.assertEqual(
                    [line for line in lines if line.startswith("SuccessExitStatus=")],
                    [] if unit == "maintflow-updater.service" else ["SuccessExitStatus=143"],
                )

    def test_publish_is_fast_forward_and_only_changes_deploy(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            remote, checkout, package = (root / name for name in ("remote.git", "checkout", "package"))

            def git(*args):
                return subprocess.check_output(["git", *map(str, args)], text=True).strip()

            git("init", "--bare", remote)
            git("init", "-b", "main", checkout)
            git("-C", checkout, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-m", "Flask fixture")
            git("-C", checkout, "remote", "add", "origin", remote)
            git("-C", checkout, "push", "origin", "main")
            old = git("-C", remote, "rev-parse", "main")
            package.mkdir()
            (package / "provenance.jsonl").write_text("{}")
            (package / "release.json").write_text(json.dumps(metadata()), encoding="utf-8")
            tar = package / "maintflow.tar.gz"

            def refresh(extra=None):
                archive(tar, extra)
                (package / "SHA256SUMS").write_text(f"{deploy.checksum(tar)}  {tar.name}\n", encoding="utf-8")

            refresh()
            first = publish(checkout, package, SOURCE, PROJECT)
            self.assertEqual(publish(checkout, package, SOURCE, PROJECT), first)
            refresh({"public/new.txt": "new asset"})
            second = publish(checkout, package, SOURCE, PROJECT)
            self.assertEqual(git("-C", remote, "rev-parse", f"{second}^"), first)
            self.assertEqual(git("-C", remote, "rev-parse", "main"), old)
            self.assertEqual(set(git("-C", remote, "ls-tree", "--name-only", "deploy").splitlines()),
                             {"SHA256SUMS", "maintflow.tar.gz", "release.json", "provenance.jsonl"})
            tar.write_bytes(b"wrong digest")
            with self.assertRaisesRegex(ValueError, "checksum"):
                publish(checkout, package, SOURCE, PROJECT)
            self.assertEqual(git("-C", remote, "rev-parse", "deploy"), second)


if __name__ == "__main__":
    unittest.main()
