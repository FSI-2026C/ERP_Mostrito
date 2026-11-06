"""Módulos vecinos simulados. Reemplazables: cuando el otro equipo publique su API, se define su URL
(CXP_URL, ACTIVOS_URL, PLANILLAS_URL) y Compras deja de usar estas funciones."""
from decimal import Decimal

TRABAJADORES = [
    {"trabajador_id": "T-001", "nombres": "Ana Quispe Rojas", "area": "Logística", "cargo": "Compradora",
     "es_aprobador": False, "estado": "ACTIVO", "fecha_cese": None},
    {"trabajador_id": "T-002", "nombres": "Luis Mamani Flores", "area": "Sistemas", "cargo": "Analista de soporte",
     "es_aprobador": False, "estado": "ACTIVO", "fecha_cese": None},
    {"trabajador_id": "T-003", "nombres": "Carla Huanca Díaz", "area": "Gerencia", "cargo": "Gerente administrativa",
     "es_aprobador": True, "estado": "ACTIVO", "fecha_cese": None},
    {"trabajador_id": "T-004", "nombres": "Jorge Ccori Mendoza", "area": "Almacén", "cargo": "Jefe de almacén",
     "es_aprobador": False, "estado": "CESADO", "fecha_cese": "2026-09-30"},
]


def planillas_trabajadores():
    return TRABAJADORES


def cxp_recibir_compra(payload: dict) -> dict:
    """Cuentas por Pagar crea la cuenta por pagar y contesta con su referencia."""
    c = payload["comprobante"]
    return {"aceptado": True, "cuenta_por_pagar_id": "CXP-" + c["id"][:8].upper(),
            "estado_pago": "PENDIENTE", "saldo": c["total"], "vencimiento": c["fecha_vencimiento"]}


def cxp_recibir_anulacion(payload: dict) -> dict:
    return {"aceptado": True, "accion": "cuenta por pagar anulada"}


def af_recibir_compra(payload: dict) -> dict:
    """Activos Fijos prepara el alta con el costo recibido."""
    a = payload["activo"]
    return {"aceptado": True, "alta_pendiente_id": "AF-" + payload["comprobante"]["id"][:8].upper(),
            "costo_adquisicion": a["costo_adquisicion"]}


def af_recibir_orden(payload: dict) -> dict:
    return {"aceptado": True, "reserva_alta_id": "AFR-" + payload["orden"]["id"][:8].upper()}


def af_recibir_anulacion(payload: dict) -> dict:
    return {"aceptado": True, "accion": "alta pendiente cancelada"}
