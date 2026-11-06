"""API de integración. Sale de aquí el JSON que reciben Cuentas por Pagar, Activos Fijos y (consulta) Planillas.

Modelo: Compras guarda cada aviso en la tabla `evento` (outbox). Hay dos formas de que el otro módulo lo reciba:
  1. PULL: GET /integracion/eventos?destino=...&estado=P  y luego POST /integracion/eventos/{id}/ack
  2. PUSH: POST /integracion/entregar  (Compras llama a la URL del módulo, o al simulador si no hay URL)
Las respuestas de los módulos vuelven por los endpoints /integracion/cxp/* y /integracion/activos-fijos/*."""
import json, os
from datetime import date
from decimal import Decimal
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from .. import config
from ..ctx import Ctx, get_ctx
from ..errors import regla
from ..models import Evento, Comprobante
from ..services import eventos, serial, simulador
from ..services.util import money, bitacora

router = APIRouter(prefix="/integracion")
CONTRATOS = Path(os.getenv("CONTRATOS_DIR", Path(__file__).resolve().parents[3] / "contratos-integracion"))

MODULOS = {
    "cuentas-por-pagar": {
        "nombre": "Cuentas por Pagar", "direccion": "Compras → CxP, y CxP → Compras (estado de pago)",
        "recibe": ["compra.registrada", "compra.anulada"],
        "devuelve": "POST /api/v1/integracion/cxp/estado-pago",
        "resumen": "Cada compra registrada se vuelve una cuenta por pagar con su vencimiento. CxP devuelve el estado de pago."},
    "activos-fijos": {
        "nombre": "Activos Fijos", "direccion": "Compras → Activos Fijos, y Activos Fijos → Compras (alta confirmada)",
        "recibe": ["orden.aprobada", "compra.registrada", "compra.anulada"],
        "devuelve": "POST /api/v1/integracion/activos-fijos/alta-confirmada",
        "resumen": "Compra aprobada y comprobante con clasificación 2 (activo fijo) preparan el alta con su costo."},
    "planillas": {
        "nombre": "Planillas (trabajadores y custodios)", "direccion": "Planillas → Compras (solo lectura)",
        "recibe": [], "devuelve": "GET {PLANILLAS_URL}/trabajadores",
        "resumen": "Compras consulta quién puede solicitar y aprobar. Guarda solo el código del trabajador."},
}


def _ev(c: Ctx, eid: str) -> Evento:
    e = c.db.get(Evento, eid)
    if not e or e.empresa_id != c.empresa.id:
        raise HTTPException(404, "Evento no existe")
    return e


@router.get("/modulos", tags=["Integración"], summary="Mapa de módulos y qué intercambia Compras con cada uno")
def modulos(c: Ctx = Depends(get_ctx)):
    out = []
    for k, v in MODULOS.items():
        evs = list(c.db.scalars(select(Evento).where(Evento.empresa_id == c.empresa.id, Evento.destino == k)))
        out.append({"id": k, **v, "url_configurada": bool(config.MODULOS.get(k)),
                    "pendientes": sum(e.estado == "P" for e in evs), "entregados": sum(e.estado == "E" for e in evs),
                    "fallidos": sum(e.estado == "F" for e in evs)})
    return out


@router.get("/eventos", tags=["Integración"], summary="Eventos de salida (el módulo destino los consulta)")
def listar_eventos(destino: str | None = None, estado: str | None = None, c: Ctx = Depends(get_ctx)):
    q = select(Evento).where(Evento.empresa_id == c.empresa.id).order_by(Evento.registrado_en.desc())
    if destino:
        q = q.where(Evento.destino == destino)
    if estado:
        q = q.where(Evento.estado == estado)
    return [serial.evento(e) for e in c.db.scalars(q)]


@router.get("/eventos/{eid}", tags=["Integración"])
def ver_evento(eid: str, c: Ctx = Depends(get_ctx)):
    return serial.evento(_ev(c, eid))


class AckIn(BaseModel):
    exito: bool = True
    detalle: dict | None = None


@router.post("/eventos/{eid}/ack", tags=["Integración"], summary="El módulo confirma que procesó el evento")
def ack(eid: str, b: AckIn, c: Ctx = Depends(get_ctx)):
    e = _ev(c, eid)
    e.estado, e.respuesta = ("E" if b.exito else "F"), b.detalle
    c.db.commit()
    return serial.evento(e)


@router.post("/entregar", tags=["Integración"], summary="Entrega ahora los eventos pendientes o fallidos")
def entregar(destino: str | None = None, c: Ctx = Depends(get_ctx)):
    evs = eventos.entregar_pendientes(c.db, c.empresa.id, destino)
    c.db.commit()
    return {"procesados": len(evs), "entregados": sum(e.estado == "E" for e in evs),
            "fallidos": sum(e.estado == "F" for e in evs), "eventos": [serial.evento(e) for e in evs]}


@router.post("/eventos/{eid}/reintentar", tags=["Integración"])
def reintentar(eid: str, c: Ctx = Depends(get_ctx)):
    e = eventos.entregar(c.db, _ev(c, eid)); c.db.commit()
    return serial.evento(e)


# ---------- Entradas: lo que devuelven los otros módulos ----------
class EstadoPagoIn(BaseModel):
    comprobante_id: str
    cuenta_por_pagar_id: str
    estado_pago: str = Field(pattern="^(PENDIENTE|PARCIAL|PAGADO|VENCIDO)$")
    saldo: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    fecha_ultimo_pago: date | None = None


@router.post("/cxp/estado-pago", tags=["Integración · Cuentas por Pagar"],
             summary="Cuentas por Pagar informa el estado de pago de una compra")
def estado_pago(b: EstadoPagoIn, c: Ctx = Depends(get_ctx)):
    x = c.db.get(Comprobante, b.comprobante_id)
    if not x or x.empresa_id != c.empresa.id:
        raise HTTPException(404, "Comprobante no existe")
    if x.estado == "A":
        raise regla("RE_CmpInm", "El comprobante está anulado; no admite estado de pago", 409)
    if b.saldo > x.total:
        raise regla("RE_CmpTotSum", "El saldo no puede superar el total del comprobante")
    x.cxp_ref, x.estado_pago, x.saldo_pendiente = b.cuenta_por_pagar_id, b.estado_pago, b.saldo
    bitacora(c.db, c.empresa.id, "COMPROBANTE", x.id, "ESTADO_PAGO", "cuentas-por-pagar",
             {"estado_pago": b.estado_pago, "saldo": money(b.saldo)})
    c.db.commit()
    return serial.cmp(x)["pago"]


class AltaIn(BaseModel):
    comprobante_id: str
    activos: list[str] = Field(min_length=1, description="Códigos de activo creados en Activos Fijos")
    estado: str = Field("ALTA_CONTABILIZADA", pattern="^(ALTA_PENDIENTE|ALTA_CONTABILIZADA)$")
    fecha_alta: date | None = None


@router.post("/activos-fijos/alta-confirmada", tags=["Integración · Activos Fijos"],
             summary="Activos Fijos informa que dio de alta lo comprado")
def alta_confirmada(b: AltaIn, c: Ctx = Depends(get_ctx)):
    x = c.db.get(Comprobante, b.comprobante_id)
    if not x or x.empresa_id != c.empresa.id:
        raise HTTPException(404, "Comprobante no existe")
    if x.clasificacion != "2":
        raise regla("RE_ClaAct", "Este comprobante no es un activo fijo (clasificación distinta de 2)")
    x.activo_estado, x.activo_refs = b.estado, b.activos
    bitacora(c.db, c.empresa.id, "COMPROBANTE", x.id, "ALTA_ACTIVO", "activos-fijos", {"activos": b.activos, "estado": b.estado})
    c.db.commit()
    return serial.cmp(x)["activo"]


# ---------- Contratos (ejemplos reales) ----------
@router.get("/contratos", tags=["Integración"],
            summary="Ejemplos JSON de cada contrato (generados por las pruebas automáticas)")
def contratos():
    out = {}
    if CONTRATOS.exists():
        for f in sorted(CONTRATOS.glob("*.json")):
            out[f.stem] = json.loads(f.read_text(encoding="utf-8"))
    return out
