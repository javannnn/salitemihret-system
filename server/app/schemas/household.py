from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field, validator


class HouseholdBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    head_member_id: Optional[int] = Field(None, ge=1)


class HouseholdCreate(HouseholdBase):
    pass


class HouseholdUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=150)
    head_member_id: Optional[int] = Field(None, ge=1)


class HouseholdOut(BaseModel):
    id: int
    name: str
    head_member_id: Optional[int]
    members_count: int = 0

    class Config:
        from_attributes = True


class HouseholdMemberRef(BaseModel):
    id: int
    first_name: str
    last_name: str

    class Config:
        from_attributes = True


class HouseholdListItem(HouseholdOut):
    head_member_name: Optional[str] = None


class HouseholdDetail(HouseholdListItem):
    members: List[HouseholdMemberRef]


class HouseholdListResponse(BaseModel):
    items: List[HouseholdListItem]
    total: int
    page: int
    page_size: int


class HouseholdMemberAssignment(BaseModel):
    member_ids: List[int] = Field(default_factory=list)
    head_member_id: Optional[int] = Field(None, ge=1)

    @validator("member_ids")
    def validate_member_ids(cls, value: List[int]) -> List[int]:
        if len(set(value)) != len(value):
            raise ValueError("Duplicate member ids detected")
        return value
