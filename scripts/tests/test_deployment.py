"""Exercise release switching with fake services; no live server is contacted."""
import hashlib
import io
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tarfile
from uuid import uuid4

import pytest

pytestmark = pytest.mark.skipif(sys.platform == "win32", reason="Linux deployment integration test")
SCRIPT = Path(__file__).resolve().parents[1] / "deploy-release.sh"
SHA = "a" * 40


def executable(path, source):
    path.write_text("#!/usr/bin/env bash\nset -eu\n" + source)
    path.chmod(0o755)


@pytest.fixture
def host(tmp_path):
    releases = tmp_path / "releases"
    shared = tmp_path / "shared"
    old = releases / "old"
    old.mkdir(parents=True)
    (old / "REVISION").write_text("old")
    current = tmp_path / "current"
    current.symlink_to(old, target_is_directory=True)
    for name in ("uploads", "runtime", "static"):
        (shared / name).mkdir(parents=True)
    (shared / "server.env").touch()
    config = tmp_path / "deploy.conf"
    config.write_text("\n".join(f"{k}={shlex.quote(str(v))}" for k, v in {
        "PROVISIONED": "yes", "RELEASE_ROOT": releases, "SHARED_ROOT": shared,
        "CURRENT_LINK": current, "BACKEND_SERVICE": "test-backend",
        "HEALTH_URL": "http://backend/health", "PUBLIC_URL": "https://test.invalid",
    }.items()))
    binaries = tmp_path / "bin"
    binaries.mkdir()
    executable(binaries / "systemctl", '''
if [[ "$*" == *WorkingDirectory* ]]; then echo "$TEST_CURRENT/server"
elif [[ "$*" == *ExecStart* ]]; then echo "$TEST_CURRENT/server/.venv/bin/uvicorn"
else echo "systemctl $*" >> "$TEST_LOG"; fi
''')
    executable(binaries / "sudo", '''
[[ "$1" == -n ]] && shift
exec "$@"
''')
    executable(binaries / "nginx", 'echo "nginx $*" >> "$TEST_LOG"\n')
    executable(binaries / "sleep", ':\n')
    executable(binaries / "curl", '''
if [[ "${TEST_FAIL:-}" == health && "$(cat "$TEST_CURRENT/REVISION")" != old ]]; then exit 1; fi
''')
    executable(binaries / "python3", '''
mkdir -p "$3/bin"
cat > "$3/bin/python" <<'PYTHON'
#!/usr/bin/env bash
set -eu
if [[ "$*" == *'pip install'* ]]; then
  echo install >> "$TEST_LOG"
  [[ "${TEST_FAIL:-}" != install ]]
elif [[ "$1" == *backup-database.py ]]; then
  echo backup >> "$TEST_LOG"
  [[ "${TEST_FAIL:-}" != backup ]]
  echo backup > "$2"
elif [[ "$*" == *'alembic upgrade'* ]]; then
  echo migrate >> "$TEST_LOG"
  [[ "${TEST_FAIL:-}" != migrate ]]
fi
PYTHON
chmod +x "$3/bin/python"
''')
    env = os.environ | {
        "PATH": str(binaries) + os.pathsep + os.environ["PATH"],
        "SALITEMIHRET_DEPLOY_CONFIG": str(config), "TEST_CURRENT": str(current),
        "TEST_LOG": str(tmp_path / "events"),
    }
    return env, current, old, config


def run_release(host, failure="", corrupt=False):
    env, current, old, config = host
    env = env | {"TEST_FAIL": failure}
    archive = Path("/tmp") / f"salitemihret-release.{uuid4().hex}.tar.gz"
    try:
        with tarfile.open(archive, "w:gz") as tar:
            for name, data in {
                "REVISION": SHA.encode(), "frontend/dist/index.html": b"built",
                "server/requirements.txt": b"", "scripts/backup-database.py": b"",
            }.items():
                entry = tarfile.TarInfo(name)
                entry.size = len(data)
                tar.addfile(entry, io.BytesIO(data))
        checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
        result = subprocess.run(
            ["bash", str(SCRIPT), SHA, str(archive), "0" * 64 if corrupt else checksum],
            env=env, text=True, capture_output=True, timeout=15,
        )
        return result
    finally:
        archive.unlink(missing_ok=True)


def test_success_switches_after_backup_and_migration(host):
    result = run_release(host)
    assert result.returncode == 0, result.stderr
    env, current, old, _ = host
    assert current.resolve() != old
    assert (current / "REVISION").read_text() == SHA
    events = Path(env["TEST_LOG"]).read_text()
    assert events.index("backup") < events.index("migrate") < events.index("systemctl restart")
    assert (current / "server/uploads").is_symlink()
    assert current.resolve().stat().st_mode & 0o001
    assert (current / "frontend/dist/index.html").stat().st_mode & 0o004


@pytest.mark.parametrize("failure", ["install", "backup", "migrate"])
def test_pre_activation_failure_preserves_live_release(host, failure):
    result = run_release(host, failure)
    assert result.returncode != 0
    env, current, old, _ = host
    assert current.resolve() == old
    assert "systemctl restart" not in Path(env["TEST_LOG"]).read_text()


def test_failed_health_check_restores_application_release(host):
    result = run_release(host, "health")
    assert result.returncode != 0
    assert host[1].resolve() == host[2]
    assert "Database migrations were not reversed" in result.stderr


def test_corrupt_archive_does_not_change_live_release(host):
    result = run_release(host, corrupt=True)
    assert result.returncode != 0
    assert host[1].resolve() == host[2]


def test_unprovisioned_host_is_refused(host):
    config = host[3]
    config.write_text(config.read_text().replace("PROVISIONED=yes", "PROVISIONED=no"))
    result = run_release(host)
    assert result.returncode != 0
    assert host[1].resolve() == host[2]
