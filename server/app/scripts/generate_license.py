from __future__ import annotations

import argparse
from datetime import UTC, datetime, timedelta
from pathlib import Path

from jose import jwt


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a signed license token.")
    parser.add_argument("--customer", required=True, help="Customer or deployment name")
    parser.add_argument("--license-id", required=True, help="Internal license identifier")
    parser.add_argument(
        "--days",
        type=int,
        default=365,
        help="Number of days the license should remain valid (ignored if --expires-at is supplied)",
    )
    parser.add_argument(
        "--expires-at",
        help="Explicit ISO timestamp for license expiry (e.g. 2026-01-01T00:00:00Z)",
    )
    parser.add_argument(
        "--private-key",
        required=True,
        help="Path to the RSA private key that signs licenses",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    private_key_path = Path(args.private_key)
    if not private_key_path.exists():
        raise SystemExit(f"Private key not found: {private_key_path}")

    if args.expires_at:
        expires_at = datetime.fromisoformat(
            args.expires_at.replace("Z", "+00:00") if args.expires_at.endswith("Z") else args.expires_at
        )
    else:
        expires_at = datetime.now(UTC) + timedelta(days=args.days)

    payload = {
        "customer": args.customer,
        "license_id": args.license_id,
        "issued_at": datetime.now(UTC).isoformat(),
        "expires_at": expires_at.astimezone(UTC).isoformat(),
    }

    private_key = private_key_path.read_text(encoding="utf-8")
    token = jwt.encode(payload, private_key, algorithm="RS256")
    print(token)


if __name__ == "__main__":
    main()
