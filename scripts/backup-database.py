"""Back up the configured PostgreSQL database without logging its credentials."""
from pathlib import Path
import os
import subprocess
import sys

sys.path.insert(0, str(Path.cwd()))
from app.core.config import settings
from sqlalchemy.engine import make_url


def main() -> None:
    destination = Path(sys.argv[1])
    url = make_url(settings.DATABASE_URL)
    if url.get_backend_name() != "postgresql":
        raise RuntimeError("Production backup requires PostgreSQL")
    env = os.environ.copy()
    env.update(
        PGHOST=url.host or "localhost",
        PGPORT=str(url.port or 5432),
        PGUSER=url.username or "",
        PGPASSWORD=url.password or "",
        PGDATABASE=url.database or "",
        **{f"PG{k.upper()}": str(v) for k, v in url.query.items() if k in {"sslmode", "sslrootcert"}},
    )
    # Exclusive creation prevents an accidental overwrite of an earlier backup.
    with destination.open("xb") as output:
        os.chmod(destination, 0o600)
        subprocess.run(["pg_dump", "--format=custom", "--no-password"], env=env, stdout=output, check=True)
    if destination.stat().st_size == 0:
        raise RuntimeError("Database backup is empty")


if __name__ == "__main__":
    main()
