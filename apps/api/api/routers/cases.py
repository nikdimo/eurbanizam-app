from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from ...core.dependencies import get_cases_service
from ...schemas.cases import (
    CaseCustomFieldDefinition,
    CaseDetail,
    CaseFilterOptions,
    CaseListQueryPayload,
    CaseListItem,
    PaginatedCaseList,
    CaseUpdatePayload,
)


router = APIRouter(tags=["cases"])


@router.get("/cases", response_model=PaginatedCaseList)
def list_cases(
    q: Optional[str] = Query(None, description="Global search text"),
    request_type: Optional[List[str]] = Query(None),
    status: Optional[List[str]] = Query(None),
    date_from: Optional[str] = Query(None, description="ISO date, updated_from"),
    date_to: Optional[str] = Query(None, description="ISO date, updated_to"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    service=Depends(get_cases_service),
):
    return service.list_cases(
        search=q,
        request_types=request_type,
        statuses=status,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )


@router.post("/cases/query", response_model=PaginatedCaseList)
def query_cases(
    payload: CaseListQueryPayload,
    service=Depends(get_cases_service),
):
    return service.list_cases(
        search=payload.q,
        request_types=payload.request_type,
        statuses=payload.status,
        date_from=payload.date_from,
        date_to=payload.date_to,
        limit=payload.limit,
        offset=payload.offset,
    )


@router.get("/cases/custom-fields", response_model=list[str])
def get_custom_fields(service=Depends(get_cases_service)):
    return service.get_custom_field_names()


@router.get("/cases/custom-field-defs", response_model=list[CaseCustomFieldDefinition])
def get_custom_field_definitions(service=Depends(get_cases_service)):
    return service.get_custom_field_definitions()


@router.get("/cases/filter-options", response_model=CaseFilterOptions)
def get_case_filter_options(service=Depends(get_cases_service)):
    return service.get_filter_options()


@router.get("/cases/{case_id}", response_model=CaseDetail)
def get_case(case_id: str, service=Depends(get_cases_service)):
    case = service.get_case(case_id=case_id)
    if case is None:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


@router.patch("/cases/{case_id}", response_model=CaseDetail)
def update_case(
    case_id: str,
    payload: CaseUpdatePayload,
    service=Depends(get_cases_service),
):
    updated = service.update_case(case_id=case_id, payload=payload)
    if updated is None:
        raise HTTPException(status_code=404, detail="Case not found")
    return updated

