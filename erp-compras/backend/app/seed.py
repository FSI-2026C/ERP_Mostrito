"""Semilla: tablas SUNAT + dos empresas (oficial y de prueba) + maestros de ejemplo."""
from datetime import date, timedelta
from sqlalchemy import select, text
from sqlalchemy.orm import Session
from .models import (TipoDocIdentidad, Moneda, UnidadMedida, TipoComprobante, TipoOperacion, TipoExistencia,
                     ClasifBienServ, Empresa, Proveedor, Articulo)
from .services import flujo
from .config import SCHEMA

CATALOGOS = {
    TipoDocIdentidad: [("0", "Doc. Trib. No Dom. Sin RUC"), ("1", "Documento Nacional de Identidad"),
                       ("4", "Carnet de extranjería"), ("6", "Registro Único de Contribuyentes"),
                       ("7", "Pasaporte"), ("A", "Cédula diplomática de identidad")],
    Moneda: [("PEN", "Soles"), ("USD", "Dólares americanos")],
    UnidadMedida: [("NIU", "Unidad (bienes)"), ("ZZ", "Unidad (servicios)"), ("KGM", "Kilogramo"),
                   ("MTR", "Metro"), ("LTR", "Litro"), ("BX", "Caja")],
    TipoComprobante: [("01", "Factura"), ("03", "Boleta de venta"), ("07", "Nota de crédito"), ("08", "Nota de débito")],
    TipoOperacion: [("02", "Compra")],
    TipoExistencia: [("01", "Mercaderías"), ("02", "Productos terminados"), ("03", "Materias primas y auxiliares"),
                     ("04", "Envases y embalajes"), ("05", "Suministros diversos"), ("99", "Otros")],
    ClasifBienServ: [("1", "Mercaderías, materias primas, suministros, envases y embalajes"),
                     ("2", "Activos fijos"), ("3", "Otros activos no considerados en los numerales 1 y 2"),
                     ("4", "Gastos de educación, recreación, salud, culturales, representación, capacitación, de viaje, mantenimiento de vehículos y de premios"),
                     ("5", "Otros gastos, servicios y contratos de construcción")],
}


def seed_catalogos(db: Session):
    for model, filas in CATALOGOS.items():
        for cod, des in filas:
            if not db.get(model, cod):
                db.add(model(codigo=cod, descripcion=des, estado="A"))
    db.flush()


def seed_empresas(db: Session):
    if db.scalar(select(Empresa).limit(1)):
        return
    db.add_all([Empresa(id="emp-oficial", ruc="20601234567", razon_social="Andes Soluciones Integrales S.A.C.", es_prueba="N"),
                Empresa(id="emp-prueba", ruc="20123456789", razon_social="Empresa de Prueba UNSA S.A.C.", es_prueba="S")])
    db.flush()


def cargar_maestros(db: Session, emp: Empresa):
    if db.scalar(select(Proveedor).where(Proveedor.empresa_id == emp.id).limit(1)):
        return
    for tipo, num, nom in [("6", "20100070970", "Supermercados Peruanos S.A."),
                           ("6", "20512345678", "Tecnología y Equipos del Sur S.A.C."),
                           ("6", "20498765432", "Nube Andina Servicios Cloud E.I.R.L."),
                           ("6", "20555666777", "Papelera Arequipeña S.R.L.")]:
        flujo.crear_proveedor(db, emp, tipo, num, nom, "seed")
    for des, uni, tex, serv, act in [
            ("Laptop 14\" Core i7 16 GB", "NIU", "99", False, True),
            ("Impresora multifuncional láser", "NIU", "99", False, True),
            ("Papel bond A4 75 g (millar)", "NIU", "05", False, False),
            ("Tóner negro compatible", "NIU", "05", False, False),
            ("Hosting y nube mensual", "ZZ", "99", True, False),
            ("Mantenimiento preventivo de equipos", "ZZ", "99", True, False)]:
        db.add(Articulo(empresa_id=emp.id, descripcion=des, unidad=uni, tipo_existencia=tex,
                        es_servicio=serv, es_activo_fijo=act))
    db.flush()


def cargar_demo(db: Session, emp: Empresa):
    """Flujo de ejemplo para la empresa de prueba: deja documentos en distintos estados."""
    if emp.es_prueba != "S":
        raise PermissionError("RN-09: solo la empresa de prueba admite recarga de datos")
    cargar_maestros(db, emp)
    provs = {p.nombre: p for p in db.scalars(select(Proveedor).where(Proveedor.empresa_id == emp.id))}
    arts = {a.descripcion: a for a in db.scalars(select(Articulo).where(Articulo.empresa_id == emp.id))}
    hoy = date.today()
    per = f"{hoy.year:04d}{hoy.month:02d}"
    # 1. Laptops (activo fijo): orden recibida, aún sin comprobante
    prv = provs["Tecnología y Equipos del Sur S.A.C."]
    sol = flujo.crear_solicitud(db, emp, "T-002", "Sistemas", [{"articulo_id": arts["Laptop 14\" Core i7 16 GB"].id, "cantidad": "3"}])
    o1 = flujo.crear_orden(db, emp, "T-001", prv.id, "PEN",
                           [{"articulo_id": arts["Laptop 14\" Core i7 16 GB"].id, "cantidad": "3", "precio": "3450.0000"}], sol.id)
    flujo.enviar_aprobacion(db, emp, o1, "T-001"); flujo.aprobar_orden(db, emp, o1, "T-003")
    flujo.enviar_a_proveedor(db, emp, o1, "T-001")
    flujo.registrar_recepcion(db, emp, o1, "REC-ALM-0001", "T", hoy, "T-001")
    # 2. Hosting (servicio): orden aprobada → comprobante ya registrado (genera evento a CxP)
    prv2 = provs["Nube Andina Servicios Cloud E.I.R.L."]
    o2 = flujo.crear_orden(db, emp, "T-001", prv2.id, "PEN",
                           [{"articulo_id": arts["Hosting y nube mensual"].id, "cantidad": "1", "precio": "850.0000"}])
    flujo.enviar_aprobacion(db, emp, o2, "T-001"); flujo.aprobar_orden(db, emp, o2, "T-003")
    flujo.registrar_comprobante(db, emp, "T-001", dict(
        proveedor_id=prv2.id, orden_id=o2.id, periodo=per, tipo="01", serie="F001", numero="00004521",
        fecha_emision=hoy, fecha_vencimiento=hoy + timedelta(days=30), moneda="PEN", base="850.00", igv="153.00",
        no_gravado="0", clasificacion="5"))
    # 3. Papel: borrador
    prv3 = provs["Papelera Arequipeña S.R.L."]
    flujo.crear_orden(db, emp, "T-001", prv3.id, "PEN",
                      [{"articulo_id": arts["Papel bond A4 75 g (millar)"].id, "cantidad": "20", "precio": "21.5000"}])
    db.flush()


def limpiar_empresa(db: Session, emp_id: str):
    if db.get(Empresa, emp_id).es_prueba != "S":
        raise PermissionError("RN-09: la empresa oficial no se puede borrar")
    for t in ["bitacora", "evento", "comprobante", "ref_recepcion", "orden_compra_det", "orden_compra",
              "solicitud_det", "solicitud", "articulo", "proveedor", "periodo_cerrado"]:
        col = "empresa_id" if t == "periodo_cerrado" else "emp_cod"
        if t in ("ref_recepcion", "orden_compra_det"):
            db.execute(text(f"DELETE FROM {SCHEMA}.{t} WHERE ord_cod IN (SELECT ord_cod FROM {SCHEMA}.orden_compra WHERE emp_cod=:e)"), {"e": emp_id})
        elif t == "solicitud_det":
            db.execute(text(f"DELETE FROM {SCHEMA}.{t} WHERE sol_cod IN (SELECT sol_cod FROM {SCHEMA}.solicitud WHERE emp_cod=:e)"), {"e": emp_id})
        else:
            db.execute(text(f"DELETE FROM {SCHEMA}.{t} WHERE {col}=:e"), {"e": emp_id})


def seed_inicial(db: Session):
    seed_catalogos(db); seed_empresas(db)
    for e in db.scalars(select(Empresa)):
        cargar_maestros(db, e)
    db.commit()
