from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ...core.dependencies import get_custom_fields_service, get_management_service
from ...core.settings_access import (
    load_app_settings,
    load_finance_settings,
    save_app_settings_keys,
    save_finance_settings_keys,
)
from ...schemas.cases import (
    CaseCustomFieldCreatePayload,
    CaseCustomFieldDefinition,
    CaseCustomFieldUpdatePayload,
)
from ...schemas.finance import FinanceSettingsPayload
from ...schemas.settings import (
    JobActionPayload,
    JobActionResult,
    ProjectManagementState,
    ProjectManagementUpdatePayload,
)


router = APIRouter(tags=["settings"])


class FilterSettingsPayload(BaseModel):
    last_request_type_selection: Optional[list[str]] = Field(default=None)
    last_status_selection: Optional[list[str]] = Field(default=None)
    last_date_range: Optional[dict] = Field(default=None)
    last_search_text: Optional[str] = Field(default=None)


@router.get("/settings")
def get_settings():
    return load_app_settings()


@router.get("/finance/settings")
def get_finance_settings():
    return load_finance_settings()


@router.patch("/finance/settings")
def update_finance_settings(payload: FinanceSettingsPayload):
    updates = payload.model_dump(exclude_none=True)
    return save_finance_settings_keys(updates)


@router.get("/settings/management", response_model=ProjectManagementState)
def get_management_state(service=Depends(get_management_service)):
    return service.get_management_state()


@router.patch("/settings/management", response_model=ProjectManagementState)
def update_management_settings(
    payload: ProjectManagementUpdatePayload,
    service=Depends(get_management_service),
):
    return service.update_project_settings(payload)


@router.post("/settings/management/jobs/{job_name}", response_model=JobActionResult)
def run_management_job(
    job_name: str,
    payload: JobActionPayload,
    service=Depends(get_management_service),
):
    try:
        return service.run_job_action(job_name, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/settings/filters")
def update_filter_settings(payload: FilterSettingsPayload):
    updates = payload.model_dump(exclude_none=True)
    return save_app_settings_keys(updates)


@router.get("/custom-fields", response_model=list[CaseCustomFieldDefinition])
def list_custom_fields(
    scope: Optional[str] = Query(None),
    enabled_only: bool = Query(False),
    service=Depends(get_custom_fields_service),
):
    return service.list_definitions(scope=scope, enabled_only=enabled_only)


@router.post("/custom-fields", response_model=CaseCustomFieldDefinition)
def create_custom_field(
    payload: CaseCustomFieldCreatePayload,
    service=Depends(get_custom_fields_service),
):
    try:
        return service.create_definition(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/custom-fields/{field_name}", response_model=CaseCustomFieldDefinition)
def update_custom_field(
    field_name: str,
    payload: CaseCustomFieldUpdatePayload,
    service=Depends(get_custom_fields_service),
):
    try:
        return service.update_definition(field_name, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

