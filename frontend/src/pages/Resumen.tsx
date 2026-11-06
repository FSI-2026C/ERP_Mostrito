import { api, session } from "../api";
import { Btn, Chip, ErrorBox, Title, useLoad, useToast, tonoEvento, nombreEvento, cx } from "../ui";
import { useState } from "react";

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
  const etapas = [
    { t: "Solicitudes pendientes", v: sol.filter((s) => s.estado === "PEN").length, a: "solicitudes" },
    { t: "Órdenes en borrador", v: n("BOR"), a: "ordenes" },
    { t: "Por aprobar", v: n("PEN"), a: "ordenes" },
    { t: "Aprobadas o enviadas", v: n("APR") + n("ENV"), a: "ordenes" },
    { t: "Recibidas sin factura", v: n("REC"), a: "ordenes" },
    { t: "Comprobantes registrados", v: vigentes.length, a: "comprobantes" },
    { t: "Pagados en Cuentas por Pagar", v: pagados, a: "comprobantes" },
  ];
  const pendientes = mods.reduce((s, m) => s + m.pendientes + m.fallidos, 0);
  const max = Math.max(1, ...etapas.map((e) => e.v));
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

      <ol className="mb-6 grid grid-cols-7 gap-0 overflow-hidden rounded-lg border border-linea bg-white">
        {etapas.map((e, i) => (
          <li key={e.t} className={cx("relative", i > 0 && "border-l border-linea")}>
            <button onClick={() => ir(e.a)} className="flex h-full w-full flex-col justify-between px-3.5 py-3 text-left hover:bg-papel">
              <span className="min-h-[34px] text-[13px] leading-snug text-suave">{e.t}</span>
              <span className="mt-3 block">
                <span className="num block text-[28px] font-semibold leading-none">{e.v}</span>
                <span className="mt-2 block h-1.5 rounded-full bg-black/5"><span className="block h-1.5 rounded-full bg-azul" style={{ width: `${(e.v / max) * 100}%` }} /></span>
              </span>
            </button>
          </li>
        ))}
      </ol>

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
