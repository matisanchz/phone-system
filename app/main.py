from fastapi import FastAPI
from app.api.phone_system_controller import router as phone_router
from app.api.login_controller import router as login_router

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Opsmind")

app.include_router(prefix="/api", router=phone_router)
app.include_router(prefix="/auth", router=login_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)