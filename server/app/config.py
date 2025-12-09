from __future__ import annotations

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

UPLOAD_DIR = BASE_DIR / Path("uploads") / "avatars"
# Chat attachments are stored under uploads/chat so they can be served via the existing /static mount.
CHAT_UPLOAD_DIR = BASE_DIR / Path("uploads") / "chat"
UPLOAD_DIR.parent.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
CHAT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_IMPORT_ROWS = 5000
MAX_IMPORT_FILE_SIZE_MB = 5
