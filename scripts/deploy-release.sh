#!/usr/bin/env bash
# Called by GitHub Actions. Provision the release layout before enabling it.
set -Eeuo pipefail
umask 027
sha=${1:?Commit SHA required}
archive=${2:?Release archive required}
checksum=${3:?Archive checksum required}
[[ "$sha" =~ ^[0-9a-f]{40}$ && "$checksum" =~ ^[0-9a-f]{64}$ ]]
[[ "$archive" =~ ^/tmp/salitemihret-release\.[a-zA-Z0-9]+\.tar\.gz$ ]]
printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check --status

# This file is host configuration, not supplied by the release artifact.
source "${SALITEMIHRET_DEPLOY_CONFIG:-/etc/salitemihret/deploy.conf}"
: "${RELEASE_ROOT:?}"
: "${SHARED_ROOT:?}"
: "${CURRENT_LINK:?}"
: "${BACKEND_SERVICE:?}"
: "${HEALTH_URL:?}"
: "${PUBLIC_URL:?}"
[[ "${PROVISIONED:-}" == yes ]] || { echo 'Release layout has not been provisioned.'; exit 1; }
for path in "$RELEASE_ROOT" "$SHARED_ROOT" "$CURRENT_LINK"; do
  [[ "$path" == /* && "$path" != / && "$path" != *'..'* ]]
done
test -d "$RELEASE_ROOT"
test -L "$CURRENT_LINK"
test -f "$SHARED_ROOT/server.env"
for path in uploads runtime static; do test -d "$SHARED_ROOT/$path"; done
# Fail before touching the running service if systemd still points at the old app.
test "$(systemctl show "$BACKEND_SERVICE" --property=WorkingDirectory --value)" = "$CURRENT_LINK/server"
systemctl show "$BACKEND_SERVICE" --property=ExecStart --value | grep -Fq "$CURRENT_LINK/server/.venv/bin/"
sudo -n nginx -t

exec 9>"$RELEASE_ROOT/.deploy.lock"
flock -w 300 9
previous=$(readlink -f "$CURRENT_LINK")
release=$(mktemp -d "$RELEASE_ROOT/$sha.XXXXXXXX")
tar -xzf "$archive" -C "$release" --no-same-owner
# tar restores the archive's '.' directory mode, so apply traversal permissions
# after extraction as well as public permissions on the frontend subtree.
chmod 751 "$release"
test "$(cat "$release/REVISION")" = "$sha"
test -f "$release/frontend/dist/index.html"
# Nginx needs public frontend assets; backend code and server.env stay private.
chmod -R a+rX "$release/frontend"
ln -s "$SHARED_ROOT/server.env" "$release/server/.env"
for path in uploads runtime static; do ln -s "$SHARED_ROOT/$path" "$release/server/$path"; done
python3 -m venv "$release/server/.venv"
"$release/server/.venv/bin/python" -m pip install -r "$release/server/requirements.txt"
mkdir -p "$SHARED_ROOT/backups"
cd "$release/server"
".venv/bin/python" "$release/scripts/backup-database.py" "$SHARED_ROOT/backups/$sha-$(date -u +%Y%m%dT%H%M%SZ).dump"
# Migrations must remain compatible with the preceding release. Never downgrade
# or restore a database automatically when switching application code back.
".venv/bin/python" -m alembic upgrade head

switch_link() {
  local next_link="$CURRENT_LINK.next.$$.$RANDOM"
  ln -s "$1" "$next_link"
  mv -Tf "$next_link" "$CURRENT_LINK"
}
healthy() {
  for attempt in {1..30}; do
    if curl --fail --silent --max-time 5 "$HEALTH_URL" >/dev/null; then return 0; fi
    sleep 2
  done
  return 1
}
rollback() {
  trap - ERR
  echo "Release failed after activation; restoring application release $previous" >&2
  switch_link "$previous"
  sudo -n systemctl restart "$BACKEND_SERVICE"
  sudo -n systemctl reload nginx
  echo 'Database migrations were not reversed. Check compatibility before further deployment.' >&2
  exit 1
}
trap rollback ERR
switch_link "$release"
sudo -n systemctl restart "$BACKEND_SERVICE"
healthy
sudo -n systemctl reload nginx
curl --fail --silent --show-error --max-time 15 "$PUBLIC_URL/" >/dev/null
curl --fail --silent --show-error --max-time 15 "$PUBLIC_URL/api/health" >/dev/null
trap - ERR
printf '%s\n' "$sha" > "$SHARED_ROOT/deployed-revision"
rm -f "$archive"
echo "Deployment healthy: $sha"
