import { useEffect, useState } from "react";
import { api, fecha } from "../api";
import { Btn, Chip, ErrorBox, JsonView, Title, cx, nombreEvento, tonoEvento, useLoad, useToast } from "../ui";

type Mod = { id: string; nombre: string; direccion: string; recibe: string[]; devuelve: string; resumen: string; pendientes: number; entregados: number; fallidos: number; url_configurada: boolean };

const SALIDA: Record<string, { sale: string; vuelve: string }> = {
  "cuentas-por-pagar": { sale: "compra.registrada · compra.anulada", vuelve: "estado de pago" },
  "activos-fijos": { sale: "orden.aprobada · compra.registrada (activo)", vuelve: "alta confirmada" },
  planillas: { sale: "", vuelve: "trabajadores y custodios (consulta)" },
};
const ENTRADA: Record<string, string> = { "cuentas-por-pagar": "cuentas-por-pagar.estado-pago.entrada", "activos-fijos": "activos-fijos.alta-confirmada.entrada", planillas: "planillas.trabajadores.consulta" };

export default function Integracion({ nav }: { nav?: any }) {
  const toast = useToast();
  const [modId, setModId] = useState("cuentas-por-pagar");
  const [pestana, setPestana] = useState<"sale" | "vuelve" | "conectar">("sale");
  const [evId, setEvId] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const { data, error, reload } = useLoad(async () => {
    const [mods, eventos, contratos, trab] = await Promise.all([api<Mod[]>("/integracion/modulos"), api<any[]>("/integracion/eventos"), api<any>("/integracion/contratos"), api<any[]>("/personal/trabajadores")]);
    return { mods, eventos, contratos, trab };
  }, []);

  const mod = data?.mods.find((m) => m.id === modId);
  const eventos = (data?.eventos ?? []).filter((e) => e.destino === modId && (!nav?.comprobante || e.referencia === nav.comprobante || e.contenido?.comprobante?.id === nav.comprobante));
  const ev = eventos.find((e) => e.id === evId) ?? eventos[0];
  useEffect(() => { setEvId(null); }, [modId]);

  const entregar = async () => {
    try { const r = await api(`/integracion/entregar?destino=${modId}`, { method: "POST", body: {} }); toast(`${r.entregados} aviso(s) entregado(s)${r.fallidos ? `, ${r.fallidos} fallido(s)` : ""}`); setErr(null); reload(); }
    catch (e) { setErr(e); }
  };
  const reintentar = async (id: string) => { try { await api(`/integracion/eventos/${id}/reintentar`, { method: "POST", body: {} }); reload(); } catch (e) { setErr(e); } };

  if (error) return <ErrorBox e={error} />;
  if (!data || !mod) return <p className="text-suave">Cargando…</p>;
  const entrada = data.contratos[ENTRADA[modId]];
  const origen = location.origin;

  return (
    <>
      <Title sub="Esto es lo que Compras entrega a los módulos vecinos, en el formato exacto que recibirán, y lo que ellos devuelven.">Integración con módulos</Title>
      <ErrorBox e={err} />

      {/* Mapa */}
      <section aria-label="Mapa de módulos" className="mb-6 grid grid-cols-[170px_1fr] overflow-hidden rounded-lg border border-linea bg-white">
        <div className="flex items-center justify-center bg-tinta px-4 py-6 text-center text-white">
          <div><div className="text-[18px] font-semibold">Compras</div><div className="mt-1 text-[12.5px] text-white/60">Registro de Compras 8.1<br />Órdenes y comprobantes</div></div>
        </div>
        <ul className="divide-y divide-linea">
          {[...data.mods, { id: "asistencia", nombre: "Control de Asistencia", resumen: "No intercambia datos con Compras. Si Planillas necesita ausencias, ese intercambio ocurre entre ellos.", recibe: [], pendientes: 0, entregados: 0, fallidos: 0 } as any].map((m: Mod) => {
            const activo = m.id === modId; const inerte = m.id === "asistencia";
            const s = SALIDA[m.id];
            return (
              <li key={m.id}>
                <button disabled={inerte} onClick={() => { setModId(m.id); setPestana("sale"); }} aria-pressed={activo}
                  className={cx("grid w-full grid-cols-[1fr_250px] items-center gap-4 px-5 py-3.5 text-left", activo ? "bg-azul-claro" : inerte ? "cursor-default" : "hover:bg-papel")}>
                  <span className="flex items-center gap-4">
                    {!inerte ? (
                      <svg width="140" height="38" viewBox="0 0 140 38" aria-hidden className="shrink-0">
                        {s.sale ? <><line x1="2" y1="11" x2="130" y2="11" stroke="#2b4bea" strokeWidth="1.6" /><path d="M130 6l8 5-8 5z" fill="#2b4bea" /></> : <line x1="2" y1="11" x2="130" y2="11" stroke="#c4ccd8" strokeDasharray="4 4" />}
                        <line x1="10" y1="28" x2="138" y2="28" stroke="#0b7a5c" strokeWidth="1.6" /><path d="M10 23l-8 5 8 5z" fill="#0b7a5c" />
                      </svg>
                    ) : <svg width="140" height="38" aria-hidden><line x1="2" y1="19" x2="138" y2="19" stroke="#c4ccd8" strokeDasharray="2 5" /></svg>}
                    <span>
                      <span className="block font-semibold">{m.nombre}</span>
                      <span className="block max-w-[58ch] text-[13px] text-suave">{inerte ? m.resumen : <>{s.sale ? <>Compras envía {s.sale}. </> : "Compras no envía nada. "}Devuelve {s.vuelve}.</>}</span>
                    </span>
                  </span>
                  {!inerte && m.recibe.length > 0 ? (
                    <span className="flex justify-end gap-1.5">
                      <Chip tono="ambar">{m.pendientes} pendientes</Chip><Chip tono="verde">{m.entregados} entregados</Chip>{m.fallidos > 0 && <Chip tono="rojo">{m.fallidos} fallidos</Chip>}
                    </span>
                  ) : <span className="text-right text-[12.5px] text-suave">{inerte ? "Sin intercambio" : "Solo lectura"}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Detalle */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-[17px] font-semibold">{mod.nombre}</h2>
          <p className="text-suave">{mod.resumen}</p>
        </div>
        {mod.recibe.length > 0 && <Btn v="primary" onClick={entregar} disabled={mod.pendientes + mod.fallidos === 0}>Entregar {mod.pendientes + mod.fallidos || ""} pendientes</Btn>}
      </div>
      <div role="tablist" className="mb-4 flex gap-1 border-b border-linea">
        {([["sale", mod.recibe.length ? "Lo que Compras envía" : "Lo que Compras consulta"], ["vuelve", "Lo que el módulo devuelve"], ["conectar", "Cómo conectarse"]] as const).map(([k, t]) => (
          <button key={k} role="tab" aria-selected={pestana === k} onClick={() => setPestana(k)}
            className={cx("-mb-px border-b-2 px-3 py-2 font-medium", pestana === k ? "border-azul text-azul" : "border-transparent text-suave hover:text-texto")}>{t}</button>
        ))}
      </div>
      {nav?.comprobante && pestana === "sale" && <p className="mb-3 text-[13px] text-suave">Mostrando solo los avisos del comprobante elegido.</p>}

      {pestana === "sale" && mod.recibe.length > 0 && (
        eventos.length === 0 ? <p className="rounded-lg border border-dashed border-linea p-8 text-center text-suave">Todavía no hay avisos para este módulo. Se generan al aprobar una orden con activos o al registrar un comprobante.</p> :
        <div className="grid grid-cols-[300px_1fr] gap-5">
          <ul className="max-h-[640px] space-y-2 overflow-y-auto pr-1">
            {eventos.map((e) => (
              <li key={e.id}><button onClick={() => setEvId(e.id)} className={cx("w-full rounded-lg border px-3 py-2.5 text-left", e.id === ev?.id ? "border-azul bg-azul-claro" : "border-linea bg-white hover:bg-papel")}>
                <span className="flex items-center justify-between"><span className="font-medium">{e.tipo}</span><Chip tono={tonoEvento(e.estado)}>{nombreEvento(e.estado)}</Chip></span>
                <span className="mt-0.5 block text-[12.5px] text-suave">{e.contenido.comprobante ? `${e.contenido.comprobante.clave_documental}` : `Orden ${e.contenido.orden?.numero}`} · {fecha(e.registrado_en)}</span>
              </button></li>
            ))}
          </ul>
          {ev && (
            <div className="min-w-0 space-y-3">
              <JsonView label={`Compras envía · ${ev.tipo}`} data={ev.contenido} />
              {ev.respuesta ? <JsonView label={ev.estado === "F" ? "Falló la entrega" : "El módulo respondió"} data={ev.respuesta} /> : <p className="text-suave">Sin respuesta todavía: el aviso espera que el módulo lo consulte o que se entregue.</p>}
              {ev.estado === "F" && <Btn onClick={() => reintentar(ev.id)}>Reintentar entrega</Btn>}
            </div>
          )}
        </div>
      )}
      {pestana === "sale" && mod.recibe.length === 0 && (
        <div className="grid grid-cols-[1fr_1fr] gap-5">
          <p className="max-w-[48ch] text-suave">Compras solo guarda el código del trabajador en cada solicitud y consulta a Planillas si está activo y si puede aprobar. No copia a las personas.</p>
          <JsonView label="Planillas responde · GET /trabajadores" data={data.trab} />
        </div>
      )}

      {pestana === "vuelve" && entrada && (
        <div className="space-y-3">
          <p className="text-suave"><span className="font-medium text-texto">{entrada.direccion}</span>{entrada.endpoint_compras && <> · <code className="rounded bg-black/5 px-1.5 py-0.5 text-[12.5px]">{entrada.endpoint_compras}</code></>}</p>
          <div className="grid grid-cols-2 gap-4">
            {entrada.envia && <JsonView label="El módulo envía a Compras" data={entrada.envia} />}
            <JsonView label={entrada.responde ? "Compras responde" : "Respuesta"} data={entrada.responde ?? entrada} />
          </div>
        </div>
      )}
      {pestana === "vuelve" && !entrada && <p className="text-suave">Ejecute las pruebas del backend para generar los ejemplos de este contrato.</p>}

      {pestana === "conectar" && (
        <div className="space-y-4">
          {mod.recibe.length > 0 ? (
            <>
              <p className="max-w-[70ch] text-suave">Hay dos formas de recibir los avisos. Con cualquiera de las dos, el módulo responde con los datos de arriba.</p>
              <div className="rounded-lg border border-linea bg-white p-4"><h3 className="mb-1 font-semibold">Opción 1: el módulo consulta los pendientes</h3>
                <JsonView label="Consulta y confirmación" data={{ consultar: `GET ${origen}/api/v1/integracion/eventos?destino=${modId}&estado=P`, confirmar: `POST ${origen}/api/v1/integracion/eventos/{evento_id}/ack`, ack_cuerpo: { exito: true, detalle: { id_en_su_modulo: "..." } }, encabezados: { "X-Empresa": "emp-prueba", "X-Usuario": "codigo de trabajador" } }} /></div>
              <div className="rounded-lg border border-linea bg-white p-4"><h3 className="mb-1 font-semibold">Opción 2: Compras llama al módulo</h3>
                <p className="mb-2 text-suave">Defina la URL del módulo en el servidor de Compras y use «Entregar pendientes». Mientras no haya URL, responde un simulador interno{mod.url_configurada ? " (aquí ya hay una URL configurada)" : ""}.</p>
                <JsonView label="Variables de entorno del backend" data={{ [modId === "activos-fijos" ? "ACTIVOS_URL" : "CXP_URL"]: "http://servidor-del-modulo:8000", llamada: "POST {URL}/compras/eventos con el JSON del evento" }} /></div>
              <div className="rounded-lg border border-linea bg-white p-4"><h3 className="mb-1 font-semibold">Respuesta del módulo hacia Compras</h3>
                <JsonView label={mod.devuelve} data={entrada?.envia ?? {}} /></div>
            </>
          ) : (
            <div className="rounded-lg border border-linea bg-white p-4"><h3 className="mb-1 font-semibold">Qué debe publicar Planillas</h3>
              <JsonView label="GET {PLANILLAS_URL}/trabajadores" data={data.trab.slice(0, 2)} />
              <p className="mt-2 text-suave">Campos que Compras usa: <b>trabajador_id</b> (se guarda), <b>estado</b> (solo ACTIVO puede solicitar) y <b>es_aprobador</b> (permiso para aprobar órdenes). Los custodios y bienes a cargo se tratan entre Planillas y Activos Fijos.</p></div>
          )}
        </div>
      )}
    </>
  );
}
