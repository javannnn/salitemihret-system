import app.models
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import UPLOAD_DIR
from app.core.config import settings
from app.routers import auth as auth_router
from app.routers import members as members_router
from app.routers import members_bulk as members_bulk_router
from app.routers import members_files as members_files_router
from app.routers import whoami as whoami_router

app = FastAPI(title="SaliteMihret API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(whoami_router.router)
app.include_router(members_files_router.router)
app.include_router(members_bulk_router.router)
app.include_router(members_router.router)
app.mount("/static", StaticFiles(directory=UPLOAD_DIR.parent), name="static")


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}
