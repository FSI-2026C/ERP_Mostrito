# Módulo de Compras · ERP académico (Tribu Egresos)

Pila de la propuesta tecnológica: **PostgreSQL 16 · Python 3.12 · FastAPI + Pydantic · React + TypeScript + Vite + Tailwind**.

## Qué hace
Proveedores → solicitud → orden (con aprobación) → recepción de Almacén → comprobante con IGV exacto → **Registro de Compras 8.1** (TXT de 41 campos con el nombre de 33 caracteres) → avisos JSON a los módulos vecinos.

## Cómo se conecta con los otros 4 módulos
| Módulo | Dirección | Qué intercambian |
|---|---|---|
| Cuentas por Pagar | Compras → CxP | `compra.registrada`, `compra.anulada` |
| | CxP → Compras | `POST /api/v1/integracion/cxp/estado-pago` |
| Activos Fijos | Compras → AF | `orden.aprobada` (si trae activos) y `compra.registrada` con bloque `activo` (clasificación 2) |
| | AF → Compras | `POST /api/v1/integracion/activos-fijos/alta-confirmada` |
| Planillas | Planillas → Compras | `GET {PLANILLAS_URL}/trabajadores` (solo lectura: solicitante activo y aprobador) |
| Control de Asistencia | — | Sin intercambio con Compras |

Los JSON reales de cada contrato están en `contratos-integracion/` (los genera `pytest`) y se ven en la pantalla **Integración con módulos**.

**Cómo recibe un módulo los avisos** (outbox en la tabla `compras.evento`):
1. *Pull:* `GET /api/v1/integracion/eventos?destino=cuentas-por-pagar&estado=P` y luego `POST /api/v1/integracion/eventos/{id}/ack`.
2. *Push:* defina `CXP_URL` / `ACTIVOS_URL` y use `POST /api/v1/integracion/entregar`; Compras hace `POST {URL}/compras/eventos`. Sin URL responde un simulador interno.

Montos como texto con 2 decimales (`"1863.00"`) para no perder exactitud. Toda petición lleva `X-Empresa` y `X-Usuario` (código del trabajador en Planillas).

## Ejecutar
```bash
docker compose up            # db + api (8000) + web (5173)
```
Sin Docker:
```bash
# PostgreSQL con usuario/clave compras y base compras_db
cd backend && pip install -r requirements.txt && uvicorn app.main:app --port 8000
cd frontend && npm install && npm run dev      # http://localhost:5173
cd backend && pytest                            # usa la base compras_test
```
Documentación interactiva: http://localhost:8000/docs

## Reglas del diccionario implementadas
RE_PrvDup, RE_PrvEst, RE_OrdEst (BOR→PEN→APR→ENV→REC→FAC), RE_OrdApr (solo aprobador de Planillas), RE_OdtEdit, RE_CmpIgvCal (18% configurable con `TASA_IGV`, tolerancia 0,01), RE_CmpTotSum, RE_CmpTipCam, RE_CmpUni, RE_CmpOrd, RN-07 (periodo cerrado), RE_CmpInm (se anula, no se edita), RE_ClaAct, RE_CmpAtom (comprobante y evento en una transacción), RE_EvtRein, RE_CmpPle, RN-09 (solo la empresa de prueba se borra y recarga).

## Extensiones sobre el diccionario (confirmar con el equipo)
`evento.destino`, `evento.intentos`, `evento.respuesta`; `articulo.es_servicio` y `es_activo_fijo`; en `comprobante`: `estado_pago`, `cxp_ref`, `saldo_pendiente`, `activo_estado`, `activo_refs`; tabla `periodo_cerrado`. El aislamiento por empresa se hace en la aplicación (filtro por `X-Empresa`); la política RLS de PostgreSQL de la propuesta queda pendiente.

## Estructura
`backend/app` (models, services/flujo.py = reglas, services/eventos.py = contratos, services/ple.py = TXT 8.1) · `backend/tests` · `database/schema.sql` · `contratos-integracion/` · `frontend/src/pages`.
