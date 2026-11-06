import { useEffect, useState } from "react";
import { api, CLASIFICACION, fecha, hoy, money, periodoDe } from "../api";
import { Btn, Chip, Drawer, ErrorBox, Field, Input, JsonView, Select, Table, Td, Title, useLoad, useToast } from "../ui";

const TIPOS: Record<string, string> = { "01": "Factura", "03": "Boleta", "07": "Nota de crédito", "08": "Nota de débito" };
const r2 = (n: number) => (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
const tonoPago = (e?: string | null) => (e === "PAGADO" ? "verde" : e === "PARCIAL" ? "azul" : e === "VENCIDO" ? "rojo" : e ? "ambar" : "gris");

export default function Comprobantes({ ir, nav }: { ir: (r: string, x?: any) => void; nav?: any }) {
  const toast = useToast();
  const { data, error, reload } = useLoad(async () => {
    const [cmp, prov, ord] = await Promise.all([api<any[]>("/comprobantes"), api<any[]>("/proveedores"), api<any[]>("/ordenes")]);
    return { cmp, prov, ord };
  }, []);
  const [form, setForm] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [sim, setSim] = useState<any>(null);
  const [motivo, setMotivo] = useState("");
  const vacio = { proveedor_id: "", orden_id: "", tipo: "01", serie: "", numero: "", fecha_emision: hoy(), fecha_vencimiento: "", moneda: "PEN", tipo_cambio: "", base: "", igv: "", no_gravado: "0", clasificacion: "5" };
  const [f, setF] = useState<any>(vacio);
  const [igvManual, setIgvManual] = useState(false);
  const sel = data?.cmp.find((c) => c.id === selId);

  useEffect(() => {
    if (nav?.orden && data) {
      const o = nav.orden;
      const act = o.lineas.some((l: any) => l.es_activo_fijo);
      const base = Number(o.total_sin_igv);
      setF({ ...vacio, proveedor_id: o.proveedor_id, orden_id: o.id, moneda: o.moneda, base: r2(base), igv: r2(base * 0.18), clasificacion: act ? "2" : o.lineas.every((l: any) => l.es_servicio) ? "5" : "1" });
      setIgvManual(false); setForm(true);
    }
    // eslint-disable-next-line
  }, [nav, !!data]);

  const cambiar = (k: string, v: string) => {
    const n = { ...f, [k]: v };
    if (k === "base" && !igvManual) n.igv = v === "" ? "" : r2((Number(v) || 0) * 0.18);
    if (k === "igv") setIgvManual(true);
    if (k === "moneda" && v === "PEN") n.tipo_cambio = "";
    setF(n);
  };
  const total = (Number(f.base) || 0) + (Number(f.igv) || 0) + (Number(f.no_gravado) || 0);
  const ordenesDisponibles = data?.ord.filter((o) => ["APR", "ENV", "REC"].includes(o.estado) && (!f.proveedor_id || o.proveedor_id === f.proveedor_id)) ?? [];

  const registrar = async () => {
    try {
      const body: any = { ...f, orden_id: f.orden_id || null, fecha_vencimiento: f.fecha_vencimiento || null, tipo_cambio: f.moneda === "PEN" ? null : f.tipo_cambio || null, periodo: periodoDe(f.fecha_emision), no_gravado: f.no_gravado || "0" };
      const r = await api("/comprobantes", { body });
      toast(`Comprobante registrado. ${r.eventos_generados.length} aviso(s) listo(s) para otros módulos`);
      setForm(false); setErr(null); setF(vacio); reload();
    } catch (e) { setErr(e); }
  };
  const simular = async (que: string) => {
    try { const r = await api(`/simulador/${que}/${sel.id}`, { method: "POST", body: {} }); setSim({ que, ...r }); toast("Respuesta recibida del módulo"); setErr(null); reload(); }
    catch (e) { setErr(e); }
  };
  const anular = async () => {
    try { await api(`/comprobantes/${sel.id}/anular`, { body: { motivo } }); toast("Comprobante anulado"); setMotivo(""); setErr(null); reload(); }
    catch (e) { setErr(e); }
  };

  return (
    <>
      <Title sub="Registra la factura del proveedor, calcula el IGV y deja los avisos para Cuentas por Pagar y Activos Fijos."
        right={<Btn v="primary" onClick={() => { setF(vacio); setIgvManual(false); setErr(null); setForm(true); }}>Registrar comprobante</Btn>}>Comprobantes de compra</Title>
      <ErrorBox e={error} />
      <Table head={["Comprobante", "Proveedor", "Emisión", { t: "Base", right: true }, { t: "IGV", right: true }, { t: "Total", right: true }, "Pago", "Estado"]}
        empty="Aún no se registró ningún comprobante.">
        {data?.cmp.map((c) => (
          <tr key={c.id} className="cursor-pointer hover:bg-papel/70" onClick={() => { setSelId(c.id); setSim(null); setErr(null); }}>
            <Td><span className="text-suave">{TIPOS[c.tipo]}</span> <span className="num font-medium">{c.serie}-{c.numero}</span></Td>
            <Td>{c.proveedor}</Td>
            <Td className="num">{fecha(c.fecha_emision)}</Td>
            <Td right>{money(c.base)}</Td><Td right>{money(c.igv)}</Td><Td right className="font-medium">{c.moneda} {money(c.total)}</Td>
            <Td>{c.pago.estado_pago ? <Chip tono={tonoPago(c.pago.estado_pago)}>{c.pago.estado_pago.charAt(0) + c.pago.estado_pago.slice(1).toLowerCase()}</Chip> : <span className="text-suave">Sin enviar</span>}</Td>
            <Td><Chip tono={c.estado === "R" ? "verde" : "rojo"}>{c.estado === "R" ? "Registrado" : "Anulado"}</Chip></Td>
          </tr>
        ))}
      </Table>

      {form && data && (
        <Drawer title="Registrar comprobante de compra" wide onClose={() => setForm(false)}
          footer={<><span className="mr-auto text-suave">Total <b className="num ml-1 text-[16px] text-texto">{f.moneda} {money(total)}</b></span><Btn onClick={() => setForm(false)}>Cancelar</Btn><Btn v="primary" onClick={registrar}>Registrar comprobante</Btn></>}>
          <ErrorBox e={err} />
          <div className="grid grid-cols-3 gap-4">
            <Field label="Proveedor" className="col-span-2"><Select value={f.proveedor_id} onChange={(e) => setF({ ...f, proveedor_id: e.target.value, orden_id: "" })}>
              <option value="">Elija un proveedor</option>{data.prov.filter((p) => p.estado === "A").map((p) => <option key={p.id} value={p.id}>{p.nombre} · {p.numero_doc}</option>)}</Select></Field>
            <Field label="Orden de compra" hint="Opcional"><Select value={f.orden_id} onChange={(e) => cambiar("orden_id", e.target.value)}>
              <option value="">Sin orden</option>{ordenesDisponibles.map((o) => <option key={o.id} value={o.id}>{o.numero} · {o.estado === "REC" ? "recibida" : "aprobada"}</option>)}</Select></Field>
            <Field label="Tipo"><Select value={f.tipo} onChange={(e) => cambiar("tipo", e.target.value)}>{Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Serie" hint="Se guarda en mayúsculas"><Input value={f.serie} onChange={(e) => cambiar("serie", e.target.value)} placeholder="F001" /></Field>
            <Field label="Número" hint="Conserva los ceros"><Input value={f.numero} onChange={(e) => cambiar("numero", e.target.value)} placeholder="00004521" /></Field>
            <Field label="Fecha de emisión" hint={`Periodo ${periodoDe(f.fecha_emision)}`}><Input type="date" max={hoy()} value={f.fecha_emision} onChange={(e) => cambiar("fecha_emision", e.target.value)} /></Field>
            <Field label="Vencimiento" hint="Cuentas por Pagar lo usa para el plazo de pago"><Input type="date" min={f.fecha_emision} value={f.fecha_vencimiento} onChange={(e) => cambiar("fecha_vencimiento", e.target.value)} /></Field>
            <Field label="Moneda"><Select value={f.moneda} onChange={(e) => cambiar("moneda", e.target.value)}><option value="PEN">Soles</option><option value="USD">Dólares</option></Select></Field>
            {f.moneda === "USD" && <Field label="Tipo de cambio" hint="Obligatorio en dólares"><Input className="num" inputMode="decimal" value={f.tipo_cambio} onChange={(e) => cambiar("tipo_cambio", e.target.value)} placeholder="3.750" /></Field>}
          </div>
          <div className="mt-5 grid grid-cols-3 gap-4 rounded-lg border border-linea bg-white p-4">
            <Field label="Base imponible"><Input className="num text-right" inputMode="decimal" value={f.base} onChange={(e) => cambiar("base", e.target.value)} placeholder="0.00" /></Field>
            <Field label="IGV 18%" hint={igvManual ? "Ajustado a mano (máx. 0.01 de diferencia)" : "Se calcula con la base"}><Input className="num text-right" inputMode="decimal" value={f.igv} onChange={(e) => cambiar("igv", e.target.value)} /></Field>
            <Field label="No gravado"><Input className="num text-right" inputMode="decimal" value={f.no_gravado} onChange={(e) => cambiar("no_gravado", e.target.value)} /></Field>
          </div>
          <Field label="Qué se compró" className="mt-5" hint={f.clasificacion === "2" ? "Activo fijo: Activos Fijos recibirá el costo para dar el alta." : undefined}>
            <Select value={f.clasificacion} onChange={(e) => cambiar("clasificacion", e.target.value)}>{Object.entries(CLASIFICACION).map(([k, v]) => <option key={k} value={k}>{k} · {v}</option>)}</Select></Field>
        </Drawer>
      )}

      {sel && (
        <Drawer title={`${TIPOS[sel.tipo]} ${sel.serie}-${sel.numero}`} wide onClose={() => setSelId(null)}>
          <ErrorBox e={err} />
          <dl className="mb-5 grid grid-cols-4 gap-4">
            <div><dt className="text-suave">Proveedor</dt><dd className="font-medium">{sel.proveedor}</dd></div>
            <div><dt className="text-suave">Periodo</dt><dd className="num">{sel.periodo}</dd></div>
            <div><dt className="text-suave">Total</dt><dd className="num font-medium">{sel.moneda} {money(sel.total)}</dd></div>
            <div><dt className="text-suave">Qué se compró</dt><dd>{CLASIFICACION[sel.clasificacion]}</dd></div>
          </dl>
          <div className="mb-5 grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-linea bg-white p-4">
              <div className="mb-1 text-suave">Cuentas por Pagar</div>
              {sel.pago.estado_pago ? <><Chip tono={tonoPago(sel.pago.estado_pago)}>{sel.pago.estado_pago}</Chip><div className="mt-2 num">Saldo pendiente: {sel.moneda} {money(sel.pago.saldo_pendiente)}</div><div className="text-[12.5px] text-suave">{sel.pago.cuenta_por_pagar}</div></>
                : <p className="text-suave">Todavía no entregamos el aviso. Use «Entregar» en Integración.</p>}
            </div>
            <div className="rounded-lg border border-linea bg-white p-4">
              <div className="mb-1 text-suave">Activos Fijos</div>
              {sel.clasificacion !== "2" ? <p className="text-suave">No aplica: no es un activo fijo.</p>
                : sel.activo.estado ? <><Chip tono={sel.activo.estado === "ALTA_CONTABILIZADA" ? "verde" : "ambar"}>{sel.activo.estado === "ALTA_CONTABILIZADA" ? "Alta contabilizada" : "Alta pendiente"}</Chip><div className="mt-2 text-[12.5px] text-suave">{sel.activo.referencias?.join(", ")}</div></>
                : <p className="text-suave">Todavía no entregamos el aviso.</p>}
            </div>
          </div>

          {sel.estado === "R" && (
            <div className="rounded-lg border border-dashed border-linea p-4">
              <h3 className="mb-1 font-semibold">Probar la respuesta de los otros módulos</h3>
              <p className="mb-3 text-[12.5px] text-suave">Simula lo que haría el otro equipo. Cuando su API esté lista, esta respuesta llega sola a Compras.</p>
              <div className="flex flex-wrap gap-2">
                <Btn onClick={() => simular("cxp/pagar")}>Simular pago total</Btn>
                <Btn onClick={async () => { try { const r = await api(`/simulador/cxp/pagar/${sel.id}?parcial=true`, { method: "POST", body: {} }); setSim({ que: "cxp", ...r }); reload(); } catch (e) { setErr(e); } }}>Simular pago parcial</Btn>
                {sel.clasificacion === "2" && <Btn onClick={() => simular("activos-fijos/alta")}>Simular alta en Activos Fijos</Btn>}
              </div>
              {sim && <div className="mt-4 grid grid-cols-2 gap-3"><JsonView label="El módulo envía a Compras" data={sim.enviado_a_compras} /><JsonView label="Compras responde" data={sim.respuesta} /></div>}
            </div>
          )}
          <div className="mt-5 flex flex-wrap items-end gap-3">
            <Btn onClick={() => ir("integracion", { comprobante: sel.id })}>Ver JSON enviado</Btn>
            {sel.estado === "R" && <><Field label="Motivo de anulación" className="ml-auto w-72"><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Registrado dos veces" /></Field><Btn v="danger" disabled={motivo.length < 3} onClick={anular}>Anular comprobante</Btn></>}
          </div>
        </Drawer>
      )}
    </>
  );
}
