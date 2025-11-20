from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, Iterable, List, Sequence

from slugify import slugify
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.config import MAX_IMPORT_FILE_SIZE_MB, MAX_IMPORT_ROWS
from app.models.household import Household
from app.models.member import Member
from app.models.ministry import Ministry
from app.models.tag import Tag
from app.models.priest import Priest
from app.schemas.member import (
    ALLOWED_CONTRIBUTION_METHODS,
    ALLOWED_CONTRIBUTION_EXCEPTION_REASONS,
    ALLOWED_MEMBER_GENDERS,
    ALLOWED_MEMBER_MARITAL_STATUSES,
    ALLOWED_MEMBER_STATUSES,
    normalize_member_phone,
)
from app.services.audit import empty_member_snapshot, record_member_changes, snapshot_member
from app.services.members_utils import apply_children, apply_spouse, ensure_priest, generate_username

TRUE_VALUES = {"true", "1", "yes", "y", "t"}
FALSE_VALUES = {"false", "0", "no", "n", "f"}
DEFAULT_CONTRIBUTION_AMOUNT = Decimal("75.00")
DEFAULT_CONTRIBUTION_CURRENCY = "CAD"

HEADER_ALIASES: dict[str, set[str]] = {
    "id": {"id"},
    "username": {"username", "user_name"},
    "first_name": {"first_name", "firstname"},
    "middle_name": {"middle_name", "middlename"},
    "last_name": {"last_name", "lastname", "surname"},
    "baptismal_name": {"baptismal_name", "baptism_name"},
    "email": {"email"},
    "phone": {"phone", "mobile"},
    "gender": {"gender"},
    "status": {"status"},
    "marital_status": {"marital_status"},
    "district": {"district"},
    "address": {"address"},
    "address_street": {"address_street", "street_address", "address_line1"},
    "address_city": {"address_city", "city"},
    "address_region": {"address_region", "state", "province", "region"},
    "address_postal_code": {"address_postal_code", "postal_code", "zip", "zip_code"},
    "address_country": {"address_country", "country"},
    "birth_date": {"birth_date", "dob"},
    "join_date": {"join_date", "membership_date"},
    "household_size_override": {"household_size_override", "family_count", "number_of_family"},
    "is_tither": {"is_tither", "tither"},
    "pays_contribution": {"pays_contribution", "membership_contributor", "do_you_pay_membership_contribution"},
    "contribution_method": {"contribution_method"},
    "contribution_amount": {"contribution_amount"},
    "contribution_exception_reason": {"contribution_exception_reason", "exception_reason", "contribution_exception"},
    "notes": {"notes"},
    "has_father_confessor": {"has_father_confessor", "father_confessor_flag"},
    "father_confessor_id": {"father_confessor_id"},
    "father_confessor_name": {"father_confessor", "father_confessor_name"},
    "household": {"household", "household_name"},
    "tags": {"tags", "tag_list"},
    "ministries": {"ministries", "ministry_list"},
    "spouse_first_name": {"spouse_first_name"},
    "spouse_last_name": {"spouse_last_name"},
    "spouse_gender": {"spouse_gender"},
    "spouse_country_of_birth": {"spouse_country_of_birth"},
    "spouse_phone": {"spouse_phone"},
    "spouse_email": {"spouse_email"},
    "children": {"children", "child_list"},
}


@dataclass
class ImportErrorDetail:
    row: int
    reason: str


@dataclass
class ImportReport:
    inserted: int = 0
    updated: int = 0
    failed: int = 0
    errors: List[ImportErrorDetail] = field(default_factory=list)


class ImportRowError(Exception):
    def __init__(self, row: int, reason: str):
        super().__init__(reason)
        self.row = row
        self.reason = reason


def import_members_from_csv(db: Session, file_bytes: bytes, actor_id: int) -> ImportReport:
    _ensure_file_size(file_bytes)
    text = _decode_csv(file_bytes)

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise ValueError("CSV header row is missing")

    header_map = _build_header_map(reader.fieldnames)
    if not header_map:
        raise ValueError("No recognized member headers found in CSV")

    report = ImportReport()
    rows_processed = 0

    for row_index, raw_row in enumerate(reader, start=2):
        normalized_row = _normalize_row(raw_row, header_map)
        if _row_is_empty(normalized_row.values()):
            continue

        rows_processed += 1
        if rows_processed > MAX_IMPORT_ROWS:
            raise ValueError(f"CSV exceeds maximum allowed rows ({MAX_IMPORT_ROWS})")

        try:
            cleaned = _clean_row(row_index, normalized_row)
            action = _upsert_member(db, row_index, cleaned, actor_id)
            db.commit()
            if action == "inserted":
                report.inserted += 1
            else:
                report.updated += 1
        except ImportRowError as exc:
            db.rollback()
            report.failed += 1
            report.errors.append(ImportErrorDetail(row=exc.row, reason=exc.reason))
        except Exception as exc:  # pragma: no cover - safeguard
            db.rollback()
            report.failed += 1
            report.errors.append(ImportErrorDetail(row=row_index, reason=str(exc)))

    return report


def _ensure_file_size(file_bytes: bytes) -> None:
    max_bytes = MAX_IMPORT_FILE_SIZE_MB * 1024 * 1024
    if len(file_bytes) > max_bytes:
        raise ValueError(f"CSV file is larger than the allowed {MAX_IMPORT_FILE_SIZE_MB}MB")


def _decode_csv(file_bytes: bytes) -> str:
    try:
        return file_bytes.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError("CSV must be UTF-8 encoded") from exc


def _normalize_header(name: str) -> str:
    return name.strip().lower().replace(" ", "_")


def _build_header_map(fieldnames: Sequence[str]) -> dict[str, str]:
    header_map: dict[str, str] = {}
    for original in fieldnames:
        normalized = _normalize_header(original or "")
        for canonical, aliases in HEADER_ALIASES.items():
            if normalized in aliases and canonical not in header_map.values():
                header_map[original] = canonical
                break
    return header_map


def _normalize_row(row: dict[str, str], header_map: dict[str, str]) -> dict[str, str]:
    normalized: dict[str, str] = {}
    for original_header, value in row.items():
        canonical = header_map.get(original_header)
        if canonical:
            normalized[canonical] = value or ""
    return normalized


def _row_is_empty(values: Iterable[str]) -> bool:
    return all((value or "").strip() == "" for value in values)


def _clean_row(row_number: int, row: dict[str, str]) -> dict[str, Any]:
    cleaned: dict[str, Any] = {}

    if "id" in row:
        value = row["id"].strip()
        if value:
            if not value.isdigit():
                raise ImportRowError(row_number, "id must be numeric")
            cleaned["id"] = int(value)

    string_fields = (
        "first_name",
        "middle_name",
        "last_name",
        "username",
        "email",
        "phone",
        "district",
        "address",
        "address_street",
        "address_city",
        "address_region",
        "address_postal_code",
        "address_country",
        "contribution_method",
        "notes",
        "household",
        "baptismal_name",
    )
    for key in string_fields:
        if key in row:
            value = _clean_string(row[key])
            if key == "phone":
                if value is None:
                    raise ImportRowError(row_number, "phone cannot be empty")
                try:
                    cleaned[key] = normalize_member_phone(value)
                except ValueError as exc:
                    raise ImportRowError(row_number, str(exc)) from exc
            else:
                cleaned[key] = value

    if "email" in cleaned and cleaned["email"]:
        cleaned["email"] = cleaned["email"].lower()

    if "gender" in row:
        gender = _clean_string(row["gender"])
        if gender:
            cleaned["gender"] = _normalize_choice(row_number, "gender", gender, ALLOWED_MEMBER_GENDERS)
        else:
            cleaned["gender"] = None

    if "status" in row:
        status_value = _clean_string(row["status"])
        if status_value:
            cleaned["status"] = _normalize_choice(row_number, "status", status_value, ALLOWED_MEMBER_STATUSES)

    if "marital_status" in row:
        marital_value = _clean_string(row["marital_status"])
        if marital_value:
            cleaned["marital_status"] = _normalize_choice(row_number, "marital_status", marital_value, ALLOWED_MEMBER_MARITAL_STATUSES)

    if "contribution_method" in cleaned and cleaned["contribution_method"]:
        cleaned["contribution_method"] = _normalize_choice(
            row_number,
            "contribution_method",
            cleaned["contribution_method"],
            ALLOWED_CONTRIBUTION_METHODS,
        )

    for date_key in ("birth_date", "join_date"):
        if date_key in row:
            raw_value = _clean_string(row[date_key])
            if raw_value:
                cleaned[date_key] = _parse_date(row_number, date_key, raw_value)
            else:
                cleaned[date_key] = None

    if "is_tither" in row:
        cleaned["is_tither"] = _parse_bool(row_number, row["is_tither"], "is_tither")

    if "pays_contribution" in row:
        cleaned["pays_contribution"] = _parse_bool(row_number, row["pays_contribution"], "pays_contribution")

    if "has_father_confessor" in row:
        cleaned["has_father_confessor"] = _parse_bool(row_number, row["has_father_confessor"], "has_father_confessor")

    if "contribution_amount" in row:
        cleaned["contribution_amount"] = _parse_decimal(row_number, row["contribution_amount"])
    if "contribution_exception_reason" in row:
        reason_value = _clean_string(row["contribution_exception_reason"])
        if reason_value:
            cleaned["contribution_exception_reason"] = _normalize_choice(
                row_number,
                "contribution_exception_reason",
                reason_value,
                ALLOWED_CONTRIBUTION_EXCEPTION_REASONS,
            )
        else:
            cleaned["contribution_exception_reason"] = None

    if "household_size_override" in row:
        cleaned["household_size_override"] = _parse_int(row_number, "household_size_override", row["household_size_override"], minimum=1)

    if "father_confessor_id" in row:
        cleaned["father_confessor_id"] = _parse_int(row_number, "father_confessor_id", row["father_confessor_id"])

    if "father_confessor_name" in row:
        cleaned["father_confessor_name"] = _clean_string(row["father_confessor_name"])

    if "tags" in row:
        cleaned["tags"] = _split_multi_value(row["tags"])

    if "ministries" in row:
        cleaned["ministries"] = _split_multi_value(row["ministries"])

    spouse_first = _clean_string(row.get("spouse_first_name")) if "spouse_first_name" in row else None
    spouse_last = _clean_string(row.get("spouse_last_name")) if "spouse_last_name" in row else None
    spouse_gender = _clean_string(row.get("spouse_gender")) if "spouse_gender" in row else None
    spouse_country = _clean_string(row.get("spouse_country_of_birth")) if "spouse_country_of_birth" in row else None
    spouse_phone = _clean_string(row.get("spouse_phone")) if "spouse_phone" in row else None
    if spouse_phone:
        try:
            spouse_phone = normalize_member_phone(spouse_phone)
        except ValueError as exc:
            raise ImportRowError(row_number, f"Invalid spouse phone: {exc}") from exc
    spouse_email = _clean_string(row.get("spouse_email")) if "spouse_email" in row else None

    spouse_fields_present = any(
        field is not None
        for field in (spouse_first, spouse_last, spouse_gender, spouse_country, spouse_phone, spouse_email)
    )
    if spouse_fields_present:
        if not spouse_first or not spouse_last:
            raise ImportRowError(row_number, "Spouse first and last name are required when spouse data is provided")
        spouse_payload: dict[str, Any] = {
            "first_name": spouse_first,
            "last_name": spouse_last,
            "phone": spouse_phone,
            "email": spouse_email,
        }
        if spouse_gender:
            spouse_payload["gender"] = _normalize_choice(row_number, "spouse gender", spouse_gender, ALLOWED_MEMBER_GENDERS)
        if spouse_country:
            spouse_payload["country_of_birth"] = spouse_country
        cleaned["spouse"] = spouse_payload

    if "children" in row:
        children_value = _clean_string(row["children"])
        if children_value:
            cleaned["children"] = _parse_children_field(row_number, children_value)
        else:
            cleaned["children"] = []

    return cleaned


def _clean_string(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _parse_bool(row_number: int, value: str, field: str) -> bool | None:
    text = value.strip().lower()
    if not text:
        return None
    if text in TRUE_VALUES:
        return True
    if text in FALSE_VALUES:
        return False
    raise ImportRowError(row_number, f"Invalid boolean value '{value}' for {field}")


def _parse_decimal(row_number: int, value: str) -> Decimal | None:
    text = value.replace(",", "").strip()
    if not text:
        return None
    try:
        return Decimal(text)
    except InvalidOperation as exc:
        raise ImportRowError(row_number, f"Invalid decimal value '{value}' for contribution_amount") from exc


def _parse_int(row_number: int, field: str, value: str, minimum: int | None = None) -> int | None:
    text = (value or "").strip()
    if not text:
        return None
    if not text.isdigit():
        raise ImportRowError(row_number, f"{field} must be numeric")
    parsed = int(text)
    if minimum is not None and parsed < minimum:
        raise ImportRowError(row_number, f"{field} must be at least {minimum}")
    return parsed


def _normalize_choice(row_number: int, field: str, value: str, allowed: Iterable[str]) -> str:
    normalized_input = value.strip().lower()
    for option in allowed:
        if normalized_input == option.lower():
            return option
    raise ImportRowError(row_number, f"Invalid {field} value '{value}'")


def _normalize_contribution_values(
    row_number: int,
    amount: Decimal | None,
    exception_reason: str | None,
) -> tuple[Decimal, str | None]:
    normalized_amount = (amount or DEFAULT_CONTRIBUTION_AMOUNT).quantize(Decimal("0.01"))
    if normalized_amount <= 0:
        raise ImportRowError(row_number, "Contribution amount must be greater than zero")
    if exception_reason:
        if exception_reason not in ALLOWED_CONTRIBUTION_EXCEPTION_REASONS:
            raise ImportRowError(row_number, f"Invalid contribution exception reason '{exception_reason}'")
    else:
        if normalized_amount != DEFAULT_CONTRIBUTION_AMOUNT:
            raise ImportRowError(
                row_number,
                f"Contribution amount must be {DEFAULT_CONTRIBUTION_AMOUNT} CAD unless an exception reason is provided",
            )
    return normalized_amount, exception_reason


def _parse_children_field(row_number: int, value: str) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for index, segment in enumerate(value.split(";"), start=1):
        segment = segment.strip()
        if not segment:
            continue
        parts = [part.strip() for part in segment.split("|")]
        while len(parts) < 6:
            parts.append("")
        first_name, last_name, gender, birth_date, country, notes = parts[:6]
        if not first_name or not last_name:
            raise ImportRowError(row_number, f"Child entry #{index} requires first and last name")

        child_payload: dict[str, Any] = {
            "first_name": first_name,
            "last_name": last_name,
        }
        if gender:
            child_payload["gender"] = _normalize_choice(row_number, "child gender", gender, ALLOWED_MEMBER_GENDERS)
        if birth_date:
            child_payload["birth_date"] = _parse_date(row_number, "child_birth_date", birth_date)
        if country:
            child_payload["country_of_birth"] = country
        if notes:
            child_payload["notes"] = notes
        entries.append(child_payload)

    return entries


def _parse_date(row_number: int, field: str, value: str):
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    raise ImportRowError(row_number, f"Invalid date '{value}' for {field}; expected ISO or DD/MM/YYYY")


def _split_multi_value(value: str) -> list[str]:
    tokens = value.replace(";", ",").split(",")
    cleaned = [token.strip() for token in tokens if token.strip()]
    unique: dict[str, str] = {}
    for token in cleaned:
        key = token.lower()
        if key not in unique:
            unique[key] = token
    return list(unique.values())


def _upsert_member(db: Session, row_number: int, data: dict[str, Any], actor_id: int) -> str:
    member = _locate_member(db, data)
    is_new = member is None

    if is_new:
        first_name = data.get("first_name")
        last_name = data.get("last_name")
        if not first_name or not last_name:
            raise ImportRowError(row_number, "first_name and last_name are required for new members")
        phone_value = data.get("phone")
        if not phone_value:
            raise ImportRowError(row_number, "phone is required for new members")
        username = data.get("username") or generate_username(db, first_name, last_name)
        member = Member(
            first_name=first_name,
            middle_name=data.get("middle_name"),
            last_name=last_name,
            username=username,
            email=data.get("email"),
            phone=phone_value,
            birth_date=data.get("birth_date"),
            join_date=data.get("join_date"),
            gender=data.get("gender"),
            baptismal_name=data.get("baptismal_name"),
            marital_status=data.get("marital_status"),
            address=data.get("address"),
            address_street=data.get("address_street"),
            address_city=data.get("address_city"),
            address_region=data.get("address_region"),
            address_postal_code=data.get("address_postal_code"),
            address_country=data.get("address_country"),
            district=data.get("district"),
            status=data.get("status") or "Active",
            is_tither=data.get("is_tither") if data.get("is_tither") is not None else False,
            pays_contribution=data.get("pays_contribution") if data.get("pays_contribution") is not None else False,
            contribution_method=data.get("contribution_method"),
            contribution_amount=data.get("contribution_amount"),
            notes=data.get("notes"),
            household_size_override=data.get("household_size_override"),
            has_father_confessor=data.get("has_father_confessor") or bool(data.get("father_confessor_id") or data.get("father_confessor_name")),
        )
        member.created_by_id = actor_id
        db.add(member)
        previous_snapshot = empty_member_snapshot()
    else:
        if member.deleted_at is not None:
            raise ImportRowError(row_number, "Member is archived; restore before importing updates")
        previous_snapshot = snapshot_member(member)

    _apply_scalar_updates(db, row_number, member, data)
    _apply_boolean(row_number, member, data, is_new)
    _apply_relationships(db, row_number, member, data)

    if member.marital_status == "Married" and member.spouse is None:
        raise ImportRowError(row_number, "Spouse details are required when marital status is Married")

    if member.has_father_confessor and member.father_confessor is None:
        raise ImportRowError(row_number, "Father confessor is required when marked as having one")

    member.updated_by_id = actor_id
    db.flush()
    record_member_changes(db, member, previous_snapshot, actor_id)

    return "inserted" if is_new else "updated"


def _locate_member(db: Session, data: dict[str, Any]) -> Member | None:
    member: Member | None = None

    member_id = data.get("id")
    if member_id:
        member = db.get(Member, member_id)
        if member:
            return member

    email = data.get("email")
    if email:
        member = (
            db.query(Member)
            .filter(func.lower(Member.email) == email.lower(), Member.deleted_at.is_(None))
            .first()
        )
        if member:
            return member

    username = data.get("username")
    if username:
        member = (
            db.query(Member)
            .filter(func.lower(Member.username) == username.lower(), Member.deleted_at.is_(None))
            .first()
        )
    return member


def _apply_scalar_updates(db: Session, row_number: int, member: Member, data: dict[str, Any]) -> None:
    scalar_fields = {
        "middle_name",
        "email",
        "gender",
        "baptismal_name",
        "marital_status",
        "status",
        "district",
        "address",
        "address_street",
        "address_city",
        "address_region",
        "address_postal_code",
        "address_country",
        "birth_date",
        "join_date",
        "contribution_method",
        "contribution_amount",
        "contribution_exception_reason",
        "notes",
        "household_size_override",
    }

    for field in scalar_fields:
        if field in data:
            setattr(member, field, data[field])

    if "phone" in data:
        phone_value = data["phone"]
        if phone_value is None or not phone_value.strip():
            raise ImportRowError(row_number, "phone cannot be empty")
        member.phone = phone_value.strip()

    if "first_name" in data and data["first_name"]:
        member.first_name = data["first_name"]
    if "last_name" in data and data["last_name"]:
        member.last_name = data["last_name"]

    if "username" in data and data["username"]:
        desired_username = data["username"]
        if desired_username != member.username:
            existing = (
                db.query(Member)
                .filter(func.lower(Member.username) == desired_username.lower(), Member.id != member.id)
                .first()
            )
            if existing:
                raise ImportRowError(row_number, f"Username '{desired_username}' already exists")
            member.username = desired_username

    incoming_amount = data.get("contribution_amount")
    if incoming_amount is not None:
        amount_candidate = Decimal(str(incoming_amount))
    elif member.contribution_amount is not None:
        amount_candidate = Decimal(str(member.contribution_amount))
    else:
        amount_candidate = None

    exception_candidate = (
        data.get("contribution_exception_reason")
        if "contribution_exception_reason" in data
        else member.contribution_exception_reason
    )

    normalized_amount, normalized_exception = _normalize_contribution_values(
        row_number,
        amount_candidate,
        exception_candidate,
    )
    member.contribution_amount = normalized_amount
    member.contribution_exception_reason = normalized_exception
    member.contribution_currency = DEFAULT_CONTRIBUTION_CURRENCY


def _apply_boolean(row_number: int, member: Member, data: dict[str, Any], is_new: bool) -> None:
    if "is_tither" in data:
        if data["is_tither"] is not None:
            member.is_tither = data["is_tither"]
        elif is_new:
            member.is_tither = False

    if "pays_contribution" in data:
        value = data["pays_contribution"]
        if value is False:
            raise ImportRowError(row_number, "pays_contribution cannot be false")
        member.pays_contribution = True
    elif is_new or not member.pays_contribution:
        member.pays_contribution = True

    if "has_father_confessor" in data and data["has_father_confessor"] is not None:
        member.has_father_confessor = data["has_father_confessor"]


def _apply_relationships(db: Session, row_number: int, member: Member, data: dict[str, Any]) -> None:
    if "household" in data:
        household_name = data["household"]
        if household_name:
            member.household = _get_or_create_household(db, household_name)
        else:
            member.household = None

    if "tags" in data:
        tag_names = data["tags"]
        member.tags = _get_or_create_tags(db, tag_names)

    if "ministries" in data:
        ministry_names = data["ministries"]
        member.ministries = _get_or_create_ministries(db, ministry_names)

    if "spouse" in data:
        apply_spouse(member, data["spouse"])

    if "children" in data:
        apply_children(member, data["children"])

    priest: Priest | None = None
    father_confessor_id = data.get("father_confessor_id")
    father_confessor_name = data.get("father_confessor_name")

    if father_confessor_id:
        priest = db.get(Priest, father_confessor_id)
        if not priest:
            raise ImportRowError(row_number, "Father confessor not found")
    elif father_confessor_name:
        priest = ensure_priest(db, father_confessor_name)

    if priest:
        member.father_confessor = priest
        member.has_father_confessor = True
    elif data.get("has_father_confessor") is False:
        member.father_confessor = None


def _get_or_create_household(db: Session, name: str) -> Household:
    household = (
        db.query(Household)
        .filter(func.lower(Household.name) == name.lower())
        .first()
    )
    if household is None:
        household = Household(name=name)
        db.add(household)
        db.flush()
    return household


def _ensure_tag(db: Session, name: str) -> Tag:
    slug = slugify(name)
    existing = (
        db.query(Tag)
        .filter(func.lower(Tag.slug) == slug.lower())
        .first()
    )
    if existing is None:
        existing = (
            db.query(Tag)
            .filter(func.lower(Tag.name) == name.lower())
            .first()
        )
    if existing:
        return existing
    stmt = (
        insert(Tag)
        .values(name=name, slug=slug)
        .on_conflict_do_nothing()
        .returning(Tag.id)
    )
    inserted_id = db.execute(stmt).scalar()
    if inserted_id:
        tag = db.get(Tag, inserted_id)
    else:
        tag = (
            db.query(Tag)
            .filter(func.lower(Tag.slug) == slug.lower())
            .first()
        )
    if tag is None:
        # Fallback for case-insensitive match on name
        tag = (
            db.query(Tag)
            .filter(func.lower(Tag.name) == name.lower())
            .first()
        )
    if tag is None:
        tag = Tag(name=name, slug=slug)
        db.add(tag)
        db.flush()
    return tag


def _ensure_ministry(db: Session, name: str) -> Ministry:
    slug = slugify(name)
    existing = (
        db.query(Ministry)
        .filter(func.lower(Ministry.slug) == slug.lower())
        .first()
    )
    if existing is None:
        existing = (
            db.query(Ministry)
            .filter(func.lower(Ministry.name) == name.lower())
            .first()
        )
    if existing:
        return existing
    stmt = (
        insert(Ministry)
        .values(name=name, slug=slug)
        .on_conflict_do_nothing()
        .returning(Ministry.id)
    )
    inserted_id = db.execute(stmt).scalar()
    if inserted_id:
        ministry = db.get(Ministry, inserted_id)
    else:
        ministry = (
            db.query(Ministry)
            .filter(func.lower(Ministry.slug) == slug.lower())
            .first()
        )
    if ministry is None:
        ministry = (
            db.query(Ministry)
            .filter(func.lower(Ministry.name) == name.lower())
            .first()
        )
    if ministry is None:
        ministry = Ministry(name=name, slug=slug)
        db.add(ministry)
        db.flush()
    return ministry


def _get_or_create_tags(db: Session, names: list[str]) -> list[Tag]:
    if not names:
        return []

    return [_ensure_tag(db, name) for name in names]


def _get_or_create_ministries(db: Session, names: list[str]) -> list[Ministry]:
    if not names:
        return []

    return [_ensure_ministry(db, name) for name in names]
