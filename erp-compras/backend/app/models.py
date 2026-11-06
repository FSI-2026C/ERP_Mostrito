"""Tablas del diccionario de datos de Compras (esquema `compras`).
Convención: nemotécnico del diccionario -> columna snake_case (EmpCod -> empresa_id).
Extensiones sobre el diccionario (marcadas EXT): destino del evento, banderas de artículo,
campos de respuesta de otros módulos en el comprobante y cierre de periodos."""
import uuid
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import (String, Date, DateTime, Numeric, Integer, Boolean, ForeignKey, CheckConstraint,
                        UniqueConstraint, func, Index)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .db import Base
from .config import SCHEMA

S = {"schema": SCHEMA}


def uid() -> str:
    return str(uuid.uuid4())


def fk(col: str) -> str:
    return f"{SCHEMA}.{col}"


# ---------- Tablas referenciales SUNAT (semilla, no editables por usuarios: RE_CatSunat) ----------
class _Cat:
    codigo: Mapped[str] = mapped_column(String, primary_key=True)
    descripcion: Mapped[str] = mapped_column(String(200))
    estado: Mapped[str] = mapped_column(String(1), default="A")


class TipoDocIdentidad(_Cat, Base):  # Tabla 2
    __tablename__ = "tipo_doc_identidad"; __table_args__ = S
    codigo: Mapped[str] = mapped_column(String(1), primary_key=True)


class Moneda(_Cat, Base):  # Tabla 4
    __tablename__ = "moneda"; __table_args__ = S
    codigo: Mapped[str] = mapped_column(String(3), primary_key=True)


class UnidadMedida(_Cat, Base):  # Tabla 6
    __tablename__ = "unidad_medida"; __table_args__ = S
    codigo: Mapped[str] = mapped_column(String(3), primary_key=True)


class TipoComprobante(_Cat, Base):  # Tabla 10
    __tablename__ = "tipo_comprobante"; __table_args__ = S
    codigo: Mapped[str] = mapped_column(String(2), primary_key=True)


class TipoOperacion(_Cat, Base):  # Tabla 12
    __tablename__ = "tipo_operacion"; __table_args__ = S
    codigo: Mapped[str] = mapped_column(String(2), primary_key=True)


class TipoExistencia(_Cat, Base):  # Tabla 5
    __tablename__ = "tipo_existencia"; __table_args__ = S
    codigo: Mapped[str] = mapped_column(String(2), primary_key=True)


class ClasifBienServ(_Cat, Base):  # Tabla 30
    __tablename__ = "clasif_bien_serv"; __table_args__ = S
    codigo: Mapped[str] = mapped_column(String(1), primary_key=True)


# ---------- Maestros ----------
class Empresa(Base):
    __tablename__ = "empresa"; __table_args__ = S
    id: Mapped[str] = mapped_column("emp_cod", String(64), primary_key=True, default=uid)
    ruc: Mapped[str] = mapped_column("emp_ruc", String(11), unique=True)
    razon_social: Mapped[str] = mapped_column("emp_raz_soc", String(200))
    es_prueba: Mapped[str] = mapped_column("emp_pru", String(1), default="N")
    estado: Mapped[str] = mapped_column("emp_est_reg", String(1), default="A")


class Proveedor(Base):
    __tablename__ = "proveedor"
    __table_args__ = (UniqueConstraint("emp_cod", "prv_doc_tip", "prv_doc_num", name="re_prv_id_uni"), S)
    id: Mapped[str] = mapped_column("prv_cod", String(64), primary_key=True, default=uid)
    empresa_id: Mapped[str] = mapped_column("emp_cod", ForeignKey(fk("empresa.emp_cod")))
    tipo_doc: Mapped[str] = mapped_column("prv_doc_tip", ForeignKey(fk("tipo_doc_identidad.codigo")))
    numero_doc: Mapped[str] = mapped_column("prv_doc_num", String(15))
    nombre: Mapped[str] = mapped_column("prv_nom", String(200))
    estado: Mapped[str] = mapped_column("prv_est_reg", String(1), default="A")


class Articulo(Base):
    __tablename__ = "articulo"; __table_args__ = S
    id: Mapped[str] = mapped_column("art_cod", String(64), primary_key=True, default=uid)
    empresa_id: Mapped[str] = mapped_column("emp_cod", ForeignKey(fk("empresa.emp_cod")))
    descripcion: Mapped[str] = mapped_column("art_des", String(200))
    unidad: Mapped[str] = mapped_column("uni_cod", ForeignKey(fk("unidad_medida.codigo")))
    tipo_existencia: Mapped[str] = mapped_column("tex_cod", ForeignKey(fk("tipo_existencia.codigo")))
    es_servicio: Mapped[bool] = mapped_column(Boolean, default=False)      # EXT: servicios no pasan por Almacén (RN-04)
    es_activo_fijo: Mapped[bool] = mapped_column(Boolean, default=False)   # EXT: dispara aviso a Activos Fijos
    estado: Mapped[str] = mapped_column("art_est_reg", String(1), default="A")


# ---------- Solicitud ----------
class Solicitud(Base):
    __tablename__ = "solicitud"
    __table_args__ = (UniqueConstraint("emp_cod", "sol_num"), CheckConstraint("sol_est in ('PEN','ATE','ANU')"), S)
    id: Mapped[str] = mapped_column("sol_cod", String(64), primary_key=True, default=uid)
    empresa_id: Mapped[str] = mapped_column("emp_cod", ForeignKey(fk("empresa.emp_cod")))
    numero: Mapped[str] = mapped_column("sol_num", String(15))
    fecha: Mapped[date] = mapped_column("sol_fec", Date)
    solicitante: Mapped[str] = mapped_column("sol_usu_cod", String(128))  # referencia externa a Planillas
    area: Mapped[str] = mapped_column("sol_are", String(100))
    estado: Mapped[str] = mapped_column("sol_est", String(3), default="PEN")
    registrado_en: Mapped[datetime] = mapped_column("sol_reg_ins", DateTime(timezone=True), server_default=func.now())
    lineas: Mapped[list["SolicitudDet"]] = relationship(cascade="all, delete-orphan", order_by="SolicitudDet.item")


class SolicitudDet(Base):
    __tablename__ = "solicitud_det"
    __table_args__ = (CheckConstraint("sdt_can > 0"), S)
    solicitud_id: Mapped[str] = mapped_column("sol_cod", ForeignKey(fk("solicitud.sol_cod")), primary_key=True)
    item: Mapped[int] = mapped_column("sdt_itm", Integer, primary_key=True)
    articulo_id: Mapped[str] = mapped_column("art_cod", ForeignKey(fk("articulo.art_cod")))
    cantidad: Mapped[Decimal] = mapped_column("sdt_can", Numeric(14, 3))
    observacion: Mapped[str | None] = mapped_column("sdt_obs", String(200))


# ---------- Orden de compra ----------
class OrdenCompra(Base):
    __tablename__ = "orden_compra"
    __table_args__ = (UniqueConstraint("emp_cod", "ord_num"),
                      CheckConstraint("ord_est in ('BOR','PEN','APR','ENV','REC','FAC','ANU')"), S)
    id: Mapped[str] = mapped_column("ord_cod", String(64), primary_key=True, default=uid)
    empresa_id: Mapped[str] = mapped_column("emp_cod", ForeignKey(fk("empresa.emp_cod")))
    numero: Mapped[str] = mapped_column("ord_num", String(15))
    solicitud_id: Mapped[str | None] = mapped_column("sol_cod", ForeignKey(fk("solicitud.sol_cod")))
    proveedor_id: Mapped[str] = mapped_column("prv_cod", ForeignKey(fk("proveedor.prv_cod")))
    moneda: Mapped[str] = mapped_column("mon_cod", ForeignKey(fk("moneda.codigo")))
    fecha: Mapped[date] = mapped_column("ord_fec", Date)
    estado: Mapped[str] = mapped_column("ord_est", String(3), default="BOR")
    creado_por: Mapped[str] = mapped_column("ord_cre", String(128))
    aprobado_por: Mapped[str | None] = mapped_column("ord_apr_act", String(128))
    aprobado_en: Mapped[datetime | None] = mapped_column("ord_apr_ins", DateTime(timezone=True))
    registrado_en: Mapped[datetime] = mapped_column("ord_reg_ins", DateTime(timezone=True), server_default=func.now())
    lineas: Mapped[list["OrdenCompraDet"]] = relationship(cascade="all, delete-orphan", order_by="OrdenCompraDet.item")
    recepciones: Mapped[list["RefRecepcion"]] = relationship(cascade="all, delete-orphan")
    proveedor: Mapped[Proveedor] = relationship()


class OrdenCompraDet(Base):
    __tablename__ = "orden_compra_det"
    __table_args__ = (CheckConstraint("odt_can > 0"), CheckConstraint("odt_pre >= 0"), S)
    orden_id: Mapped[str] = mapped_column("ord_cod", ForeignKey(fk("orden_compra.ord_cod")), primary_key=True)
    item: Mapped[int] = mapped_column("odt_itm", Integer, primary_key=True)
    articulo_id: Mapped[str] = mapped_column("art_cod", ForeignKey(fk("articulo.art_cod")))
    unidad: Mapped[str] = mapped_column("uni_cod", ForeignKey(fk("unidad_medida.codigo")))
    cantidad: Mapped[Decimal] = mapped_column("odt_can", Numeric(14, 3))
    precio: Mapped[Decimal] = mapped_column("odt_pre", Numeric(14, 4))
    articulo: Mapped[Articulo] = relationship()


class RefRecepcion(Base):
    __tablename__ = "ref_recepcion"; __table_args__ = (CheckConstraint("rec_tip in ('P','T')"), S)
    orden_id: Mapped[str] = mapped_column("ord_cod", ForeignKey(fk("orden_compra.ord_cod")), primary_key=True)
    recepcion_ext: Mapped[str] = mapped_column("rec_ext", String(128), primary_key=True)
    tipo: Mapped[str] = mapped_column("rec_tip", String(1))
    fecha: Mapped[date] = mapped_column("rec_fec", Date)
    registrado_en: Mapped[datetime] = mapped_column("rec_reg_ins", DateTime(timezone=True), server_default=func.now())


# ---------- Comprobante ----------
class Comprobante(Base):
    __tablename__ = "comprobante"
    __table_args__ = (
        UniqueConstraint("emp_cod", "prv_cod", "tcp_cod", "cmp_ser", "cmp_num", name="re_cmp_uni"),
        CheckConstraint("cmp_bas >= 0 and cmp_igv >= 0 and cmp_no_gra >= 0 and cmp_tot > 0"),
        CheckConstraint("cmp_tot = cmp_bas + cmp_igv + cmp_no_gra", name="re_cmp_tot_sum"),
        CheckConstraint("cmp_est in ('R','A')"),
        Index("ix_cmp_periodo", "emp_cod", "cmp_per"), S)
    id: Mapped[str] = mapped_column("cmp_cod", String(64), primary_key=True, default=uid)
    empresa_id: Mapped[str] = mapped_column("emp_cod", ForeignKey(fk("empresa.emp_cod")))
    orden_id: Mapped[str | None] = mapped_column("ord_cod", ForeignKey(fk("orden_compra.ord_cod")))
    proveedor_id: Mapped[str] = mapped_column("prv_cod", ForeignKey(fk("proveedor.prv_cod")))
    periodo: Mapped[str] = mapped_column("cmp_per", String(6))
    tipo: Mapped[str] = mapped_column("tcp_cod", ForeignKey(fk("tipo_comprobante.codigo")))
    serie: Mapped[str] = mapped_column("cmp_ser", String(20))
    numero: Mapped[str] = mapped_column("cmp_num", String(20))
    fecha_emision: Mapped[date] = mapped_column("cmp_fec_emi", Date)
    fecha_vencimiento: Mapped[date | None] = mapped_column("cmp_fec_ven", Date)
    moneda: Mapped[str] = mapped_column("mon_cod", ForeignKey(fk("moneda.codigo")))
    tipo_cambio: Mapped[Decimal | None] = mapped_column("cmp_tip_cam", Numeric(7, 3))
    base: Mapped[Decimal] = mapped_column("cmp_bas", Numeric(14, 2))
    igv: Mapped[Decimal] = mapped_column("cmp_igv", Numeric(14, 2))
    no_gravado: Mapped[Decimal] = mapped_column("cmp_no_gra", Numeric(14, 2))
    total: Mapped[Decimal] = mapped_column("cmp_tot", Numeric(14, 2))
    clasificacion: Mapped[str] = mapped_column("cla_cod", ForeignKey(fk("clasif_bien_serv.codigo")))
    tipo_operacion: Mapped[str] = mapped_column("top_cod", ForeignKey(fk("tipo_operacion.codigo")), default="02")
    estado: Mapped[str] = mapped_column("cmp_est", String(1), default="R")
    registrado_en: Mapped[datetime] = mapped_column("cmp_reg_ins", DateTime(timezone=True), server_default=func.now())
    registrado_por: Mapped[str] = mapped_column("cmp_reg_act", String(128))
    # EXT: lo que devuelven otros módulos por API
    estado_pago: Mapped[str | None] = mapped_column(String(12))          # Cuentas por Pagar
    cxp_ref: Mapped[str | None] = mapped_column(String(64))
    saldo_pendiente: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    activo_estado: Mapped[str | None] = mapped_column(String(24))        # Activos Fijos
    activo_refs: Mapped[list | None] = mapped_column(JSONB)
    proveedor: Mapped[Proveedor] = relationship()


# ---------- Evento saliente (outbox) y bitácora ----------
class Evento(Base):
    __tablename__ = "evento"
    __table_args__ = (CheckConstraint("evt_tip in ('compra.registrada','orden.aprobada','compra.anulada')"),
                      CheckConstraint("evt_est in ('P','E','F')"), Index("ix_evt_dest", "emp_cod", "destino", "evt_est"), S)
    id: Mapped[str] = mapped_column("evt_cod", String(64), primary_key=True, default=uid)
    empresa_id: Mapped[str] = mapped_column("emp_cod", ForeignKey(fk("empresa.emp_cod")))
    tipo: Mapped[str] = mapped_column("evt_tip", String(40))
    referencia: Mapped[str] = mapped_column("evt_ref", String(64))
    destino: Mapped[str] = mapped_column(String(30))                      # EXT: módulo que consume el evento
    contenido: Mapped[dict] = mapped_column("evt_car", JSONB)
    estado: Mapped[str] = mapped_column("evt_est", String(1), default="P")
    intentos: Mapped[int] = mapped_column(Integer, default=0)             # EXT
    respuesta: Mapped[dict | None] = mapped_column(JSONB)                 # EXT: lo que contestó el módulo destino
    registrado_en: Mapped[datetime] = mapped_column("evt_reg_ins", DateTime(timezone=True), server_default=func.now())


class Bitacora(Base):
    __tablename__ = "bitacora"; __table_args__ = S
    id: Mapped[str] = mapped_column("bit_cod", String(64), primary_key=True, default=uid)
    empresa_id: Mapped[str] = mapped_column("emp_cod", ForeignKey(fk("empresa.emp_cod")))
    entidad: Mapped[str] = mapped_column("bit_ent", String(40))
    referencia: Mapped[str] = mapped_column("bit_ref", String(64))
    accion: Mapped[str] = mapped_column("bit_acc", String(30))
    detalle: Mapped[dict | None] = mapped_column("bit_det", JSONB)
    usuario: Mapped[str] = mapped_column("bit_act", String(128))
    instante: Mapped[datetime] = mapped_column("bit_ins", DateTime(timezone=True), server_default=func.now())


class PeriodoCerrado(Base):  # EXT: hasta que Contabilidad ofrezca su consulta de periodo (RE_CmpPerAbi)
    __tablename__ = "periodo_cerrado"; __table_args__ = S
    empresa_id: Mapped[str] = mapped_column(ForeignKey(fk("empresa.emp_cod")), primary_key=True)
    periodo: Mapped[str] = mapped_column(String(6), primary_key=True)
