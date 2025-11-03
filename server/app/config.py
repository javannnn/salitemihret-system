from __future__ import annotations

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

UPLOAD_DIR = BASE_DIR / Path("uploads") / "avatars"
UPLOAD_DIR.parent.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_IMPORT_ROWS = 5000
MAX_IMPORT_FILE_SIZE_MB = 5
