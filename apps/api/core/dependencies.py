from __future__ import annotations

from .settings_access import load_app_settings
from ..services.cases_service import CasesService
from ..services.custom_fields_service import CustomFieldsService
from ..services.finance_service import FinanceService


def get_cases_service() -> CasesService:
    return CasesService(settings=load_app_settings())


def get_finance_service() -> FinanceService:
    return FinanceService(settings=load_app_settings())


def get_custom_fields_service() -> CustomFieldsService:
    return CustomFieldsService(settings=load_app_settings())

