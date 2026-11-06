"""Flujo completo + reglas del diccionario. Al terminar, escribe los JSON de contratos de integración."""
import json, os
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
import pytest

OUT = Path(__file__).resolve().parents[2] / "contratos-integracion"
HOY = date.today()
PER = f"{HOY.year:04d}{HOY.month:02d}"
APR = {"X-Empresa": "emp-prueba", "X-Usuario": "T-003"}
COM = {"X-Empresa": "emp-prueba", "X-Usuario": "T-001"}


def guardar(nombre, data):
    OUT.mkdir(exist_ok=True)
    (OUT / f"{nombre}.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def err(r, regla, status=None):
    assert r.status_code == (status or 422), r.text
    assert r.json()["error"]["regla"] == regla, r.text


@pytest.fixture(scope="module")
def d(client):
    r = client.post("/api/v1/empresas/emp-prueba/reiniciar-demo")
    assert r.status_code == 200, r.text
    prov = {p["nombre"]: p for p in client.get("/api/v1/proveedores", headers=COM).json()}
    art = {a["descripcion"]: a for a in client.get("/api/v1/articulos", headers=COM).json()}
    return {"prov": prov, "art": art}


def comp(d, **kw):
    base = dict(proveedor_id=d["prov"]["Tecnología y Equipos del Sur S.A.C."]["id"], periodo=PER, tipo="01",
                serie="F001", numero="00000001", fecha_emision=HOY.isoformat(), moneda="PEN",
                base="1000.00", igv="180.00", no_gravado="0", clasificacion="3")
    base.update(kw)
    return base


def test_catalogos_y_salud(client):
    assert client.get("/api/v1/salud").json() == {"ok": True}
    c = client.get("/api/v1/catalogos").json()
    assert {x["codigo"] for x in c["tipo-comprobante"]} == {"01", "03", "07", "08"}


def test_proveedor_reglas(client, d):
    err(client.post("/api/v1/proveedores", headers=COM, json={"tipo_doc": "6", "numero_doc": "123", "nombre": "X"}), "RN-02")
    err(client.post("/api/v1/proveedores", headers=COM, json={"tipo_doc": "6", "numero_doc": "20100070970", "nombre": "Dup"}), "RE_PrvDup", 409)
    r = client.post("/api/v1/proveedores", headers=COM, json={"tipo_doc": "1", "numero_doc": "04567890", "nombre": "Persona Natural"})
    assert r.status_code == 201 and r.json()["numero_doc"] == "04567890"  # conserva ceros


def test_solicitud_valida_contra_planillas(client, d):
    a = d["art"]["Papel bond A4 75 g (millar)"]["id"]
    body = {"area": "Logística", "lineas": [{"articulo_id": a, "cantidad": "5"}]}
    err(client.post("/api/v1/solicitudes", headers={"X-Empresa": "emp-prueba", "X-Usuario": "T-004"}, json=body), "RE_SolUsu")  # cesado
    assert client.post("/api/v1/solicitudes", headers={"X-Empresa": "emp-prueba", "X-Usuario": "T-002"}, json=body).status_code == 201


def test_aprobacion_solo_aprobador(client, d):
    o = [x for x in client.get("/api/v1/ordenes", headers=COM).json() if x["estado"] == "BOR"][0]
    assert client.post(f"/api/v1/ordenes/{o['id']}/enviar-aprobacion", headers=COM).status_code == 200
    r = client.post(f"/api/v1/ordenes/{o['id']}/aprobar", headers=COM)
    err(r, "RE_OrdApr", 403)
    assert client.post(f"/api/v1/ordenes/{o['id']}/aprobar", headers=APR).json()["estado"] == "APR"
    err(client.put(f"/api/v1/ordenes/{o['id']}", headers=COM, json={"lineas": []}), "RE_OdtEdit")  # aprobada no se edita


def test_comprobante_reglas(client, d):
    err(client.post("/api/v1/comprobantes", headers=COM, json=comp(d, igv="150.00")), "RE_CmpIgvCal")
    err(client.post("/api/v1/comprobantes", headers=COM, json=comp(d, total="9999.00")), "RE_CmpTotSum")
    err(client.post("/api/v1/comprobantes", headers=COM, json=comp(d, moneda="USD")), "RE_CmpTipCam")
    err(client.post("/api/v1/comprobantes", headers=COM, json=comp(d, tipo_cambio="3.750")), "RE_CmpTipCam")
    err(client.post("/api/v1/comprobantes", headers=COM, json=comp(d, fecha_emision=(HOY + timedelta(days=2)).isoformat())), "RE_CmpEmiVal")
    client.put(f"/api/v1/periodos/{PER}/cierre?cerrado=true", headers=COM)
    err(client.post("/api/v1/comprobantes", headers=COM, json=comp(d)), "RN-07")
    client.put(f"/api/v1/periodos/{PER}/cierre?cerrado=false", headers=COM)


def test_orden_con_bienes_exige_recepcion(client, d):
    laptop = [o for o in client.get("/api/v1/ordenes", headers=COM).json() if o["estado"] == "REC"][0]
    pend = [o for o in client.get("/api/v1/ordenes", headers=COM).json() if o["estado"] == "APR"]
    # una orden de bienes sin recepción no admite comprobante
    a = d["art"]["Tóner negro compatible"]["id"]
    pid = d["prov"]["Papelera Arequipeña S.R.L."]["id"]
    o = client.post("/api/v1/ordenes", headers=COM, json={"proveedor_id": pid, "moneda": "PEN",
                    "lineas": [{"articulo_id": a, "cantidad": "2", "precio": "80"}]}).json()
    client.post(f"/api/v1/ordenes/{o['id']}/enviar-aprobacion", headers=COM)
    client.post(f"/api/v1/ordenes/{o['id']}/aprobar", headers=APR)
    err(client.post("/api/v1/comprobantes", headers=COM, json=comp(d, proveedor_id=pid, orden_id=o["id"], serie="F777", base="160.00", igv="28.80")), "RE_CmpOrd")
    # parcial no basta; total sí
    client.post(f"/api/v1/ordenes/{o['id']}/recepciones", headers=COM, json={"recepcion_ext": "R-1", "tipo": "P"})
    assert client.get(f"/api/v1/ordenes/{o['id']}", headers=COM).json()["estado"] == "APR"
    client.post(f"/api/v1/ordenes/{o['id']}/recepciones", headers=COM, json={"recepcion_ext": "R-2", "tipo": "T"})
    r = client.post("/api/v1/comprobantes", headers=COM, json=comp(d, proveedor_id=pid, orden_id=o["id"], serie="F777", base="160.00", igv="28.80", clasificacion="1"))
    assert r.status_code == 201, r.text
    assert client.get(f"/api/v1/ordenes/{o['id']}", headers=COM).json()["estado"] == "FAC"
    # duplicado
    err(client.post("/api/v1/comprobantes", headers=COM, json=comp(d, proveedor_id=pid, serie="f 777", base="160.00", igv="28.80", clasificacion="1")), "RE_CmpUni", 409)


def test_ciclo_activo_fijo_y_json_para_modulos(client, d):
    """Compra de laptops (activo): genera JSON a CxP y a Activos Fijos; ambos responden; Compras guarda la respuesta."""
    laptop = [o for o in client.get("/api/v1/ordenes", headers=COM).json() if o["estado"] == "REC"][0]
    prv = d["prov"]["Tecnología y Equipos del Sur S.A.C."]["id"]
    r = client.post("/api/v1/comprobantes", headers=COM, json=comp(
        d, proveedor_id=prv, orden_id=laptop["id"], serie="F002", numero="00001234", base="10350.00", igv="1863.00",
        clasificacion="2", fecha_vencimiento=(HOY + timedelta(days=30)).isoformat()))
    assert r.status_code == 201, r.text
    cmp = r.json()
    assert {e["destino"] for e in cmp["eventos_generados"]} == {"cuentas-por-pagar", "activos-fijos"}
    assert cmp["total"] == "12213.00"

    # PULL: Activos Fijos consulta sus pendientes
    pend = client.get("/api/v1/integracion/eventos?destino=activos-fijos&estado=P", headers=COM).json()
    tipos = {e["tipo"] for e in pend}
    assert tipos == {"orden.aprobada", "compra.registrada"}   # orden aprobada (demo) + compra
    ev_af = next(e for e in pend if e["tipo"] == "compra.registrada")
    assert ev_af["contenido"]["activo"]["costo_adquisicion"] == "10350.00"
    assert ev_af["contenido"]["activo"]["lineas"][0]["cantidad"] == "3.000"

    # PUSH: Compras entrega todo lo pendiente
    res = client.post("/api/v1/integracion/entregar", headers=COM).json()
    assert res["fallidos"] == 0 and res["entregados"] >= 3
    got = client.get(f"/api/v1/comprobantes/{cmp['id']}", headers=COM).json()
    assert got["pago"]["estado_pago"] == "PENDIENTE" and got["activo"]["estado"] == "ALTA_PENDIENTE"

    # Respuestas de los módulos
    p = client.post(f"/api/v1/simulador/cxp/pagar/{cmp['id']}?parcial=true", headers=COM).json()
    assert p["respuesta"]["estado_pago"] == "PARCIAL" and p["respuesta"]["saldo_pendiente"] == "6106.50"
    a = client.post(f"/api/v1/simulador/activos-fijos/alta/{cmp['id']}", headers=COM).json()
    assert a["respuesta"]["estado"] == "ALTA_CONTABILIZADA"
    err(client.post(f"/api/v1/comprobantes/{cmp['id']}/anular", headers=COM, json={"motivo": "error de digitación"}), "RE_CmpInm")

    # Guardar contratos reales
    evs = client.get("/api/v1/integracion/eventos", headers=COM).json()
    pick = lambda t, dest: next(e for e in evs if e["tipo"] == t and e["destino"] == dest and e["referencia"] in (cmp["id"], laptop["id"]))
    guardar("cuentas-por-pagar.compra.registrada", {"direccion": "Compras → Cuentas por Pagar", "endpoint_destino": "POST {CXP_URL}/compras/eventos",
            "o_consulta_pull": "GET /api/v1/integracion/eventos?destino=cuentas-por-pagar&estado=P",
            "envia": pick("compra.registrada", "cuentas-por-pagar")["contenido"], "responde": pick("compra.registrada", "cuentas-por-pagar")["respuesta"]})
    guardar("activos-fijos.compra.registrada", {"direccion": "Compras → Activos Fijos", "endpoint_destino": "POST {ACTIVOS_URL}/compras/eventos",
            "envia": pick("compra.registrada", "activos-fijos")["contenido"], "responde": pick("compra.registrada", "activos-fijos")["respuesta"]})
    guardar("activos-fijos.orden.aprobada", {"direccion": "Compras → Activos Fijos", "endpoint_destino": "POST {ACTIVOS_URL}/compras/eventos",
            "envia": pick("orden.aprobada", "activos-fijos")["contenido"], "responde": pick("orden.aprobada", "activos-fijos")["respuesta"]})
    guardar("cuentas-por-pagar.estado-pago.entrada", {"direccion": "Cuentas por Pagar → Compras", "endpoint_compras": "POST /api/v1/integracion/cxp/estado-pago",
            "envia": p["enviado_a_compras"], "responde": p["respuesta"]})
    guardar("activos-fijos.alta-confirmada.entrada", {"direccion": "Activos Fijos → Compras", "endpoint_compras": "POST /api/v1/integracion/activos-fijos/alta-confirmada",
            "envia": a["enviado_a_compras"], "responde": a["respuesta"]})
    guardar("planillas.trabajadores.consulta", {"direccion": "Planillas → Compras (solo lectura)", "endpoint_origen": "GET {PLANILLAS_URL}/trabajadores",
            "responde": client.get("/api/v1/personal/trabajadores").json()})


def test_anulacion_genera_evento(client, d):
    pid = d["prov"]["Supermercados Peruanos S.A."]["id"]
    r = client.post("/api/v1/comprobantes", headers=COM, json=comp(d, proveedor_id=pid, serie="F900", numero="00000010", clasificacion="5"))
    assert r.status_code == 201
    cid = r.json()["id"]
    a = client.post(f"/api/v1/comprobantes/{cid}/anular", headers=COM, json={"motivo": "Registrado dos veces"})
    assert a.status_code == 200 and a.json()["estado"] == "A"
    assert [e["destino"] for e in a.json()["eventos_generados"]] == ["cuentas-por-pagar"]  # no es activo
    ev = client.get(f"/api/v1/integracion/eventos?estado=P", headers=COM).json()
    anu = next(e for e in ev if e["tipo"] == "compra.anulada")
    guardar("cuentas-por-pagar.compra.anulada", {"direccion": "Compras → Cuentas por Pagar", "endpoint_destino": "POST {CXP_URL}/compras/eventos", "envia": anu["contenido"]})


def test_registro_8_1_y_nombre_archivo(client, d):
    g = client.get(f"/api/v1/registro-compras/{PER}", headers=COM).json()
    assert g["nombre_archivo"] == f"LE20123456789{PER}00080100001111.TXT"
    assert len(g["nombre_archivo"]) == 37  # 33 del nombre + .TXT
    assert g["totales"]["comprobantes"] >= 3
    assert all(len(f) == 41 for f in g["filas"])               # 41 campos
    assert all(f[40] in ("1", "6", "7") for f in g["filas"])    # campo 41 estado
    # los anulados no aparecen
    assert all(f[8] != "00000010" for f in g["filas"])
    txt = client.get(f"/api/v1/registro-compras/{PER}/txt", headers=COM)
    assert "attachment" in txt.headers["content-disposition"]
    lineas = txt.text.strip().split("\r\n")
    assert all(l.count("|") == 41 for l in lineas)
    # total campo 23 = suma 14..22 (regla SUNAT)
    for f in g["filas"]:
        assert Decimal(f[22]) == sum(Decimal(f[i]) for i in range(13, 22))
    guardar("registro-compras-8.1.ejemplo", {"nombre_archivo": g["nombre_archivo"], "totales": g["totales"],
            "primera_fila_41_campos": g["filas"][0], "primera_linea_txt": lineas[0]})


def test_multiempresa_aisla_datos(client):
    r = client.get("/api/v1/comprobantes", headers={"X-Empresa": "emp-oficial", "X-Usuario": "T-001"})
    assert r.status_code == 200 and r.json() == []
    err(client.post("/api/v1/empresas/emp-oficial/reiniciar-demo"), "RN-09", 403)
