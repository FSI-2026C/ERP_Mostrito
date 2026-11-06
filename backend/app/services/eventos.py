"""Contratos de integración: arma el JSON que Compras entrega a cada módulo y lo deja en la tabla
`evento` (outbox) dentro de la MISMA transacción del comprobante/orden (RE_CmpAtom)."""
from datetime import datetime, timezone
from decimal import Decimal
import httpx
from sqlalchemy.orm import Session
from sqlalchemy import select
from .. import config
from ..models import (Evento, Empresa, Comprobante, OrdenCompra, ClasifBienServ, UnidadMedida)
from . import simulador
from .util import money, iso

VERSION = "1.0"
CXP, AF = "cuentas-por-pagar", "activos-fijos"


def _cabecera(tipo: str, emp: Empresa) -> dict:
    return {"version": VERSION, "tipo": tipo, "emitido_en": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "empresa": {"id": emp.id, "ruc": emp.ruc, "razon_social": emp.razon_social,
                        "es_prueba": emp.es_prueba == "S"}}


def _proveedor(p) -> dict:
    return {"id": p.id, "tipo_documento": p.tipo_doc, "numero_documento": p.numero_doc, "nombre": p.nombre}


def _comprobante(db: Session, c: Comprobante) -> dict:
    cla = db.get(ClasifBienServ, c.clasificacion)
    return {
        "id": c.id, "tipo_comprobante": c.tipo, "serie": c.serie, "numero": c.numero,
        "clave_documental": f"{c.tipo}-{c.serie}-{c.numero}",
        "periodo": c.periodo, "fecha_emision": iso(c.fecha_emision), "fecha_vencimiento": iso(c.fecha_vencimiento),
        "moneda": c.moneda, "tipo_cambio": None if c.tipo_cambio is None else format(c.tipo_cambio, "f"),
        "base_imponible": money(c.base), "igv": money(c.igv), "no_gravado": money(c.no_gravado),
        "total": money(c.total),
        "clasificacion": {"codigo": c.clasificacion, "descripcion": cla.descripcion if cla else None},
        "estado": c.estado, "registrado_por": c.registrado_por,
    }


def _lineas_orden(o: OrdenCompra, solo_activos=False) -> list[dict]:
    out = []
    for l in o.lineas:
        if solo_activos and not l.articulo.es_activo_fijo:
            continue
        out.append({"item": l.item, "articulo_id": l.articulo_id, "descripcion": l.articulo.descripcion,
                    "unidad": l.unidad, "cantidad": format(l.cantidad, "f"), "precio_unitario": format(l.precio, "f"),
                    "valor_linea": money(l.cantidad * l.precio)})
    return out


def eventos_compra_registrada(db: Session, c: Comprobante, emp: Empresa) -> list[Evento]:
    base = {**_cabecera("compra.registrada", emp), "evento_id": None,
            "comprobante": _comprobante(db, c), "proveedor": _proveedor(c.proveedor),
            "orden_compra": None}
    orden = db.get(OrdenCompra, c.orden_id) if c.orden_id else None
    if orden:
        base["orden_compra"] = {"id": orden.id, "numero": orden.numero}
    evs = []
    # 1) Cuentas por Pagar: siempre
    evs.append(Evento(empresa_id=emp.id, tipo="compra.registrada", referencia=c.id, destino=CXP, contenido=dict(base)))
    # 2) Activos Fijos: solo si la clasificación es 2 (RE_ClaAct)
    if c.clasificacion == "2":
        costo = c.base + c.no_gravado  # el IGV con derecho a crédito no forma parte del costo
        af = dict(base)
        af["activo"] = {"requiere_alta": True, "costo_adquisicion": money(costo), "moneda": c.moneda,
                        "cuenta_contable_sugerida": "33",
                        "lineas": _lineas_orden(orden, solo_activos=True) if orden else []}
        evs.append(Evento(empresa_id=emp.id, tipo="compra.registrada", referencia=c.id, destino=AF, contenido=af))
    for e in evs:
        db.add(e); db.flush()
        e.contenido = {**e.contenido, "evento_id": e.id}
    return evs


def evento_orden_aprobada(db: Session, o: OrdenCompra, emp: Empresa) -> Evento | None:
    lineas = _lineas_orden(o, solo_activos=True)
    if not lineas:
        return None  # solo se avisa a Activos Fijos cuando la orden trae activos
    total = sum((l.cantidad * l.precio for l in o.lineas if l.articulo.es_activo_fijo), Decimal(0))
    p = {**_cabecera("orden.aprobada", emp),
         "orden": {"id": o.id, "numero": o.numero, "fecha": iso(o.fecha), "moneda": o.moneda,
                   "aprobada_por": o.aprobado_por, "aprobada_en": o.aprobado_en.isoformat() if o.aprobado_en else None,
                   "valor_estimado_activos": money(total)},
         "proveedor": _proveedor(o.proveedor), "lineas_activo": lineas}
    e = Evento(empresa_id=emp.id, tipo="orden.aprobada", referencia=o.id, destino=AF, contenido=p)
    db.add(e); db.flush()
    e.contenido = {**p, "evento_id": e.id}
    return e


def eventos_compra_anulada(db: Session, c: Comprobante, emp: Empresa, motivo: str, usuario: str) -> list[Evento]:
    base = {**_cabecera("compra.anulada", emp),
            "comprobante": {"id": c.id, "clave_documental": f"{c.tipo}-{c.serie}-{c.numero}", "periodo": c.periodo,
                            "total": money(c.total), "estado": "A"},
            "motivo": motivo, "anulado_por": usuario}
    destinos = [CXP] + ([AF] if c.clasificacion == "2" else [])
    evs = []
    for d in destinos:
        e = Evento(empresa_id=emp.id, tipo="compra.anulada", referencia=c.id, destino=d, contenido=dict(base))
        db.add(e); db.flush()
        e.contenido = {**base, "evento_id": e.id}
        evs.append(e)
    return evs


# ---------- Entrega ----------
def _llamar(destino: str, ev: Evento) -> dict:
    url = config.MODULOS.get(destino)
    if url:  # módulo real
        r = httpx.post(f"{url.rstrip('/')}/compras/eventos", json=ev.contenido, timeout=10)
        r.raise_for_status()
        return r.json()
    f = {(CXP, "compra.registrada"): simulador.cxp_recibir_compra,
         (CXP, "compra.anulada"): simulador.cxp_recibir_anulacion,
         (AF, "compra.registrada"): simulador.af_recibir_compra,
         (AF, "orden.aprobada"): simulador.af_recibir_orden,
         (AF, "compra.anulada"): simulador.af_recibir_anulacion}[(destino, ev.tipo)]
    return {"simulado": True, **f(ev.contenido)}


def entregar(db: Session, ev: Evento) -> Evento:
    ev.intentos += 1
    try:
        resp = _llamar(ev.destino, ev)
        ev.estado, ev.respuesta = "E", resp
        _aplicar_respuesta(db, ev, resp)
    except Exception as ex:  # RE_EvtRein: un evento fallido no se borra, se reintenta
        ev.estado, ev.respuesta = "F", {"error": str(ex)}
    return ev


def _aplicar_respuesta(db: Session, ev: Evento, resp: dict):
    if ev.tipo != "compra.registrada":
        return
    c = db.get(Comprobante, ev.referencia)
    if ev.destino == CXP and resp.get("cuenta_por_pagar_id"):
        c.cxp_ref = resp["cuenta_por_pagar_id"]
        c.estado_pago = resp.get("estado_pago", "PENDIENTE")
        c.saldo_pendiente = Decimal(resp.get("saldo", c.total))
    if ev.destino == AF and resp.get("alta_pendiente_id"):
        c.activo_estado = "ALTA_PENDIENTE"
        c.activo_refs = [resp["alta_pendiente_id"]]


def entregar_pendientes(db: Session, empresa_id: str, destino: str | None = None) -> list[Evento]:
    q = select(Evento).where(Evento.empresa_id == empresa_id, Evento.estado.in_(["P", "F"]))
    if destino:
        q = q.where(Evento.destino == destino)
    return [entregar(db, e) for e in db.scalars(q.order_by(Evento.registrado_en))]
