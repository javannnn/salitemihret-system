from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.deps import get_current_active_user
from app.core.db import get_db
from app.models.user import User
from app.schemas.ai import (
    AICapabilityRead,
    AIDraftResponse,
    AIReportAnswerResponse,
    AIReportQARequest,
    AIStatusRead,
    NewcomerFollowUpDraftRequest,
)
from app.services.ai.catalog import get_ai_operator_roles
from app.services.ai.providers import AIProviderError
from app.services.ai.service import AITaskDisabledError, AIService, get_ai_service

router = APIRouter(prefix="/ai", tags=["AI"])


def _require_ai_operator(user: User) -> None:
    allowed_roles = set(get_ai_operator_roles())
    user_roles = {role.name for role in user.roles}
    if allowed_roles and not user_roles.intersection(allowed_roles):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")


@router.get("/capabilities", response_model=list[AICapabilityRead])
def get_capabilities(
    current_user: User = Depends(get_current_active_user),
    ai_service: AIService = Depends(get_ai_service),
) -> list[AICapabilityRead]:
    _require_ai_operator(current_user)
    return ai_service.list_capabilities()


@router.get("/status", response_model=AIStatusRead)
def get_status(
    current_user: User = Depends(get_current_active_user),
    ai_service: AIService = Depends(get_ai_service),
) -> AIStatusRead:
    _require_ai_operator(current_user)
    return ai_service.get_status()


@router.post("/drafts/newcomer-follow-up", response_model=AIDraftResponse)
def draft_newcomer_follow_up(
    payload: NewcomerFollowUpDraftRequest,
    current_user: User = Depends(get_current_active_user),
    ai_service: AIService = Depends(get_ai_service),
) -> AIDraftResponse:
    _require_ai_operator(current_user)
    try:
        return ai_service.draft_newcomer_follow_up(payload)
    except AITaskDisabledError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except AIProviderError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.post("/report-qa", response_model=AIReportAnswerResponse)
def answer_report_question(
    payload: AIReportQARequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
    ai_service: AIService = Depends(get_ai_service),
) -> AIReportAnswerResponse:
    _require_ai_operator(current_user)
    try:
        return ai_service.answer_report_question(db, user=current_user, payload=payload)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except AITaskDisabledError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except AIProviderError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
