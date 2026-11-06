"""Reglas de negocio del flujo de compra: solicitud -> orden -> recepción -> comprobante."""
from datetime import date, datetime, timezone
from decimal import Decimal
from sqlalchemy import select
from sqlalchemy.orm import Session
from .. import config
from ..errors import regla
from ..models import (Empresa, Proveedor, Articulo, Solicitud, SolicitudDet, OrdenCompra, OrdenCompraDet,
                      RefRecepcion, Comprobante, PeriodoCerrado, Moneda, TipoComprobante, ClasifBienServ,
                      TipoDocIdentidad, TipoOperacion)
from . import eventos, personal
from .util import q2, correlativo, bitacora, periodo_de


# ---------- Proveedores ----------
def validar_documento(tipo: str, numero: str):
    if not numero.isalnum():
        raise regla("RE_PrvIdUni", "El número de documento solo admite letras y dígitos")
    if tipo == "6" and not (len(numero) == 11 and numero.isdigit()):
        raise regla("RN-02", "Un RUC debe tener exactamente 11 dígitos")
    if tipo == "1" and not (len(numero) == 8 and numero.isdigit()):
        raise regla("RN-02", "Un DNI debe tener exactamente 8 dígitos")


def crear_proveedor(db: Session, emp: Empresa, tipo_doc: str, numero_doc: str, nombre: str, usuario: str) -> Proveedor:
    if not db.get(TipoDocIdentidad, tipo_doc):
        raise regla("RE_CatSunat", f"Tipo de documento {tipo_doc} no existe en la Tabla 2")
    numero_doc = numero_doc.strip()
    validar_documento(tipo_doc, numero_doc)
    dup = db.scalar(select(Proveedor).where(Proveedor.empresa_id == emp.id, Proveedor.tipo_doc == tipo_doc,
                                            Proveedor.numero_doc == numero_doc))
    if dup:
        raise regla("RE_PrvDup", "Ya existe un proveedor con ese documento en esta empresa", 409)
    p = Proveedor(empresa_id=emp.id, tipo_doc=tipo_doc, numero_doc=numero_doc, nombre=nombre.strip())
    db.add(p); db.flush()
    return p


# ---------- Solicitudes ----------
def crear_solicitud(db: Session, emp: Empresa, usuario: str, area: str, lineas: list[dict]) -> Solicitud:
    t = personal.buscar(usuario)
    if not t or t["estado"] != "ACTIVO":
        raise regla("RE_SolUsu", f"El solicitante {usuario} no está activo en Planillas")
    if not lineas:
        raise regla("RE_SolDet", "La solicitud necesita al menos un artículo")
    s = Solicitud(empresa_id=emp.id, numero=correlativo(db, Solicitud, emp.id, "SOL"), fecha=date.today(),
                  solicitante=usuario, area=area, estado="PEN")
    for i, l in enumerate(lineas, 1):
        a = db.get(Articulo, l["articulo_id"])
        if not a or a.empresa_id != emp.id or a.estado != "A":
            raise regla("RE_ArtLocal", f"Artículo {l['articulo_id']} no existe o está inactivo")
        s.lineas.append(SolicitudDet(item=i, articulo_id=a.id, cantidad=Decimal(l["cantidad"]), observacion=l.get("observacion")))
    db.add(s); db.flush()
    bitacora(db, emp.id, "SOLICITUD", s.id, "CREAR", usuario)
    return s


def anular_solicitud(db: Session, emp: Empresa, s: Solicitud, usuario: str):
    if s.estado == "ATE":
        raise regla("RE_SolAten", "Una solicitud atendida no se edita; si hay error se anula y se crea otra")
    s.estado = "ANU"
    bitacora(db, emp.id, "SOLICITUD", s.id, "ANULAR", usuario)


# ---------- Órdenes ----------
def _poner_lineas(db: Session, emp: Empresa, o: OrdenCompra, lineas: list[dict]):
    if o.estado != "BOR":
        raise regla("RE_OdtEdit", "Las líneas solo se cambian mientras la orden está en borrador")
    o.lineas.clear(); db.flush()
    for i, l in enumerate(lineas, 1):
        a = db.get(Articulo, l["articulo_id"])
        if not a or a.empresa_id != emp.id or a.estado != "A":
            raise regla("RE_ArtLocal", f"Artículo {l['articulo_id']} no existe o está inactivo")
        o.lineas.append(OrdenCompraDet(item=i, articulo_id=a.id, unidad=l.get("unidad") or a.unidad,
                                       cantidad=Decimal(l["cantidad"]), precio=Decimal(l["precio"])))


def crear_orden(db: Session, emp: Empresa, usuario: str, proveedor_id: str, moneda: str,
                lineas: list[dict], solicitud_id: str | None = None) -> OrdenCompra:
    p = db.get(Proveedor, proveedor_id)
    if not p or p.empresa_id != emp.id:
        raise regla("RE_EmpFiltro", "El proveedor no existe en esta empresa", 404)
    if p.estado != "A":
        raise regla("RE_PrvEst", "Un proveedor inactivo no recibe órdenes nuevas")
    if not db.get(Moneda, moneda):
        raise regla("RN-10", "Moneda no válida (Tabla 4)")
    if not lineas:
        raise regla("RE_OdtCanPos", "La orden necesita al menos una línea")
    sol = None
    if solicitud_id:
        sol = db.get(Solicitud, solicitud_id)
        if not sol or sol.empresa_id != emp.id:
            raise regla("RE_EmpFiltro", "La solicitud no existe en esta empresa", 404)
        if sol.estado != "PEN":
            raise regla("RE_SolAten", "Solo una solicitud pendiente puede convertirse en orden")
    o = OrdenCompra(empresa_id=emp.id, numero=correlativo(db, OrdenCompra, emp.id, "OC"), solicitud_id=solicitud_id,
                    proveedor_id=p.id, moneda=moneda, fecha=date.today(), estado="BOR", creado_por=usuario)
    db.add(o); db.flush()
    _poner_lineas(db, emp, o, lineas)
    if sol:
        sol.estado = "ATE"
    bitacora(db, emp.id, "ORDEN_COMPRA", o.id, "CREAR", usuario)
    db.flush()
    return o


def editar_orden(db: Session, emp: Empresa, o: OrdenCompra, lineas: list[dict], usuario: str):
    _poner_lineas(db, emp, o, lineas)
    bitacora(db, emp.id, "ORDEN_COMPRA", o.id, "EDITAR", usuario)


def enviar_aprobacion(db: Session, emp: Empresa, o: OrdenCompra, usuario: str):
    if o.estado != "BOR":
        raise regla("RE_OrdEst", f"Solo una orden en borrador pasa a aprobación (estado actual: {o.estado})")
    if not o.lineas:
        raise regla("RE_OdtCanPos", "La orden no tiene líneas")
    o.estado = "PEN"
    bitacora(db, emp.id, "ORDEN_COMPRA", o.id, "ENVIAR_APROBACION", usuario)


def aprobar_orden(db: Session, emp: Empresa, o: OrdenCompra, usuario: str):
    t = personal.buscar(usuario)
    if not t or t["estado"] != "ACTIVO" or not t["es_aprobador"]:
        raise regla("RE_OrdApr", "Solo un trabajador activo con permiso de aprobador puede aprobar órdenes", 403)
    if o.estado != "PEN":
        raise regla("RE_OrdEst", f"Solo una orden pendiente se aprueba (estado actual: {o.estado})")
    o.estado, o.aprobado_por, o.aprobado_en = "APR", usuario, datetime.now(timezone.utc)
    bitacora(db, emp.id, "ORDEN_COMPRA", o.id, "APROBAR", usuario)
    ev = eventos.evento_orden_aprobada(db, o, emp)
    return ev


def enviar_a_proveedor(db: Session, emp: Empresa, o: OrdenCompra, usuario: str):
    if o.estado != "APR":
        raise regla("RE_OrdEst", f"Solo una orden aprobada se envía al proveedor (estado actual: {o.estado})")
    o.estado = "ENV"
    bitacora(db, emp.id, "ORDEN_COMPRA", o.id, "ENVIAR_PROVEEDOR", usuario)


def registrar_recepcion(db: Session, emp: Empresa, o: OrdenCompra, ext: str, tipo: str, fecha: date, usuario: str):
    if o.estado not in ("APR", "ENV"):
        raise regla("RE_OrdEst", f"Solo se recibe una orden aprobada o enviada (estado actual: {o.estado})")
    if not ext.strip():
        raise regla("RE_RecRef", "Falta el identificador de la recepción en Almacén")
    if any(r.recepcion_ext == ext for r in o.recepciones):
        raise regla("RE_RecRef", "Esa recepción ya está asociada a la orden", 409)
    o.recepciones.append(RefRecepcion(recepcion_ext=ext, tipo=tipo, fecha=fecha))
    if tipo == "T":
        o.estado = "REC"
    bitacora(db, emp.id, "ORDEN_COMPRA", o.id, "RECEPCION", usuario, {"recepcion": ext, "tipo": tipo})


def anular_orden(db: Session, emp: Empresa, o: OrdenCompra, usuario: str):
    if o.estado in ("REC", "FAC", "ANU") or o.recepciones:
        raise regla("RE_OrdEst", "Una orden con recepción o facturada ya no se puede anular")
    o.estado = "ANU"
    if o.solicitud_id:
        s = db.get(Solicitud, o.solicitud_id)
        if s and s.estado == "ATE":
            s.estado = "PEN"
    bitacora(db, emp.id, "ORDEN_COMPRA", o.id, "ANULAR", usuario)


# ---------- Comprobantes ----------
def _validar_fecha(valor, nombre):
    if not isinstance(valor, date):
        raise regla("RE_CmpEmiVal", f"{nombre} no es una fecha válida (AAAA-MM-DD)")


def registrar_comprobante(db: Session, emp: Empresa, usuario: str, d: dict) -> tuple[Comprobante, list]:
    prov = db.get(Proveedor, d["proveedor_id"])
    if not prov or prov.empresa_id != emp.id:
        raise regla("RE_EmpFiltro", "El proveedor no existe en esta empresa", 404)
    if not db.get(TipoComprobante, d["tipo"]):
        raise regla("RE_CatSunat", "Tipo de comprobante no válido (Tabla 10)")
    if not db.get(Moneda, d["moneda"]):
        raise regla("RN-10", "Moneda no válida (Tabla 4)")
    if not db.get(ClasifBienServ, d["clasificacion"]):
        raise regla("RE_CatSunat", "Clasificación no válida (Tabla 30)")
    top = d.get("tipo_operacion") or "02"
    if not db.get(TipoOperacion, top):
        raise regla("RE_CatSunat", "Tipo de operación no válido (Tabla 12)")

    serie = d["serie"].replace(" ", "").upper()          # RE_CmpSerCan
    numero = d["numero"].strip()                          # RE_CmpNumCan: conserva ceros
    if not serie or not numero:
        raise regla("RE_CmpNumCan", "Serie y número son obligatorios")

    emi, ven = d["fecha_emision"], d.get("fecha_vencimiento")
    if emi > date.today():
        raise regla("RE_CmpEmiVal", "La fecha de emisión no puede ser futura")
    if ven and ven < emi:
        raise regla("RE_CmpEmiVal", "El vencimiento no puede ser anterior a la emisión")

    per = d["periodo"]
    if not (len(per) == 6 and per.isdigit() and 1 <= int(per[4:]) <= 12):
        raise regla("RE_CmpPerAbi", "El periodo debe tener formato AAAAMM")
    if db.get(PeriodoCerrado, (emp.id, per)):
        raise regla("RN-07", f"El periodo {per} está cerrado por Contabilidad")

    base, igv, nog = q2(d["base"]), q2(d["igv"]), q2(d.get("no_gravado") or 0)
    esperado = q2(base * config.TASA_IGV)
    if abs(igv - esperado) > Decimal("0.01"):
        raise regla("RE_CmpIgvCal", f"El IGV debe ser base × {config.TASA_IGV:.0%} = {esperado} (diferencia máxima 0,01)")
    total = base + igv + nog
    if "total" in d and d["total"] is not None and q2(d["total"]) != total:
        raise regla("RE_CmpTotSum", f"El total debe ser base + IGV + no gravado = {total}")
    if total <= 0:
        raise regla("RE_CmpTotSum", "El total debe ser mayor que 0")

    tc = d.get("tipo_cambio")
    if d["moneda"] != "PEN" and (tc is None or Decimal(tc) <= 0):
        raise regla("RE_CmpTipCam", "En moneda extranjera el tipo de cambio es obligatorio y mayor que 0")
    if d["moneda"] == "PEN" and tc is not None:
        raise regla("RE_CmpTipCam", "En soles el tipo de cambio debe ir vacío")

    existe = db.scalar(select(Comprobante).where(
        Comprobante.empresa_id == emp.id, Comprobante.proveedor_id == prov.id, Comprobante.tipo == d["tipo"],
        Comprobante.serie == serie, Comprobante.numero == numero))
    if existe:
        raise regla("RE_CmpUni", f"El comprobante {d['tipo']}-{serie}-{numero} ya está registrado para este proveedor", 409)

    orden = None
    if d.get("orden_id"):
        orden = db.get(OrdenCompra, d["orden_id"])
        if not orden or orden.empresa_id != emp.id:
            raise regla("RE_EmpFiltro", "La orden no existe en esta empresa", 404)
        if orden.proveedor_id != prov.id:
            raise regla("RE_CmpOrd", "El proveedor del comprobante no es el de la orden")
        if orden.estado not in ("APR", "ENV", "REC"):
            raise regla("RE_CmpOrd", f"La orden debe estar aprobada (estado actual: {orden.estado})")
        hay_bienes = any(not l.articulo.es_servicio for l in orden.lineas)
        if hay_bienes and orden.estado != "REC":
            raise regla("RE_CmpOrd", "La orden trae bienes y todavía no tiene recepción total de Almacén")

    c = Comprobante(empresa_id=emp.id, orden_id=orden.id if orden else None, proveedor_id=prov.id, periodo=per,
                    tipo=d["tipo"], serie=serie, numero=numero, fecha_emision=emi, fecha_vencimiento=ven,
                    moneda=d["moneda"], tipo_cambio=Decimal(tc) if tc is not None else None, base=base, igv=igv,
                    no_gravado=nog, total=total, clasificacion=d["clasificacion"], tipo_operacion=top,
                    estado="R", registrado_por=usuario)
    db.add(c); db.flush()
    c.proveedor = prov
    if orden:
        orden.estado = "FAC"
    bitacora(db, emp.id, "COMPROBANTE", c.id, "CREAR", usuario,
             {"clave": f"{c.tipo}-{serie}-{numero}", "total": format(total, "f")})
    evs = eventos.eventos_compra_registrada(db, c, emp)  # misma transacción (RE_CmpAtom)
    return c, evs


def anular_comprobante(db: Session, emp: Empresa, c: Comprobante, motivo: str, usuario: str):
    if c.estado == "A":
        raise regla("RE_CmpInm", "El comprobante ya está anulado", 409)
    if c.estado_pago in ("PAGADO", "PARCIAL"):
        raise regla("RE_CmpInm", "El comprobante tiene pagos en Cuentas por Pagar; extorne el pago antes de anular")
    c.estado = "A"
    if c.orden_id:
        o = db.get(OrdenCompra, c.orden_id)
        if o and o.estado == "FAC":
            o.estado = "REC" if any(not l.articulo.es_servicio for l in o.lineas) else "ENV"
    bitacora(db, emp.id, "COMPROBANTE", c.id, "ANULAR", usuario, {"motivo": motivo})
    return eventos.eventos_compra_anulada(db, c, emp, motivo, usuario)
