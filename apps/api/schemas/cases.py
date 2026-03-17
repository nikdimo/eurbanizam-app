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


class CaseCreateFinanceSeed(BaseModel):
    """Optional fields written to finance_cases when creating a manual case."""

    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    service_type: Optional[str] = None
    contract_sum: Optional[float] = None
    currency: Optional[str] = None
    paid_amount: Optional[float] = None
    notes: Optional[str] = None


class CaseCreatePayload(BaseModel):
    title: str
    status: Optional[str] = None
    request_type: Optional[str] = None
    phone: Optional[str] = None
    custom_fields: Dict[str, Optional[str]] = Field(default_factory=dict)
    finance: Optional[CaseCreateFinanceSeed] = None


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


class CaseListQueryPayload(BaseModel):
    q: Optional[str] = None
    request_type: list[str] = Field(default_factory=list)
    status: list[str] = Field(default_factory=list)
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    limit: int = Field(default=100, ge=1, le=10000)
    offset: int = Field(default=0, ge=0)
    sort_by: Optional[str] = None
    sort_desc: bool = True


class PaginatedCaseList(BaseModel):
    items: list[CaseListItem] = Field(default_factory=list)
    total: int = 0
    limit: int = 0
    offset: int = 0
