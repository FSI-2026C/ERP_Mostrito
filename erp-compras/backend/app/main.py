from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from .db import init_schema, SessionLocal
from .routers import maestros, compras, comprobantes, integracion, simulador
from . import seed


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_schema()
    with SessionLocal() as db:
        seed.seed_inicial(db)
    yield


app = FastAPI(
    title="ERP académico · Módulo de Compras",
    version="1.0.0",
    description=("Tribu Egresos. Compras entrega eventos JSON a **Cuentas por Pagar** y **Activos Fijos** y consulta "
                 "trabajadores a **Planillas**. Todas las rutas requieren el encabezado `X-Empresa`; `X-Usuario` es el "
                 "código de trabajador en Planillas."),
    lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
                   expose_headers=["Content-Disposition"])

for r in (maestros.router, compras.router, comprobantes.router, integracion.router, simulador.router):
    app.include_router(r, prefix="/api/v1")


@app.exception_handler(HTTPException)
async def http_error(_: Request, e: HTTPException):
    d = e.detail if isinstance(e.detail, dict) else {"regla": None, "mensaje": str(e.detail)}
    return JSONResponse({"error": d}, status_code=e.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, e: RequestValidationError):
    campos = [{"campo": ".".join(str(p) for p in x["loc"][1:]), "mensaje": x["msg"]} for x in e.errors()]
    return JSONResponse({"error": {"regla": "VALIDACION", "mensaje": "Hay datos con formato inválido", "campos": campos}}, status_code=422)


@app.exception_handler(IntegrityError)
async def integrity_error(_: Request, e: IntegrityError):
    return JSONResponse({"error": {"regla": "INTEGRIDAD", "mensaje": "La base de datos rechazó el registro por una restricción"}}, status_code=409)


@app.get("/api/v1/salud", tags=["Sistema"])
def salud():
    return {"ok": True}
