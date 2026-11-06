from ..models import *  # noqa
from .util import money, iso


def prov(p):
    return {"id": p.id, "tipo_doc": p.tipo_doc, "numero_doc": p.numero_doc, "nombre": p.nombre, "estado": p.estado}


def art(a):
    return {"id": a.id, "descripcion": a.descripcion, "unidad": a.unidad, "tipo_existencia": a.tipo_existencia,
            "es_servicio": a.es_servicio, "es_activo_fijo": a.es_activo_fijo, "estado": a.estado}


def sol(s):
    return {"id": s.id, "numero": s.numero, "fecha": iso(s.fecha), "solicitante": s.solicitante, "area": s.area,
            "estado": s.estado,
            "lineas": [{"item": l.item, "articulo_id": l.articulo_id, "cantidad": format(l.cantidad, "f"),
                        "observacion": l.observacion} for l in s.lineas]}


def orden(o):
    total = sum((l.cantidad * l.precio for l in o.lineas), 0)
    return {"id": o.id, "numero": o.numero, "solicitud_id": o.solicitud_id, "proveedor_id": o.proveedor_id,
            "proveedor": o.proveedor.nombre, "moneda": o.moneda, "fecha": iso(o.fecha), "estado": o.estado,
            "creado_por": o.creado_por, "aprobado_por": o.aprobado_por,
            "aprobado_en": o.aprobado_en.isoformat() if o.aprobado_en else None,
            "total_sin_igv": money(total),  # RE_OrdTotCal: se calcula, no se guarda
            "lineas": [{"item": l.item, "articulo_id": l.articulo_id, "descripcion": l.articulo.descripcion,
                        "unidad": l.unidad, "cantidad": format(l.cantidad, "f"), "precio": format(l.precio, "f"),
                        "total_linea": money(l.cantidad * l.precio), "es_servicio": l.articulo.es_servicio,
                        "es_activo_fijo": l.articulo.es_activo_fijo} for l in o.lineas],
            "recepciones": [{"recepcion_ext": r.recepcion_ext, "tipo": r.tipo, "fecha": iso(r.fecha)}
                            for r in o.recepciones]}


def cmp(c):
    return {"id": c.id, "orden_id": c.orden_id, "proveedor_id": c.proveedor_id, "proveedor": c.proveedor.nombre,
            "periodo": c.periodo, "tipo": c.tipo, "serie": c.serie, "numero": c.numero,
            "fecha_emision": iso(c.fecha_emision), "fecha_vencimiento": iso(c.fecha_vencimiento),
            "moneda": c.moneda, "tipo_cambio": None if c.tipo_cambio is None else format(c.tipo_cambio, "f"),
            "base": money(c.base), "igv": money(c.igv), "no_gravado": money(c.no_gravado), "total": money(c.total),
            "clasificacion": c.clasificacion, "tipo_operacion": c.tipo_operacion, "estado": c.estado,
            "registrado_por": c.registrado_por,
            "pago": {"estado_pago": c.estado_pago, "cuenta_por_pagar": c.cxp_ref,
                     "saldo_pendiente": money(c.saldo_pendiente)},
            "activo": {"estado": c.activo_estado, "referencias": c.activo_refs}}


ORDEN_CLAVES = ["version", "tipo", "evento_id", "emitido_en", "empresa", "id", "numero", "fecha", "comprobante", "orden",
                "proveedor", "orden_compra", "tipo_comprobante", "serie", "clave_documental", "periodo",
                "fecha_emision", "fecha_vencimiento", "moneda", "tipo_cambio", "base_imponible", "igv", "no_gravado",
                "total", "clasificacion", "estado", "registrado_por", "tipo_documento", "numero_documento", "nombre",
                "razon_social", "ruc", "es_prueba", "activo", "lineas_activo", "requiere_alta", "costo_adquisicion",
                "cuenta_contable_sugerida", "lineas", "item", "articulo_id", "descripcion", "unidad", "cantidad",
                "precio_unitario", "valor_linea", "motivo", "anulado_por"]


def ordenar(x):
    """JSONB no conserva el orden de las llaves; se restituye uno legible para que el contrato se lea de arriba abajo."""
    if isinstance(x, dict):
        rank = {k: i for i, k in enumerate(ORDEN_CLAVES)}
        return {k: ordenar(x[k]) for k in sorted(x, key=lambda k: (rank.get(k, 999), k))}
    if isinstance(x, list):
        return [ordenar(i) for i in x]
    return x


def evento(e):
    return {"id": e.id, "tipo": e.tipo, "destino": e.destino, "referencia": e.referencia, "estado": e.estado,
            "intentos": e.intentos, "registrado_en": e.registrado_en.isoformat() if e.registrado_en else None,
            "contenido": ordenar(e.contenido), "respuesta": ordenar(e.respuesta)}
