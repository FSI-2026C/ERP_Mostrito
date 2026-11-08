import { api, session } from "../api";
import { Btn, Chip, ErrorBox, Title, useLoad, useToast, tonoEvento, nombreEvento } from "../ui";
import { useState } from "react";
import { DiagramaFlujo, comprobanteDe, etapaDe, ordenDe, type Etapa } from "../flujo";

export default function Resumen({ ir }: { ir: (r: string, x?: any) => void }) {
  const toast = useToast();
  const [err, setErr] = useState<unknown>(null);
  const { data, error, reload } = useLoad(async () => {
    const [sol, ord, cmp, mods] = await Promise.all([api<any[]>("/solicitudes"), api<any[]>("/ordenes"), api<any[]>("/comprobantes"), api<any[]>("/integracion/modulos")]);
    return { sol, ord, cmp, mods };
  }, []);

  if (error) return <ErrorBox e={error} />;
  if (!data) return <p className="text-suave">Cargando…</p>;
  const { sol, ord, cmp, mods } = data;
  const n = (e: string) => ord.filter((o) => o.estado === e).length;
  const vigentes = cmp.filter((c) => c.estado === "R");
  const pagados = vigentes.filter((c) => c.pago.estado_pago === "PAGADO").length;
  // Cada caso es una solicitud (con su orden vigente) o una orden emitida sin solicitud.
  const conteos: Partial<Record<Etapa, number>> = {};
  const sumar = (e: Etapa) => { conteos[e] = (conteos[e] ?? 0) + 1; };
  sol.forEach((s) => { const o = ordenDe(s, ord); sumar(etapaDe({ sol: s, orden: o, cmp: comprobanteDe(o, cmp) })); });
  ord.filter((o) => !o.solicitud_id).forEach((o) => sumar(etapaDe({ orden: o, cmp: comprobanteDe(o, cmp) })));
  const destino = (e: Etapa) => (e === "SOL" || e === "SOL_ANU" ? "solicitudes" : e === "FAC" || e === "PAG" ? "comprobantes" : "ordenes");
  const casos = Object.values(conteos).reduce((a, b) => a + (b ?? 0), 0);
  const pendientes = mods.reduce((s, m) => s + m.pendientes + m.fallidos, 0);
  const atencion: { t: string; a: string; tono: string }[] = [];
  if (n("PEN")) atencion.push({ t: `${n("PEN")} orden(es) esperan aprobación`, a: "ordenes", tono: "ambar" });
  if (n("REC")) atencion.push({ t: `${n("REC")} orden(es) recibidas esperan su comprobante`, a: "comprobantes", tono: "azul" });
  if (pendientes) atencion.push({ t: `${pendientes} aviso(s) a otros módulos sin entregar`, a: "integracion", tono: "ambar" });

  const demo = async () => {
    try { await api(`/empresas/${session.empresa}/reiniciar-demo`, { method: "POST", body: {} }); toast("Datos de ejemplo cargados"); reload(); }
    catch (e) { setErr(e); }
  };

  return (
    <>
      <Title sub="Qué hay en cada etapa y qué falta entregar a los demás módulos."
        right={<Btn onClick={demo}>Recargar datos de ejemplo</Btn>}>Del pedido al pago</Title>
      <ErrorBox e={err} />

      <section className="mb-6">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Dónde está cada compra</h2>
          <span className="num text-[13px] text-suave">{casos} caso(s) · {vigentes.length} comprobante(s), {pagados} pagado(s)</span>
        </div>
        <DiagramaFlujo conteos={conteos}
          extra={(e) => <Btn small onClick={() => ir(destino(e))}>Ir a {destino(e) === "solicitudes" ? "Solicitudes" : destino(e) === "ordenes" ? "Órdenes de compra" : "Comprobantes"}</Btn>} />
      </section>

      <div className="grid grid-cols-5 gap-5">
        <section className="col-span-3 rounded-lg border border-linea bg-white p-4">
          <h2 className="mb-3 font-semibold">Requiere atención</h2>
          {atencion.length === 0 && <p className="text-suave">Nada pendiente. Cree una solicitud u orden para empezar.</p>}
          <ul className="divide-y divide-linea">
            {atencion.map((a) => (
              <li key={a.t} className="flex items-center justify-between py-2.5">
                <span className="flex items-center gap-2"><Chip tono={a.tono}>Pendiente</Chip>{a.t}</span>
                <Btn small onClick={() => ir(a.a)}>Abrir</Btn>
              </li>
            ))}
          </ul>
        </section>
        <section className="col-span-2 rounded-lg border border-linea bg-white p-4">
          <h2 className="mb-3 font-semibold">Entregas a otros módulos</h2>
          <ul className="space-y-3">
            {mods.filter((m) => m.recibe.length).map((m) => (
              <li key={m.id} className="flex items-center justify-between">
                <span>{m.nombre}</span>
                <span className="flex gap-1.5">
                  <Chip tono={tonoEvento("P")}>{m.pendientes} {nombreEvento("P").toLowerCase()}s</Chip>
                  <Chip tono={tonoEvento("E")}>{m.entregados} entregados</Chip>
                  {m.fallidos > 0 && <Chip tono="rojo">{m.fallidos} fallidos</Chip>}
                </span>
              </li>
            ))}
          </ul>
          <Btn className="mt-4" onClick={() => ir("integracion")}>Ver los JSON que enviamos</Btn>
        </section>
      </div>
    </>
  );
}
