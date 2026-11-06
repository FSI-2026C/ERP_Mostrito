from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from ..ctx import Ctx, get_ctx
from ..models import Comprobante
from ..services import flujo, serial, ple, eventos

router = APIRouter()


class ComprobanteIn(BaseModel):
    proveedor_id: str
    orden_id: str | None = None
    periodo: str = Field(pattern=r"^\d{6}$", description="AAAAMM")
    tipo: str = Field(min_length=2, max_length=2)
    serie: str = Field(min_length=1, max_length=20)
    numero: str = Field(min_length=1, max_length=20)
    fecha_emision: date
    fecha_vencimiento: date | None = None
    moneda: str = "PEN"
    tipo_cambio: Decimal | None = Field(None, gt=0, max_digits=7, decimal_places=3)
    base: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    igv: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    no_gravado: Decimal = Field(Decimal(0), ge=0, max_digits=14, decimal_places=2)
    total: Decimal | None = Field(None, description="Opcional: si viene, debe ser base + IGV + no gravado")
    clasificacion: str = Field(min_length=1, max_length=1)
    tipo_operacion: str = "02"


class AnularIn(BaseModel):
    motivo: str = Field(min_length=3, max_length=200)


def _cmp(c: Ctx, cid: str) -> Comprobante:
    x = c.db.get(Comprobante, cid)
    if not x or x.empresa_id != c.empresa.id:
        raise HTTPException(404, "Comprobante no existe")
    return x


@router.get("/comprobantes", tags=["Comprobantes"])
def listar(periodo: str | None = None, c: Ctx = Depends(get_ctx)):
    q = select(Comprobante).where(Comprobante.empresa_id == c.empresa.id).order_by(Comprobante.registrado_en.desc())
    if periodo:
        q = q.where(Comprobante.periodo == periodo)
    return [serial.cmp(x) for x in c.db.scalars(q)]


@router.get("/comprobantes/{cid}", tags=["Comprobantes"])
def ver(cid: str, c: Ctx = Depends(get_ctx)):
    return serial.cmp(_cmp(c, cid))


@router.post("/comprobantes", status_code=201, tags=["Comprobantes"],
             summary="Registra el comprobante y deja sus eventos para Cuentas por Pagar y Activos Fijos")
def registrar(b: ComprobanteIn, c: Ctx = Depends(get_ctx)):
    x, evs = flujo.registrar_comprobante(c.db, c.empresa, c.usuario, b.model_dump())
    c.db.commit()
    return {**serial.cmp(x), "eventos_generados": [{"id": e.id, "destino": e.destino, "tipo": e.tipo} for e in evs]}


@router.post("/comprobantes/{cid}/anular", tags=["Comprobantes"])
def anular(cid: str, b: AnularIn, c: Ctx = Depends(get_ctx)):
    x = _cmp(c, cid)
    evs = flujo.anular_comprobante(c.db, c.empresa, x, b.motivo, c.usuario)
    c.db.commit()
    return {**serial.cmp(x), "eventos_generados": [{"id": e.id, "destino": e.destino, "tipo": e.tipo} for e in evs]}


@router.get("/comprobantes/{cid}/estado-pago", tags=["Comprobantes"],
            summary="Estado de pago que devolvió Cuentas por Pagar")
def estado_pago(cid: str, c: Ctx = Depends(get_ctx)):
    return serial.cmp(_cmp(c, cid))["pago"]


# ---------- Registro de Compras 8.1 ----------
@router.get("/registro-compras/{periodo}", tags=["Registro de Compras 8.1"],
            summary="Filas del Registro 8.1 (41 campos) y totales de control")
def registro(periodo: str, c: Ctx = Depends(get_ctx)):
    g = ple.generar(c.db, c.empresa, periodo)
    return {"periodo": periodo, "nombre_archivo": g["nombre"], "totales": g["totales"], "filas": g["filas"]}


@router.get("/registro-compras/{periodo}/txt", tags=["Registro de Compras 8.1"],
            summary="Descarga el archivo plano LE...080100...TXT")
def registro_txt(periodo: str, c: Ctx = Depends(get_ctx)):
    g = ple.generar(c.db, c.empresa, periodo)
    return Response(g["txt"], media_type="text/plain; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{g["nombre"]}"',
                             "Access-Control-Expose-Headers": "Content-Disposition"})
