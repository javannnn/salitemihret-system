from __future__ import annotations

import base64
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

from sqlalchemy.orm import Session

from app.auth.security import hash_password
from app.services.user_accounts import generate_username_from_email
from app.config import UPLOAD_DIR
from app.core.config import settings
from app.core.db import Base, SessionLocal, engine
from app.models.household import Household
from app.models.member import Member
from app.models.member_contribution_payment import MemberContributionPayment
from app.models.ministry import Ministry
from app.models.priest import Priest
from app.models.role import Role
from app.models.newcomer import Newcomer
from app.models.sponsorship import Sponsorship
from app.models.schools import (
    Lesson,
    Mezmur,
    SundaySchoolEnrollment,
    AbenetEnrollment,
    AbenetEnrollmentPayment,
)
from app.models.tag import Tag
from app.models.user import User
from app.services.members_utils import apply_children, apply_spouse
from app.schemas.payment import PaymentCreate
from app.services import payments as payments_service
from app.services.schools import ABENET_SERVICE_CODE

ROLE_NAMES = [
    "OfficeAdmin",
    "PublicRelations",
    "FinanceAdmin",
    "Clerk",
    "SchoolAdmin",
    "SponsorshipCommittee",
    "MediaAdmin",
    "Registrar",
    "Admin",
]

SUPER_ADMIN_EMAILS = {"superadmin@example.com"}

DEMO_USERS = [
    ("pradmin@example.com", "PR Admin", "Demo123!", ["PublicRelations"]),
    ("registrar@example.com", "Registrar", "Demo123!", ["Registrar"]),
    ("clerk@example.com", "Clerk", "Demo123!", ["Clerk"]),
    ("finance@example.com", "Finance Admin", "Demo123!", ["FinanceAdmin"]),
    ("admin@example.com", "System Admin", "Demo123!", ["Admin"]),
    ("superadmin@example.com", "Super Admin", "Demo123!", ROLE_NAMES),
]

DEMO_HOUSEHOLDS = [
    "Tesfaye Family",
    "Negash Household",
    "Gebremariam Home",
]

DEMO_TAGS = {
    "youth": "Youth",
    "choir": "Choir",
    "media": "Media",
}

DEMO_MINISTRIES = {
    "sundayschool": "Sunday School",
    "pr": "Public Relations",
}

DEMO_PRIESTS = [
    "Abba Kidus",
    "Abba Teklu",
    "Abba Tesfaye",
]

_AVATAR_BASE64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAL" \
    "EQAACxEBf2RfkQAAABl0RVh0Q3JlYXRpb24gVGltZQAwOC8yMy8yMZFfS/sAAAAcdEVYdFNvZnR3YXJl" \
    "AFBhaW50Lk5FVCB2My4zNqnnpgAAADNJREFUKFNjZCASMBIwkGJkZGBg+M9ABYxAzMwMP4mBhTA0MDCm" \
    "f4LxH4l0GBoZGBgYGABiUgtV+fi9uAAAAABJRU5ErkJggg=="
)

DEMO_MEMBERS = [
    {
        "first_name": "Abeba",
        "middle_name": "S.",
        "last_name": "Tesfaye",
        "baptismal_name": "Abebech",
        "birth_date": date(1985, 3, 12),
        "email": "abeba.tesfaye@example.com",
        "phone": "+251900111001",
        "status": "Active",
        "gender": "Female",
        "marital_status": "Married",
        "district": "Arada",
        "address": "123 Unity Ave",
        "address_street": "123 Unity Ave",
        "address_city": "Addis Ababa",
        "address_region": "Addis Ababa",
        "address_postal_code": "1000",
        "address_country": "Ethiopia",
        "household": "Tesfaye Family",
        "household_size_override": None,
        "tags": ["choir"],
        "ministries": ["sundayschool"],
        "avatar": "abeba.png",
        "join_date": date(2022, 5, 1),
        "is_tither": True,
        "pays_contribution": True,
        "contribution_method": "Cash",
        "contribution_amount": Decimal("75.00"),
        "contribution_exception_reason": None,
        "notes": "Choir lead and youth mentor",
        "has_father_confessor": True,
        "father_confessor": "Abba Kidus",
        "payments": [
            {"amount": Decimal("75.00"), "paid_at": date(2024, 1, 5), "method": "Cash", "note": "2024 membership"},
        ],
        "spouse": {
            "first_name": "Tesfaye",
            "last_name": "Mengistu",
            "gender": "Male",
            "country_of_birth": "Ethiopia",
            "phone": "+251900555111",
            "email": None,
        },
        "children": [
            {
                "first_name": "Hanna",
                "last_name": "Mengistu",
                "gender": "Female",
                "birth_date": date(2010, 7, 21),
                "country_of_birth": "Ethiopia",
                "notes": "Sunday School volunteer",
            }
        ],
    },
    {
        "first_name": "Bekele",
        "middle_name": "M.",
        "last_name": "Desta",
        "baptismal_name": "Bekele",
        "birth_date": date(1982, 11, 2),
        "email": "bekele.desta@example.com",
        "phone": "+251900111002",
        "status": "Active",
        "gender": "Male",
        "marital_status": "Married",
        "district": "Bole",
        "address": "45 Victory St",
        "address_street": "45 Victory St",
        "address_city": "Addis Ababa",
        "address_region": "Addis Ababa",
        "address_postal_code": "1006",
        "address_country": "Ethiopia",
        "household": "Tesfaye Family",
        "household_size_override": None,
        "tags": ["youth"],
        "ministries": ["pr"],
        "avatar": "bekele.png",
        "join_date": date(2023, 2, 10),
        "is_tither": False,
        "pays_contribution": True,
        "contribution_method": "Direct Deposit",
        "contribution_amount": Decimal("40.00"),
        "contribution_exception_reason": "LowIncome",
        "notes": "Youth outreach coordinator",
        "has_father_confessor": True,
        "father_confessor": "Abba Tesfaye",
        "payments": [
            {"amount": Decimal("40.00"), "paid_at": date(2024, 2, 10), "method": "Direct Deposit", "note": "Hardship rate"},
        ],
        "spouse": {
            "first_name": "Meron",
            "last_name": "Desta",
            "gender": "Female",
            "country_of_birth": "Ethiopia",
            "phone": "+251900222888",
            "email": "meron.desta@example.com",
        },
        "children": [],
    },
    {
        "first_name": "Chaltu",
        "middle_name": "A.",
        "last_name": "Hailemariam",
        "baptismal_name": "Chaltu",
        "birth_date": date(1990, 4, 18),
        "email": "chaltu.hailemariam@example.com",
        "phone": "+251900111003",
        "status": "Inactive",
        "gender": "Female",
        "marital_status": "Single",
        "district": "Yeka",
        "address": "12 Harmony Rd",
        "address_street": "12 Harmony Rd",
        "address_city": "Addis Ababa",
        "address_region": "Addis Ababa",
        "address_postal_code": "1007",
        "address_country": "Ethiopia",
        "household": "Negash Household",
        "household_size_override": None,
        "tags": ["media"],
        "ministries": ["pr"],
        "avatar": None,
        "join_date": date(2021, 11, 20),
        "is_tither": True,
        "pays_contribution": True,
        "contribution_method": "E-Transfer",
        "contribution_amount": Decimal("75.00"),
        "contribution_exception_reason": None,
        "notes": "Media coordinator on sabbatical",
        "has_father_confessor": False,
        "father_confessor": None,
        "spouse": None,
        "children": [],
    },
    {
        "first_name": "Dawit",
        "middle_name": "K.",
        "last_name": "Negash",
        "baptismal_name": "Dawit",
        "birth_date": date(1995, 9, 9),
        "email": "dawit.negash@example.com",
        "phone": "+251900111004",
        "status": "Active",
        "gender": "Male",
        "marital_status": "Single",
        "district": "Lideta",
        "address": "78 Jubilee Sq",
        "address_street": "78 Jubilee Sq",
        "address_city": "Addis Ababa",
        "address_region": "Addis Ababa",
        "address_postal_code": "1008",
        "address_country": "Ethiopia",
        "household": "Negash Household",
        "household_size_override": 4,
        "tags": ["youth", "choir"],
        "ministries": ["sundayschool"],
        "avatar": "dawit.png",
        "join_date": date(2024, 1, 5),
        "is_tither": False,
        "pays_contribution": True,
        "contribution_method": "Cash",
        "contribution_amount": Decimal("25.00"),
        "contribution_exception_reason": "LowIncome",
        "notes": "Teen choir lead",
        "has_father_confessor": True,
        "father_confessor": "Abba Teklu",
        "payments": [
            {"amount": Decimal("25.00"), "paid_at": date(2024, 3, 18), "method": "Cash", "note": "Youth allowance"},
        ],
        "spouse": None,
        "children": [],
    },
    {
        "first_name": "Eleni",
        "middle_name": "H.",
        "last_name": "Gebremariam",
        "baptismal_name": "Eleni",
        "birth_date": date(1978, 1, 23),
        "email": "eleni.gebremariam@example.com",
        "phone": "+251900111005",
        "status": "Active",
        "gender": "Female",
        "marital_status": "Widowed",
        "district": "Kirkos",
        "address": "9 Unity Plaza",
        "address_street": "9 Unity Plaza",
        "address_city": "Addis Ababa",
        "address_region": "Addis Ababa",
        "address_postal_code": "1009",
        "address_country": "Ethiopia",
        "household": "Gebremariam Home",
        "household_size_override": None,
        "tags": ["media"],
        "ministries": [],
        "avatar": None,
        "join_date": date(2020, 9, 14),
        "is_tither": True,
        "pays_contribution": True,
        "contribution_method": "Cash",
        "contribution_amount": Decimal("75.00"),
        "contribution_exception_reason": None,
        "notes": "Communications strategist",
        "has_father_confessor": False,
        "father_confessor": None,
        "payments": [
            {"amount": Decimal("75.00"), "paid_at": date(2023, 12, 12), "method": "Cash", "note": "Annual"},
        ],
        "spouse": None,
        "children": [],
    },
]

DEMO_NEWCOMERS = [
    {
        "first_name": "Mekdes",
        "last_name": "Haile",
        "preferred_language": "Amharic",
        "contact_phone": "+251900777000",
        "arrival_date": date(2025, 1, 12),
        "service_type": "Family Settlement",
        "status": "InProgress",
        "notes": "Sponsored by PR, needs welcome visit.",
        "sponsored_by": "abeba.tesfaye",
        "country": "Ethiopia",
        "temporary_address": "Guesthouse near Arat Kilo",
    },
    {
        "first_name": "Samuel",
        "last_name": "Girma",
        "preferred_language": "English",
        "contact_email": "samuel.girma@example.com",
        "arrival_date": date(2024, 12, 2),
        "service_type": "Student Support",
        "status": "New",
        "notes": "International student seeking sponsorship.",
        "sponsored_by": "bekele.desta",
        "country": "Ethiopia",
        "temporary_address": "Unity Dorms",
    },
]

DEMO_SPONSORSHIPS = [
    {
        "sponsor": "abeba.tesfaye",
        "newcomer_key": ("Mekdes", "Haile"),
        "monthly_amount": Decimal("150.00"),
        "frequency": "Monthly",
        "status": "Active",
        "program": "Housing",
        "pledge_channel": "InPerson",
        "reminder_channel": "Email",
        "motivation": "ParishInitiative",
        "notes_template": "FollowUp",
        "start_date": date(2025, 1, 1),
        "notes": "Family sponsorship covering rent and groceries.",
        "budget_month": 1,
        "budget_year": 2025,
        "budget_slots": 3,
    },
    {
        "sponsor": "bekele.desta",
        "beneficiary_username": "dawit.negash",
        "monthly_amount": Decimal("90.00"),
        "frequency": "Monthly",
        "status": "Active",
        "program": "Education",
        "pledge_channel": "OnlinePortal",
        "reminder_channel": "SMS",
        "motivation": "HonorMemorial",
        "notes_template": "Gratitude",
        "start_date": date(2024, 11, 1),
        "notes": "Supporting youth choir stipend.",
        "budget_month": 1,
        "budget_year": 2025,
        "budget_slots": 1,
    },
]

DEMO_LESSONS = [
    {"lesson_code": "SS-INTRO", "title": "Welcome & Prayer", "level": "SundaySchool", "duration_minutes": 30},
    {"lesson_code": "SS-GOSPEL", "title": "Gospel Reflections", "level": "SundaySchool", "duration_minutes": 45},
    {"lesson_code": "AB-FOUND", "title": "Abenet Foundations", "level": "Abenet", "duration_minutes": 60},
]

DEMO_MEZMUR = [
    {"code": "MZ-KID-01", "title": "Hosanna Kids", "language": "Amharic", "category": "Youth", "rehearsal_day": "Saturday"},
    {"code": "MZ-YOUTH-02", "title": "Youth Harmony", "language": "English", "category": "Youth", "rehearsal_day": "Sunday"},
]

DEMO_SUNDAY_ENROLLMENTS = [
    {
        "member_username": "hanna.mengistu",
        "guardian_username": "abeba.tesfaye",
        "class_level": "Youth",
        "mezmur_code": "MZ-YOUTH-02",
        "enrollment_date": date(2024, 9, 1),
    }
]

DEMO_ABENET_ENROLLMENTS = [
    {
        "parent_username": "abeba.tesfaye",
        "child_first_name": "Hanna",
        "child_last_name": "Mengistu",
        "birth_date": date(2010, 7, 21),
        "service_stage": "Alphabet",
        "enrollment_date": date(2025, 1, 10),
        "notes": "Preparing for alphabet classes",
    }
]


def _ensure_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def _write_avatar(filename: str) -> str:
    demo_dir = UPLOAD_DIR / "demo"
    _ensure_directory(demo_dir)
    file_path = demo_dir / filename
    if not file_path.exists():
        file_path.write_bytes(base64.b64decode(_AVATAR_BASE64))
    relative_root = UPLOAD_DIR.relative_to(UPLOAD_DIR.parent)
    relative_path = relative_root / "demo" / filename
    return relative_path.as_posix()


def ensure_role(db: Session, name: str) -> Role:
    role = db.query(Role).filter_by(name=name).first()
    if role is None:
        role = Role(name=name)
        db.add(role)
        db.commit()
        db.refresh(role)
    return role


def ensure_user(db: Session, email: str, full_name: str, password: str, roles: list[str]) -> User:
    user = db.query(User).filter_by(email=email).first()
    if user is None:
        username = generate_username_from_email(email, db)
        user = User(
            email=email,
            full_name=full_name,
            username=username,
            hashed_password=hash_password(password),
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    user.roles.clear()
    for role_name in roles:
        user.roles.append(ensure_role(db, role_name))
    if email in SUPER_ADMIN_EMAILS:
        user.is_super_admin = True
    db.commit()
    return user


def ensure_households(db: Session) -> dict[str, Household]:
    households: dict[str, Household] = {}
    for name in DEMO_HOUSEHOLDS:
        household = db.query(Household).filter_by(name=name).first()
        if household is None:
            household = Household(name=name)
            db.add(household)
            db.flush()
        households[name] = household
    db.commit()
    return households


def ensure_tags(db: Session) -> dict[str, Tag]:
    tags: dict[str, Tag] = {}
    for slug, name in DEMO_TAGS.items():
        tag = db.query(Tag).filter_by(slug=slug).first()
        if tag is None:
            tag = Tag(slug=slug, name=name)
            db.add(tag)
            db.flush()
        tags[slug] = tag
    db.commit()
    return tags


def ensure_priests(db: Session) -> dict[str, Priest]:
    priests: dict[str, Priest] = {}
    for name in DEMO_PRIESTS:
        priest = db.query(Priest).filter_by(full_name=name).first()
        if priest is None:
            priest = Priest(full_name=name)
            db.add(priest)
            db.flush()
        priests[name] = priest
    db.commit()
    return priests


def ensure_ministries(db: Session) -> dict[str, Ministry]:
    ministries: dict[str, Ministry] = {}
    for slug, name in DEMO_MINISTRIES.items():
        ministry = db.query(Ministry).filter_by(slug=slug).first()
        if ministry is None:
            ministry = Ministry(slug=slug, name=name)
            db.add(ministry)
            db.flush()
        ministries[slug] = ministry
    db.commit()
    return ministries


def ensure_members(db: Session, households: dict[str, Household], tags: dict[str, Tag], ministries: dict[str, Ministry], priests: dict[str, Priest], actor: User | None) -> None:
    for data in DEMO_MEMBERS:
        username = slugify_username(data["first_name"], data["last_name"])
        member = db.query(Member).filter_by(username=username).first()
        avatar_path = _write_avatar(data["avatar"]) if data.get("avatar") else None
        spouse_payload = data.get("spouse")
        children_payload = data.get("children", [])
        father_confessor_name = data.get("father_confessor")
        if member is None:
            member = Member(
                first_name=data["first_name"],
                middle_name=data.get("middle_name"),
                last_name=data["last_name"],
                username=username,
                email=data.get("email"),
                phone=data.get("phone"),
                baptismal_name=data.get("baptismal_name"),
                birth_date=data.get("birth_date"),
                status=data["status"],
                gender=data.get("gender"),
                marital_status=data.get("marital_status"),
                district=data.get("district"),
                address=data.get("address"),
                address_street=data.get("address_street"),
                address_city=data.get("address_city"),
                address_region=data.get("address_region"),
                address_postal_code=data.get("address_postal_code"),
                address_country=data.get("address_country"),
                join_date=data.get("join_date"),
                is_tither=data.get("is_tither", False),
                pays_contribution=True,
                contribution_method=data.get("contribution_method"),
                contribution_amount=data.get("contribution_amount", Decimal("75.00")),
                contribution_currency="CAD",
                contribution_exception_reason=data.get("contribution_exception_reason"),
                notes=data.get("notes"),
                household_id=households[data["household"]].id,
                avatar_path=avatar_path,
                household_size_override=data.get("household_size_override"),
                has_father_confessor=data.get("has_father_confessor", False),
                created_by_id=actor.id if actor else None,
                updated_by_id=actor.id if actor else None,
            )
            db.add(member)
            db.flush()
        else:
            member.middle_name = data.get("middle_name")
            member.email = data.get("email")
            member.phone = data.get("phone")
            member.status = data["status"]
            member.gender = data.get("gender")
            member.baptismal_name = data.get("baptismal_name")
            member.birth_date = data.get("birth_date")
            member.marital_status = data.get("marital_status")
            member.district = data.get("district")
            member.address = data.get("address")
            member.address_street = data.get("address_street")
            member.address_city = data.get("address_city")
            member.address_region = data.get("address_region")
            member.address_postal_code = data.get("address_postal_code")
            member.address_country = data.get("address_country")
            member.join_date = data.get("join_date")
            member.is_tither = data.get("is_tither", False)
            member.pays_contribution = True
            member.contribution_method = data.get("contribution_method")
            member.contribution_amount = data.get("contribution_amount", Decimal("75.00"))
            member.contribution_currency = "CAD"
            member.contribution_exception_reason = data.get("contribution_exception_reason")
            member.notes = data.get("notes")
            member.household_id = households[data["household"]].id
            member.avatar_path = avatar_path
            member.household_size_override = data.get("household_size_override")
            member.has_father_confessor = data.get("has_father_confessor", False)

        payments = data.get("payments", [])
        if payments:
            existing_signatures = {
                (payment.paid_at, float(payment.amount), payment.method)
                for payment in member.contribution_payments
            }
            for payment in payments:
                signature = (
                    payment["paid_at"],
                    float(payment["amount"]),
                    payment.get("method"),
                )
                if signature in existing_signatures:
                    continue
                db.add(
                    MemberContributionPayment(
                        member_id=member.id,
                        amount=payment["amount"],
                        currency="CAD",
                        paid_at=payment["paid_at"],
                        method=payment.get("method"),
                        note=payment.get("note"),
                        recorded_by_id=actor.id if actor else None,
                    )
                )

        member.tags = [tags[slug] for slug in data["tags"]]
        member.ministries = [ministries[slug] for slug in data["ministries"]]

        apply_spouse(member, spouse_payload)
        apply_children(member, children_payload)

        if data.get("has_father_confessor") and father_confessor_name:
            member.father_confessor = priests.get(father_confessor_name)
        elif father_confessor_name:
            member.father_confessor = priests.get(father_confessor_name)
            member.has_father_confessor = bool(member.father_confessor)
        else:
            member.father_confessor = None
            member.has_father_confessor = False

    db.commit()

    # assign heads
    for name, household in households.items():
        head_member = (
            db.query(Member)
            .filter(Member.household_id == household.id)
            .order_by(Member.created_at.asc())
            .first()
        )
        if head_member:
            household.head_member_id = head_member.id
    db.commit()


def _newcomer_key(first_name: str, last_name: str) -> str:
    return f"{first_name.strip().lower()}::{last_name.strip().lower()}"


def ensure_newcomers(db: Session, members_by_username: dict[str, Member]) -> dict[str, Newcomer]:
    records: dict[str, Newcomer] = {}
    for data in DEMO_NEWCOMERS:
        key = _newcomer_key(data["first_name"], data["last_name"])
        existing = (
            db.query(Newcomer)
            .filter(
                Newcomer.first_name == data["first_name"],
                Newcomer.last_name == data["last_name"],
                Newcomer.arrival_date == data["arrival_date"],
            )
            .first()
        )
        if existing:
            records[key] = existing
            continue

        sponsor = members_by_username.get(data.get("sponsored_by", ""))
        record = Newcomer(
            first_name=data["first_name"],
            last_name=data["last_name"],
            preferred_language=data.get("preferred_language"),
            contact_phone=data.get("contact_phone"),
            contact_email=data.get("contact_email"),
            family_size=data.get("family_size"),
            service_type=data.get("service_type"),
            arrival_date=data["arrival_date"],
            country=data.get("country"),
            temporary_address=data.get("temporary_address"),
            referred_by=data.get("referred_by"),
            notes=data.get("notes"),
            status=data.get("status", "New"),
            sponsored_by_member_id=sponsor.id if sponsor else None,
            followup_due_date=data["arrival_date"] + timedelta(days=7),
        )
        db.add(record)
        db.flush()
        records[key] = record
    db.commit()
    return records


def ensure_sponsorships(db: Session, members_by_username: dict[str, Member], newcomers_by_key: dict[str, Newcomer]) -> None:
    for data in DEMO_SPONSORSHIPS:
        sponsor = members_by_username.get(data["sponsor"])
        if not sponsor:
            continue

        beneficiary = None
        if data.get("beneficiary_username"):
            beneficiary = members_by_username.get(data["beneficiary_username"])

        newcomer = None
        newcomer_info = data.get("newcomer_key")
        if newcomer_info:
            newcomer = newcomers_by_key.get(_newcomer_key(*newcomer_info))

        query = db.query(Sponsorship).filter(
            Sponsorship.sponsor_member_id == sponsor.id,
            Sponsorship.program == data["program"],
        )
        if beneficiary:
            query = query.filter(Sponsorship.beneficiary_member_id == beneficiary.id)
        if newcomer:
            query = query.filter(Sponsorship.newcomer_id == newcomer.id)
        if query.first():
            continue

        beneficiary_name = data.get("beneficiary_name")
        if beneficiary:
            beneficiary_name = f"{beneficiary.first_name} {beneficiary.last_name}"
        elif newcomer:
            beneficiary_name = newcomer.full_name
        if not beneficiary_name:
            beneficiary_name = "Sponsored Family"

        record = Sponsorship(
            sponsor_member_id=sponsor.id,
            beneficiary_member_id=beneficiary.id if beneficiary else None,
            newcomer_id=newcomer.id if newcomer else None,
            beneficiary_name=beneficiary_name,
            monthly_amount=data["monthly_amount"],
            frequency=data["frequency"],
            status=data["status"],
            program=data["program"],
            pledge_channel=data.get("pledge_channel"),
            reminder_channel=data.get("reminder_channel"),
            motivation=data.get("motivation"),
            start_date=data["start_date"],
            notes=data.get("notes"),
            notes_template=data.get("notes_template"),
            budget_month=data.get("budget_month"),
            budget_year=data.get("budget_year"),
            budget_slots=data.get("budget_slots"),
            used_slots=data.get("used_slots", 0),
            last_sponsored_date=data.get("last_sponsored_date"),
        )
        db.add(record)
    db.commit()


def ensure_lessons(db: Session) -> dict[str, Lesson]:
    lessons: dict[str, Lesson] = {}
    for data in DEMO_LESSONS:
        record = db.query(Lesson).filter_by(lesson_code=data["lesson_code"]).first()
        if not record:
            record = Lesson(
                lesson_code=data["lesson_code"],
                title=data["title"],
                level=data["level"],
                duration_minutes=data.get("duration_minutes", 60),
            )
            db.add(record)
            db.flush()
        lessons[data["lesson_code"]] = record
    db.commit()
    return lessons


def ensure_mezmur(db: Session) -> dict[str, Mezmur]:
    groups: dict[str, Mezmur] = {}
    for data in DEMO_MEZMUR:
        record = db.query(Mezmur).filter_by(code=data["code"]).first()
        if not record:
            record = Mezmur(
                code=data["code"],
                title=data["title"],
                language=data["language"],
                category=data["category"],
                rehearsal_day=data["rehearsal_day"],
                conductor_name=data.get("conductor_name"),
                capacity=data.get("capacity"),
            )
            db.add(record)
            db.flush()
        groups[data["code"]] = record
    db.commit()
    return groups


def _seed_pending_invoice(db: Session, enrollment: AbenetEnrollment, actor: User | None) -> None:
    if not actor:
        return
    payload = PaymentCreate(
        amount=settings.ABENET_MONTHLY_AMOUNT,
        currency="CAD",
        method=None,
        memo=f"Pending Abenet tuition for {enrollment.child_first_name} {enrollment.child_last_name}".strip(),
        service_type_code=ABENET_SERVICE_CODE,
        member_id=enrollment.parent_member_id,
        status="Pending",
        due_date=enrollment.enrollment_date,
    )
    payment = payments_service.record_payment(db, payload, actor, auto_commit=False)
    link = AbenetEnrollmentPayment(enrollment_id=enrollment.id, payment_id=payment.id)
    db.add(link)


def ensure_school_enrollments(
    db: Session,
    members_by_username: dict[str, Member],
    mezmur_by_code: dict[str, Mezmur],
    school_admin: User | None = None,
) -> None:
    for data in DEMO_SUNDAY_ENROLLMENTS:
        member = members_by_username.get(data["member_username"])
        if not member:
            continue
        guardian = members_by_username.get(data.get("guardian_username", ""))
        existing = (
            db.query(SundaySchoolEnrollment)
            .filter(SundaySchoolEnrollment.member_id == member.id, SundaySchoolEnrollment.class_level == data["class_level"])
            .first()
        )
        if existing:
            continue
        mezmur = mezmur_by_code.get(data.get("mezmur_code", ""))
        enrollment = SundaySchoolEnrollment(
            member_id=member.id,
            guardian_member_id=guardian.id if guardian else None,
            class_level=data["class_level"],
            status="Enrolled",
            mezmur_id=mezmur.id if mezmur else None,
            enrollment_date=data["enrollment_date"],
            expected_graduation=data.get("expected_graduation", data["enrollment_date"] + timedelta(days=365)),
        )
        db.add(enrollment)

    for data in DEMO_ABENET_ENROLLMENTS:
        parent = members_by_username.get(data["parent_username"])
        if not parent:
            continue
        existing = db.query(AbenetEnrollment).filter(
            AbenetEnrollment.parent_member_id == parent.id,
            AbenetEnrollment.child_first_name == data["child_first_name"],
            AbenetEnrollment.service_stage == data["service_stage"],
        )
        if existing.first():
            continue
        child = next(
            (c for c in parent.children_all if c.first_name == data["child_first_name"] and c.last_name == data["child_last_name"]),
            None,
        )
        enrollment = AbenetEnrollment(
            parent_member_id=parent.id,
            child_id=child.id if child else None,
            child_first_name=data["child_first_name"],
            child_last_name=data["child_last_name"],
            birth_date=data["birth_date"],
            service_stage=data["service_stage"],
            monthly_amount=settings.ABENET_MONTHLY_AMOUNT,
            status="Active",
            enrollment_date=data["enrollment_date"],
            notes=data.get("notes"),
        )
        db.add(enrollment)
        db.flush()
        _seed_pending_invoice(db, enrollment, school_admin)
    db.commit()


def slugify_username(first_name: str, last_name: str) -> str:
    return f"{first_name.lower()}.{last_name.lower()}"


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        users: dict[str, User] = {}
        for role_name in ROLE_NAMES:
            ensure_role(db, role_name)
        for email, full_name, password, roles in DEMO_USERS:
            users[email] = ensure_user(db, email, full_name, password, roles)

        households = ensure_households(db)
        tags = ensure_tags(db)
        priests = ensure_priests(db)
        ministries = ensure_ministries(db)
        admin_user = users.get("admin@example.com")
        ensure_members(db, households, tags, ministries, priests, admin_user)
        payments_service.ensure_default_service_types(db)
        members_by_username = {member.username: member for member in db.query(Member).all()}
        newcomer_records = ensure_newcomers(db, members_by_username)
        ensure_sponsorships(db, members_by_username, newcomer_records)
        ensure_lessons(db)
        mezmur_by_code = ensure_mezmur(db)
        ensure_school_enrollments(db, members_by_username, mezmur_by_code, admin_user)
    finally:
        db.close()


if __name__ == "__main__":
    main()
