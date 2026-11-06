"""Contexto de la petición: empresa y usuario (RE_EmpFiltro: todo ocurre dentro de una empresa)."""
from dataclasses import dataclass
from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session
from .db import get_db
from .models import Empresa


@dataclass
class Ctx:
    db: Session
    empresa: Empresa
    usuario: str


def get_ctx(x_empresa: str = Header(..., description="Código de empresa (emp_cod)"),
            x_usuario: str = Header("T-001", description="Código de trabajador en Planillas"),
            db: Session = Depends(get_db)) -> Ctx:
    emp = db.get(Empresa, x_empresa)
    if not emp or emp.estado != "A":
        raise HTTPException(404, {"regla": "RN-01", "mensaje": "Empresa no existe o está inactiva"})
    return Ctx(db, emp, x_usuario)
