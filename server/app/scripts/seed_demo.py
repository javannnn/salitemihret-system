from __future__ import annotations

import base64
from datetime import date
from pathlib import Path

from sqlalchemy.orm import Session

from app.auth.security import hash_password
from app.config import UPLOAD_DIR
from app.core.db import Base, SessionLocal, engine
from app.models.household import Household
from app.models.member import Member
from app.models.ministry import Ministry
from app.models.role import Role
from app.models.tag import Tag
from app.models.user import User

ROLE_NAMES = [
    "OfficeAdmin",
    "PublicRelations",
    "FinanceAdmin",
    "SchoolAdmin",
    "SponsorshipCommittee",
    "MediaAdmin",
    "Registrar",
    "Admin",
]

DEMO_USERS = [
    ("pradmin@example.com", "PR Admin", "Demo123!", ["PublicRelations"]),
    ("registrar@example.com", "Registrar", "Demo123!", ["Registrar"]),
    ("clerk@example.com", "Finance Clerk", "Demo123!", ["FinanceAdmin"]),
    ("admin@example.com", "System Admin", "Demo123!", ["Admin"]),
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
        "email": "abeba.tesfaye@example.com",
        "phone": "+251900111001",
        "status": "Active",
        "gender": "Female",
        "district": "Arada",
        "address": "123 Unity Ave",
        "household": "Tesfaye Family",
        "tags": ["choir"],
        "ministries": ["sundayschool"],
        "avatar": "abeba.png",
        "join_date": date(2022, 5, 1),
        "is_tither": True,
    },
    {
        "first_name": "Bekele",
        "middle_name": "M.",
        "last_name": "Desta",
        "email": "bekele.desta@example.com",
        "phone": "+251900111002",
        "status": "Active",
        "gender": "Male",
        "district": "Bole",
        "address": "45 Victory St",
        "household": "Tesfaye Family",
        "tags": ["youth"],
        "ministries": ["pr"],
        "avatar": "bekele.png",
        "join_date": date(2023, 2, 10),
        "is_tither": False,
    },
    {
        "first_name": "Chaltu",
        "middle_name": "A.",
        "last_name": "Hailemariam",
        "email": "chaltu.hailemariam@example.com",
        "phone": "+251900111003",
        "status": "Inactive",
        "gender": "Female",
        "district": "Yeka",
        "address": "12 Harmony Rd",
        "household": "Negash Household",
        "tags": ["media"],
        "ministries": ["pr"],
        "avatar": None,
        "join_date": date(2021, 11, 20),
        "is_tither": True,
    },
    {
        "first_name": "Dawit",
        "middle_name": "K.",
        "last_name": "Negash",
        "email": "dawit.negash@example.com",
        "phone": "+251900111004",
        "status": "Active",
        "gender": "Male",
        "district": "Lideta",
        "address": "78 Jubilee Sq",
        "household": "Negash Household",
        "tags": ["youth", "choir"],
        "ministries": ["sundayschool"],
        "avatar": "dawit.png",
        "join_date": date(2024, 1, 5),
        "is_tither": False,
    },
    {
        "first_name": "Eleni",
        "middle_name": "H.",
        "last_name": "Gebremariam",
        "email": "eleni.gebremariam@example.com",
        "phone": "+251900111005",
        "status": "Active",
        "gender": "Female",
        "district": "Kirkos",
        "address": "9 Unity Plaza",
        "household": "Gebremariam Home",
        "tags": ["media"],
        "ministries": [],
        "avatar": None,
        "join_date": date(2020, 9, 14),
        "is_tither": True,
    },
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
        user = User(email=email, full_name=full_name, hashed_password=hash_password(password))
        db.add(user)
        db.commit()
        db.refresh(user)

    user.roles.clear()
    for role_name in roles:
        user.roles.append(ensure_role(db, role_name))
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


def ensure_members(db: Session, households: dict[str, Household], tags: dict[str, Tag], ministries: dict[str, Ministry], actor: User | None) -> None:
    for data in DEMO_MEMBERS:
        username = slugify_username(data["first_name"], data["last_name"])
        member = db.query(Member).filter_by(username=username).first()
        avatar_path = _write_avatar(data["avatar"]) if data.get("avatar") else None
        if member is None:
            member = Member(
                first_name=data["first_name"],
                middle_name=data.get("middle_name"),
                last_name=data["last_name"],
                username=username,
                email=data.get("email"),
                phone=data.get("phone"),
                status=data["status"],
                gender=data.get("gender"),
                district=data.get("district"),
                address=data.get("address"),
                join_date=data.get("join_date"),
                is_tither=data.get("is_tither", False),
                household_id=households[data["household"]].id,
                avatar_path=avatar_path,
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
            member.district = data.get("district")
            member.address = data.get("address")
            member.join_date = data.get("join_date")
            member.is_tither = data.get("is_tither", False)
            member.household_id = households[data["household"]].id
            member.avatar_path = avatar_path

        member.tags = [tags[slug] for slug in data["tags"]]
        member.ministries = [ministries[slug] for slug in data["ministries"]]

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
        ministries = ensure_ministries(db)
        admin_user = users.get("admin@example.com")
        ensure_members(db, households, tags, ministries, admin_user)
    finally:
        db.close()


if __name__ == "__main__":
    main()
