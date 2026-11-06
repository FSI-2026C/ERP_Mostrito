from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from ..ctx import Ctx, get_ctx
from ..db import get_db
from ..errors import regla
from ..models import (Empresa, Proveedor, Articulo, TipoDocIdentidad, Moneda, UnidadMedida, TipoComprobante,
                      TipoOperacion, TipoExistencia, ClasifBienServ, PeriodoCerrado)
from ..services import flujo, personal, serial
from .. import seed

router = APIRouter()
CATS = {"tipo-doc-identidad": TipoDocIdentidad, "moneda": Moneda, "unidad-medida": UnidadMedida,
        "tipo-comprobante": TipoComprobante, "tipo-operacion": TipoOperacion, "tipo-existencia": TipoExistencia,
        "clasif-bien-serv": ClasifBienServ}


@router.get("/catalogos", tags=["Catálogos SUNAT"], summary="Todas las tablas SUNAT de Compras")
def catalogos(db=Depends(get_db)):
    return {k: [{"codigo": r.codigo, "descripcion": r.descripcion} for r in db.scalars(select(m).order_by(m.codigo))]
            for k, m in CATS.items()}


@router.get("/empresas", tags=["Empresas"])
def empresas(db=Depends(get_db)):
    return [{"id": e.id, "ruc": e.ruc, "razon_social": e.razon_social, "es_prueba": e.es_prueba == "S"}
            for e in db.scalars(select(Empresa).where(Empresa.estado == "A"))]


@router.post("/empresas/{empresa_id}/reiniciar-demo", tags=["Empresas"],
             summary="Borra y recarga datos de ejemplo (solo empresa de prueba, RN-09)")
def reiniciar(empresa_id: str, db=Depends(get_db)):
    emp = db.get(Empresa, empresa_id)
    if not emp:
        raise HTTPException(404, "Empresa no existe")
    try:
        seed.limpiar_empresa(db, empresa_id)
        seed.cargar_demo(db, emp)
    except PermissionError as e:
        raise regla("RN-09", str(e), 403)
    db.commit()
    return {"ok": True}


# ---------- Proveedores ----------
class ProveedorIn(BaseModel):
    tipo_doc: str = Field(min_length=1, max_length=1)
    numero_doc: str = Field(min_length=1, max_length=15)
    nombre: str = Field(min_length=1, max_length=200)


@router.get("/proveedores", tags=["Proveedores"])
def listar_proveedores(c: Ctx = Depends(get_ctx)):
    q = select(Proveedor).where(Proveedor.empresa_id == c.empresa.id).order_by(Proveedor.nombre)
    return [serial.prov(p) for p in c.db.scalars(q)]


@router.post("/proveedores", status_code=201, tags=["Proveedores"])
def crear_proveedor(b: ProveedorIn, c: Ctx = Depends(get_ctx)):
    p = flujo.crear_proveedor(c.db, c.empresa, b.tipo_doc, b.numero_doc, b.nombre, c.usuario)
    c.db.commit()
    return serial.prov(p)


@router.put("/proveedores/{pid}", tags=["Proveedores"])
def editar_proveedor(pid: str, b: ProveedorIn, c: Ctx = Depends(get_ctx)):
    p = c.db.get(Proveedor, pid)
    if not p or p.empresa_id != c.empresa.id:
        raise HTTPException(404, "Proveedor no existe")
    flujo.validar_documento(b.tipo_doc, b.numero_doc.strip())
    p.tipo_doc, p.numero_doc, p.nombre = b.tipo_doc, b.numero_doc.strip(), b.nombre.strip()
    c.db.commit()
    return serial.prov(p)


@router.patch("/proveedores/{pid}/estado", tags=["Proveedores"])
def estado_proveedor(pid: str, activo: bool, c: Ctx = Depends(get_ctx)):
    p = c.db.get(Proveedor, pid)
    if not p or p.empresa_id != c.empresa.id:
        raise HTTPException(404, "Proveedor no existe")
    p.estado = "A" if activo else "I"
    c.db.commit()
    return serial.prov(p)


# ---------- Artículos ----------
class ArticuloIn(BaseModel):
    descripcion: str = Field(min_length=1, max_length=200)
    unidad: str
    tipo_existencia: str
    es_servicio: bool = False
    es_activo_fijo: bool = False


@router.get("/articulos", tags=["Artículos"])
def listar_articulos(c: Ctx = Depends(get_ctx)):
    q = select(Articulo).where(Articulo.empresa_id == c.empresa.id).order_by(Articulo.descripcion)
    return [serial.art(a) for a in c.db.scalars(q)]


@router.post("/articulos", status_code=201, tags=["Artículos"])
def crear_articulo(b: ArticuloIn, c: Ctx = Depends(get_ctx)):
    if not c.db.get(UnidadMedida, b.unidad) or not c.db.get(TipoExistencia, b.tipo_existencia):
        raise regla("RE_CatSunat", "Unidad (Tabla 6) o tipo de existencia (Tabla 5) no válidos")
    if b.es_servicio and b.es_activo_fijo:
        raise regla("RE_ArtLocal", "Un artículo no puede ser servicio y activo fijo a la vez")
    a = Articulo(empresa_id=c.empresa.id, **b.model_dump())
    c.db.add(a); c.db.commit()
    return serial.art(a)


# ---------- Personal (consulta a Planillas) ----------
@router.get("/personal/trabajadores", tags=["Planillas (consulta)"],
            summary="Trabajadores que entrega Planillas; Compras solo lee")
def trabajadores():
    return personal.trabajadores()


# ---------- Periodos ----------
@router.get("/periodos/cerrados", tags=["Periodos"])
def periodos_cerrados(c: Ctx = Depends(get_ctx)):
    return [p.periodo for p in c.db.scalars(select(PeriodoCerrado).where(PeriodoCerrado.empresa_id == c.empresa.id))]


@router.put("/periodos/{periodo}/cierre", tags=["Periodos"])
def cerrar_periodo(periodo: str, cerrado: bool = True, c: Ctx = Depends(get_ctx)):
    row = c.db.get(PeriodoCerrado, (c.empresa.id, periodo))
    if cerrado and not row:
        c.db.add(PeriodoCerrado(empresa_id=c.empresa.id, periodo=periodo))
    if not cerrado and row:
        c.db.delete(row)
    c.db.commit()
    return {"periodo": periodo, "cerrado": cerrado}
