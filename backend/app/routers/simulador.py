"""Módulos vecinos de mentira. Sirven para ver el ciclo completo mientras los otros equipos publican su API."""
from fastapi import APIRouter, Body, Depends
from ..ctx import Ctx, get_ctx
from ..models import Comprobante
from ..services import simulador as sim
from ..services.util import money

router = APIRouter(prefix="/simulador", tags=["Simulador de módulos vecinos"])


@router.get("/planillas/trabajadores")
def trabajadores():
    return sim.planillas_trabajadores()


@router.post("/cxp/pagar/{comprobante_id}", summary="Simula que Cuentas por Pagar paga (total o parcial) y avisa a Compras")
def pagar(comprobante_id: str, parcial: bool = False, c: Ctx = Depends(get_ctx)):
    x = c.db.get(Comprobante, comprobante_id)
    from fastapi import HTTPException
    if not x or x.empresa_id != c.empresa.id:
        raise HTTPException(404, "Comprobante no existe")
    from datetime import date
    from decimal import Decimal
    saldo = (x.total / 2).quantize(Decimal("0.01")) if parcial else Decimal("0.00")
    body = {"comprobante_id": x.id, "cuenta_por_pagar_id": x.cxp_ref or "CXP-" + x.id[:8].upper(),
            "estado_pago": "PARCIAL" if parcial else "PAGADO", "saldo": money(saldo),
            "fecha_ultimo_pago": date.today().isoformat()}
    from .integracion import estado_pago, EstadoPagoIn
    return {"enviado_a_compras": body, "respuesta": estado_pago(EstadoPagoIn(**body), c)}


@router.post("/activos-fijos/alta/{comprobante_id}", summary="Simula el alta contabilizada en Activos Fijos y avisa a Compras")
def alta(comprobante_id: str, c: Ctx = Depends(get_ctx)):
    from .integracion import alta_confirmada, AltaIn
    from fastapi import HTTPException
    x = c.db.get(Comprobante, comprobante_id)
    if not x or x.empresa_id != c.empresa.id:
        raise HTTPException(404, "Comprobante no existe")
    body = {"comprobante_id": x.id, "activos": ["AF-" + x.id[:6].upper() + "-001"], "estado": "ALTA_CONTABILIZADA",
            "fecha_alta": __import__("datetime").date.today().isoformat()}
    return {"enviado_a_compras": body, "respuesta": alta_confirmada(AltaIn(**body), c)}
