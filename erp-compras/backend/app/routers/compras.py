from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from ..ctx import Ctx, get_ctx
from ..models import Solicitud, OrdenCompra, Bitacora
from ..services import flujo, serial

router = APIRouter()


# ---------- Solicitudes ----------
class LineaSol(BaseModel):
    articulo_id: str
    cantidad: Decimal = Field(gt=0, max_digits=14, decimal_places=3)
    observacion: str | None = Field(None, max_length=200)


class SolicitudIn(BaseModel):
    area: str = Field(min_length=1, max_length=100)
    lineas: list[LineaSol]


@router.get("/solicitudes", tags=["Solicitudes"])
def listar_solicitudes(c: Ctx = Depends(get_ctx)):
    q = select(Solicitud).where(Solicitud.empresa_id == c.empresa.id).order_by(Solicitud.registrado_en.desc())
    return [serial.sol(s) for s in c.db.scalars(q)]


@router.post("/solicitudes", status_code=201, tags=["Solicitudes"],
             summary="Crea la solicitud; el solicitante (X-Usuario) se valida contra Planillas")
def crear_solicitud(b: SolicitudIn, c: Ctx = Depends(get_ctx)):
    s = flujo.crear_solicitud(c.db, c.empresa, c.usuario, b.area, [l.model_dump() for l in b.lineas])
    c.db.commit()
    return serial.sol(s)


@router.post("/solicitudes/{sid}/anular", tags=["Solicitudes"])
def anular_solicitud(sid: str, c: Ctx = Depends(get_ctx)):
    s = c.db.get(Solicitud, sid)
    if not s or s.empresa_id != c.empresa.id:
        raise HTTPException(404, "Solicitud no existe")
    flujo.anular_solicitud(c.db, c.empresa, s, c.usuario)
    c.db.commit()
    return serial.sol(s)


# ---------- Órdenes ----------
class LineaOrd(BaseModel):
    articulo_id: str
    unidad: str | None = None
    cantidad: Decimal = Field(gt=0, max_digits=14, decimal_places=3)
    precio: Decimal = Field(ge=0, max_digits=14, decimal_places=4)


class OrdenIn(BaseModel):
    proveedor_id: str
    moneda: str = "PEN"
    solicitud_id: str | None = None
    lineas: list[LineaOrd]


class OrdenEdit(BaseModel):
    lineas: list[LineaOrd]


class RecepcionIn(BaseModel):
    recepcion_ext: str = Field(min_length=1, max_length=128)
    tipo: str = Field(pattern="^[PT]$")
    fecha: date = Field(default_factory=date.today)


def _orden(c: Ctx, oid: str) -> OrdenCompra:
    o = c.db.get(OrdenCompra, oid)
    if not o or o.empresa_id != c.empresa.id:
        raise HTTPException(404, "Orden no existe")
    return o


@router.get("/ordenes", tags=["Órdenes de compra"])
def listar_ordenes(estado: str | None = None, c: Ctx = Depends(get_ctx)):
    q = select(OrdenCompra).where(OrdenCompra.empresa_id == c.empresa.id).order_by(OrdenCompra.registrado_en.desc())
    if estado:
        q = q.where(OrdenCompra.estado == estado)
    return [serial.orden(o) for o in c.db.scalars(q)]


@router.get("/ordenes/{oid}", tags=["Órdenes de compra"])
def ver_orden(oid: str, c: Ctx = Depends(get_ctx)):
    return serial.orden(_orden(c, oid))


@router.post("/ordenes", status_code=201, tags=["Órdenes de compra"])
def crear_orden(b: OrdenIn, c: Ctx = Depends(get_ctx)):
    o = flujo.crear_orden(c.db, c.empresa, c.usuario, b.proveedor_id, b.moneda,
                          [l.model_dump() for l in b.lineas], b.solicitud_id)
    c.db.commit()
    return serial.orden(o)


@router.put("/ordenes/{oid}", tags=["Órdenes de compra"], summary="Cambia líneas (solo en borrador)")
def editar_orden(oid: str, b: OrdenEdit, c: Ctx = Depends(get_ctx)):
    o = _orden(c, oid)
    flujo.editar_orden(c.db, c.empresa, o, [l.model_dump() for l in b.lineas], c.usuario)
    c.db.commit()
    return serial.orden(o)


@router.post("/ordenes/{oid}/enviar-aprobacion", tags=["Órdenes de compra"])
def enviar_aprobacion(oid: str, c: Ctx = Depends(get_ctx)):
    o = _orden(c, oid); flujo.enviar_aprobacion(c.db, c.empresa, o, c.usuario); c.db.commit()
    return serial.orden(o)


@router.post("/ordenes/{oid}/aprobar", tags=["Órdenes de compra"],
             summary="Aprueba la orden; si trae activos fijos deja el evento orden.aprobada para Activos Fijos")
def aprobar(oid: str, c: Ctx = Depends(get_ctx)):
    o = _orden(c, oid); ev = flujo.aprobar_orden(c.db, c.empresa, o, c.usuario); c.db.commit()
    return {**serial.orden(o), "evento_generado": None if ev is None else {"id": ev.id, "destino": ev.destino}}


@router.post("/ordenes/{oid}/enviar-proveedor", tags=["Órdenes de compra"])
def enviar_proveedor(oid: str, c: Ctx = Depends(get_ctx)):
    o = _orden(c, oid); flujo.enviar_a_proveedor(c.db, c.empresa, o, c.usuario); c.db.commit()
    return serial.orden(o)


@router.post("/ordenes/{oid}/recepciones", status_code=201, tags=["Órdenes de compra"],
             summary="Asocia una recepción de Almacén (solo guarda el identificador)")
def recepcion(oid: str, b: RecepcionIn, c: Ctx = Depends(get_ctx)):
    o = _orden(c, oid)
    flujo.registrar_recepcion(c.db, c.empresa, o, b.recepcion_ext, b.tipo, b.fecha, c.usuario); c.db.commit()
    return serial.orden(o)


@router.post("/ordenes/{oid}/anular", tags=["Órdenes de compra"])
def anular(oid: str, c: Ctx = Depends(get_ctx)):
    o = _orden(c, oid); flujo.anular_orden(c.db, c.empresa, o, c.usuario); c.db.commit()
    return serial.orden(o)


@router.get("/bitacora", tags=["Bitácora"])
def bitacora(limit: int = 50, c: Ctx = Depends(get_ctx)):
    q = select(Bitacora).where(Bitacora.empresa_id == c.empresa.id).order_by(Bitacora.instante.desc()).limit(limit)
    return [{"id": b.id, "entidad": b.entidad, "referencia": b.referencia, "accion": b.accion, "usuario": b.usuario,
             "detalle": b.detalle, "instante": b.instante.isoformat()} for b in c.db.scalars(q)]
