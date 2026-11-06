"""Registro de Compras 8.1 (libro 080100) - archivo plano de 41 campos separados por '|'."""
from decimal import Decimal
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..models import Comprobante, Empresa
from .util import q2

LIBRO = "080100"


def nombre_archivo(ruc: str, periodo: str, con_info=True, operativa=True, moneda=1) -> str:
    assert len(ruc) == 11 and ruc.isdigit(), "El RUC debe tener 11 dígitos"
    return f"LE{ruc}{periodo}00{LIBRO}00{1 if operativa else 0}{1 if con_info else 0}{moneda}1.TXT"


def _f(d):  # dd/mm/aaaa
    return d.strftime("%d/%m/%Y") if d else ""


def _estado(c: Comprobante) -> str:
    """Campo 41: 1 = emitido en el periodo; 6 = emitido en los 12 meses previos; 7 = más antiguo."""
    emi = c.fecha_emision.year * 12 + c.fecha_emision.month
    per = int(c.periodo[:4]) * 12 + int(c.periodo[4:])
    if emi >= per:
        return "1"
    return "6" if per - emi <= 12 else "7"


def fila(c: Comprobante, n: int) -> list[str]:
    signo = Decimal(-1) if c.tipo == "07" else Decimal(1)           # las notas de crédito van en negativo
    tc = c.tipo_cambio if c.moneda != "PEN" and c.tipo_cambio else Decimal(1)  # importes en soles
    m = lambda x: format(q2(x * tc * signo), "f")
    campos = [""] * 41
    campos[0] = f"{c.periodo}00"
    campos[1] = f"{n:08d}"                    # CUO
    campos[2] = f"M{n:09d}"                   # correlativo del asiento
    campos[3] = _f(c.fecha_emision)
    campos[4] = _f(c.fecha_vencimiento)
    campos[5] = c.tipo
    campos[6] = c.serie
    campos[8] = c.numero
    campos[10] = c.proveedor.tipo_doc
    campos[11] = c.proveedor.numero_doc
    campos[12] = c.proveedor.nombre.replace("|", " ")
    campos[13] = m(c.base)                    # 14 BI gravadas con derecho a crédito
    campos[14] = m(c.igv)                     # 15 IGV
    campos[15] = campos[16] = campos[17] = campos[18] = "0.00"   # 16-19 otras bases e IGV
    campos[19] = m(c.no_gravado)              # 20 adquisiciones no gravadas
    campos[20] = campos[21] = "0.00"          # 21 ISC, 22 otros tributos
    campos[22] = m(c.total)                   # 23 total
    campos[23] = c.moneda                     # 24 moneda
    campos[24] = format(c.tipo_cambio, "f") if c.tipo_cambio else "1.000"  # 25 tipo de cambio
    campos[33] = c.clasificacion              # 34 clasificación Tabla 30
    campos[40] = _estado(c)                   # 41 estado
    return campos


def comprobantes_periodo(db: Session, empresa_id: str, periodo: str) -> list[Comprobante]:
    q = (select(Comprobante).where(Comprobante.empresa_id == empresa_id, Comprobante.periodo == periodo,
                                   Comprobante.estado == "R")  # RE_CmpPle
         .order_by(Comprobante.fecha_emision, Comprobante.serie, Comprobante.numero))
    return list(db.scalars(q))


def generar(db: Session, emp: Empresa, periodo: str) -> dict:
    cmps = comprobantes_periodo(db, emp.id, periodo)
    filas = [fila(c, i) for i, c in enumerate(cmps, 1)]
    txt = "\r\n".join("|".join(f) + "|" for f in filas) + ("\r\n" if filas else "")
    return {"nombre": nombre_archivo(emp.ruc, periodo, con_info=bool(filas)), "filas": filas, "txt": txt,
            "totales": {"comprobantes": len(filas),
                        "base": format(sum((q2(Decimal(f[13])) for f in filas), Decimal(0)), "f"),
                        "igv": format(sum((q2(Decimal(f[14])) for f in filas), Decimal(0)), "f"),
                        "total": format(sum((q2(Decimal(f[22])) for f in filas), Decimal(0)), "f")}}
