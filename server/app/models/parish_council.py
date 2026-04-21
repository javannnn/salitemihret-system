from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, Date, DateTime, Enum, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship

from app.core.db import Base

ParishCouncilDepartmentStatus = Enum("Active", "Inactive", name="parish_council_department_status")
ParishCouncilAssignmentStatus = Enum(
    "Planned",
    "Active",
    "Completed",
    "Cancelled",
    "OnHold",
    name="parish_council_assignment_status",
)
ParishCouncilAssignmentApprovalStatus = Enum(
    "Pending",
    "Approved",
    "Rejected",
    name="parish_council_assignment_approval_status",
)
ParishCouncilAuditEntityType = Enum("Department", "Assignment", name="parish_council_audit_entity_type")


class ParishCouncilDepartment(Base):
    __tablename__ = "parish_council_departments"

    id = Column(Integer, primary_key=True)
    name = Column(String(150), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)
    status = Column(ParishCouncilDepartmentStatus, nullable=False, default="Active", index=True)
    minimum_age = Column(Integer, nullable=False, default=13)
    lead_member_id = Column(Integer, ForeignKey("members.id", ondelete="SET NULL"), nullable=True, index=True)
    lead_first_name = Column(String(100), nullable=True)
    lead_last_name = Column(String(100), nullable=True)
    lead_email = Column(String(255), nullable=True)
    lead_phone = Column(String(40), nullable=True)
    lead_term_start = Column(Date, nullable=True)
    lead_term_end = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    lead_member = relationship("Member", foreign_keys=[lead_member_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
    updated_by = relationship("User", foreign_keys=[updated_by_id])
    assignments = relationship(
        "ParishCouncilAssignment",
        back_populates="department",
        cascade="all, delete-orphan",
        order_by="ParishCouncilAssignment.training_to.asc(), ParishCouncilAssignment.id.desc()",
    )
    audit_events = relationship(
        "ParishCouncilAuditEvent",
        back_populates="department",
        cascade="all, delete-orphan",
        order_by="ParishCouncilAuditEvent.created_at.desc(), ParishCouncilAuditEvent.id.desc()",
    )
    documents = relationship(
        "ParishCouncilDocument",
        back_populates="department",
        cascade="all, delete-orphan",
        order_by="ParishCouncilDocument.created_at.desc(), ParishCouncilDocument.id.desc()",
    )


class ParishCouncilAssignment(Base):
    __tablename__ = "parish_council_assignments"

    id = Column(Integer, primary_key=True)
    department_id = Column(Integer, ForeignKey("parish_council_departments.id", ondelete="CASCADE"), nullable=False, index=True)
    trainee_member_id = Column(Integer, ForeignKey("members.id", ondelete="SET NULL"), nullable=True, index=True)
    trainee_first_name = Column(String(100), nullable=False)
    trainee_last_name = Column(String(100), nullable=False)
    trainee_email = Column(String(255), nullable=True)
    trainee_phone = Column(String(40), nullable=True)
    trainee_birth_date = Column(Date, nullable=True)
    training_from = Column(Date, nullable=False, index=True)
    training_to = Column(Date, nullable=False, index=True)
    status = Column(ParishCouncilAssignmentStatus, nullable=False, default="Planned", index=True)
    approval_status = Column(ParishCouncilAssignmentApprovalStatus, nullable=False, default="Pending", index=True)
    approval_requested_at = Column(DateTime, nullable=True)
    approval_requested_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approval_decided_at = Column(DateTime, nullable=True)
    approval_decided_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approval_note = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    department = relationship("ParishCouncilDepartment", back_populates="assignments")
    trainee_member = relationship("Member", foreign_keys=[trainee_member_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
    updated_by = relationship("User", foreign_keys=[updated_by_id])
    approval_requested_by = relationship("User", foreign_keys=[approval_requested_by_id])
    approval_decided_by = relationship("User", foreign_keys=[approval_decided_by_id])
    audit_events = relationship(
        "ParishCouncilAuditEvent",
        back_populates="assignment",
        cascade="all, delete-orphan",
        order_by="ParishCouncilAuditEvent.created_at.desc(), ParishCouncilAuditEvent.id.desc()",
    )
    documents = relationship(
        "ParishCouncilDocument",
        back_populates="assignment",
        order_by="ParishCouncilDocument.created_at.desc(), ParishCouncilDocument.id.desc()",
    )


class ParishCouncilDocument(Base):
    __tablename__ = "parish_council_documents"

    id = Column(Integer, primary_key=True)
    department_id = Column(Integer, ForeignKey("parish_council_departments.id", ondelete="CASCADE"), nullable=False, index=True)
    assignment_id = Column(Integer, ForeignKey("parish_council_assignments.id", ondelete="SET NULL"), nullable=True, index=True)
    document_type = Column(String(50), nullable=False, default="Other", index=True)
    title = Column(String(160), nullable=True)
    original_filename = Column(String(255), nullable=False)
    file_path = Column(String(255), nullable=False)
    content_type = Column(String(120), nullable=True)
    size_bytes = Column(Integer, nullable=False)
    notes = Column(Text, nullable=True)
    uploaded_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)

    department = relationship("ParishCouncilDepartment", back_populates="documents")
    assignment = relationship("ParishCouncilAssignment", back_populates="documents")
    uploaded_by = relationship("User", foreign_keys=[uploaded_by_id])


class ParishCouncilAuditEvent(Base):
    __tablename__ = "parish_council_audit_events"

    id = Column(Integer, primary_key=True)
    department_id = Column(Integer, ForeignKey("parish_council_departments.id", ondelete="CASCADE"), nullable=True, index=True)
    assignment_id = Column(Integer, ForeignKey("parish_council_assignments.id", ondelete="CASCADE"), nullable=True, index=True)
    entity_type = Column(ParishCouncilAuditEntityType, nullable=False)
    action = Column(String(120), nullable=False)
    summary = Column(String(500), nullable=False)
    before_state = Column(JSON, nullable=True)
    after_state = Column(JSON, nullable=True)
    actor_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)

    department = relationship("ParishCouncilDepartment", back_populates="audit_events")
    assignment = relationship("ParishCouncilAssignment", back_populates="audit_events")
    actor = relationship("User", foreign_keys=[actor_user_id])
