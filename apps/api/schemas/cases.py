from __future__ import annotations

from typing import Dict, Optional

from pydantic import BaseModel, Field


class CaseListItem(BaseModel):
    case_id: str
    title: Optional[str] = None
    status: Optional[str] = None
    request_type: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    prev_change_at: Optional[str] = None
    first_seen: Optional[str] = None
    days_since_update: Optional[int] = None
    phone: Optional[str] = None
    latest_document_name: Optional[str] = None
    custom_fields: Dict[str, Optional[str]] = Field(default_factory=dict)


class CaseDetail(CaseListItem):
    pass


class CaseCustomFieldDefinition(BaseModel):
    name: str
    type: str = "Text"
    options: list[str] = Field(default_factory=list)
    enabled: bool = True
    scope: str = "case"


class CaseUpdatePayload(BaseModel):
    status: Optional[str] = None
    title: Optional[str] = None
    request_type: Optional[str] = None
    phone: Optional[str] = None
    custom_fields: Dict[str, Optional[str]] = Field(default_factory=dict)


class CaseCustomFieldCreatePayload(BaseModel):
    name: str
    type: str = "Text"
    options: list[str] = Field(default_factory=list)
    enabled: bool = True
    scope: str = "case"


class CaseCustomFieldUpdatePayload(BaseModel):
    name: str
    type: str = "Text"
    options: list[str] = Field(default_factory=list)
    enabled: bool = True


class CaseFilterOptions(BaseModel):
    request_types: list[str] = Field(default_factory=list)
    statuses: list[str] = Field(default_factory=list)


class PaginatedCaseList(BaseModel):
    items: list[CaseListItem] = Field(default_factory=list)
    total: int = 0
    limit: int = 0
    offset: int = 0
