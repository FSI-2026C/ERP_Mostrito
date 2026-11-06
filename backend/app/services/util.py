from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from ..models import Bitacora


def q2(x) -> Decimal:
    return Decimal(x).quantize(Decimal("0.01"), ROUND_HALF_UP)


def money(x) -> str | None:
    return None if x is None else format(q2(x), "f")


def iso(d):
    if d is None:
        return None
    return d.isoformat()


def correlativo(db: Session, model, empresa_id: str, prefijo: str) -> str:
    n = db.scalar(select(func.count()).select_from(model).where(model.empresa_id == empresa_id)) or 0
    return f"{prefijo}-{n + 1:06d}"


def bitacora(db: Session, empresa_id: str, entidad: str, ref: str, accion: str, usuario: str, detalle=None):
    db.add(Bitacora(empresa_id=empresa_id, entidad=entidad, referencia=ref, accion=accion,
                    usuario=usuario, detalle=detalle))


def periodo_de(d: date) -> str:
    return f"{d.year:04d}{d.month:02d}"
