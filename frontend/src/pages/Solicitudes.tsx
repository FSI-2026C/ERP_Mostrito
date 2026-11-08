import { useState } from "react";
import { api, ESTADO_ORDEN, fecha, money, qty } from "../api";
import { Btn, Chip, Drawer, ErrorBox, Field, Input, Select, Table, Td, Title, tonoOrden, useLoad, useToast } from "../ui";
import { Avance, DiagramaFlujo, comprobanteDe, etapaDe, ordenDe } from "../flujo";
import OrdenForm from "./OrdenForm";

const tono = (e: string) => (e === "PEN" ? "ambar" : e === "ATE" ? "verde" : "rojo");
const nombre = (e: string) => ({ PEN: "Pendiente", ATE: "Atendida", ANU: "Anulada" }[e] ?? e);
const soloServicios = (o: any) => !!o && o.lineas.every((l: any) => l.es_servicio);

export default function Solicitudes({ ir }: { ir: (r: string, x?: any) => void }) {
  const toast = useToast();
  const { data, error, reload } = useLoad(async () => {
    const [sol, art, prov, trab, ord, cmp] = await Promise.all([api<any[]>("/solicitudes"), api<any[]>("/articulos"), api<any[]>("/proveedores"),
      api<any[]>("/personal/trabajadores"), api<any[]>("/ordenes"), api<any[]>("/comprobantes")]);
    return { sol, art, prov, trab, ord, cmp };
  }, []);
  const [nueva, setNueva] = useState(false);
  const [orden, setOrden] = useState<any>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [guia, setGuia] = useState(() => { try { return localStorage.getItem("guia-flujo") !== "0"; } catch { return true; } });
  const [err, setErr] = useState<unknown>(null);
  const [area, setArea] = useState("Logística");
  const [lineas, setLineas] = useState([{ articulo_id: "", cantidad: "1", observacion: "" }]);

  const alternarGuia = () => { const v = !guia; setGuia(v); try { localStorage.setItem("guia-flujo", v ? "1" : "0"); } catch { /* sin almacenamiento */ } };
  const crear = async () => {
    try {
      await api("/solicitudes", { body: { area, lineas: lineas.map((l) => ({ ...l, articulo_id: l.articulo_id || data!.art[0].id, observacion: l.observacion || null })) } });
      toast("Solicitud creada"); setNueva(false); setErr(null); reload();
    } catch (e) { setErr(e); }
  };
  const anular = async (id: string) => { try { await api(`/solicitudes/${id}/anular`, { method: "POST", body: {} }); toast("Solicitud anulada"); setErr(null); reload(); } catch (e) { setErr(e); } };
  const quien = (id: string) => data?.trab.find((t) => t.trabajador_id === id)?.nombres ?? id;
  const art = (id: string) => data?.art.find((a) => a.id === id)?.descripcion ?? id;
  const caso = (s: any) => {
    const o = ordenDe(s, data!.ord), c = comprobanteDe(o, data!.cmp);
    return { o, c, etapa: etapaDe({ sol: s, orden: o, cmp: c }) };
  };
  const sel = data?.sol.find((s) => s.id === selId);
  const sc = sel && caso(sel);

  return (
    <>
      <Title sub="Pedidos internos de un área. El solicitante se valida contra Planillas: un trabajador cesado no puede pedir."
        right={<><Btn onClick={alternarGuia} aria-expanded={guia}>{guia ? "Ocultar flujo" : "Ver cómo avanza"}</Btn><Btn v="primary" onClick={() => setNueva(true)}>Nueva solicitud</Btn></>}>
        Solicitudes de compra</Title>
      <ErrorBox e={error ?? err} />

      {guia && (
        <section className="mb-6">
          <p className="mb-2 text-suave">Así avanza una solicitud hasta el pago. Haga clic en un estado para ver qué significa y quién lo mueve.</p>
          <DiagramaFlujo />
        </section>
      )}

      <Table head={["Número", "Fecha", "Solicitante", "Pide", "Estado", "Avance", ""]} empty="No hay solicitudes. Un área registra aquí lo que necesita comprar.">
        {data?.sol.map((s) => {
          const { o, etapa } = caso(s);
          return (
            <tr key={s.id} className="cursor-pointer hover:bg-papel/70" onClick={() => { setSelId(s.id); setErr(null); }}>
              <Td className="num font-medium">{s.numero}</Td>
              <Td className="num">{fecha(s.fecha)}</Td>
              <Td>{quien(s.solicitante)}<span className="block text-[12px] text-suave">{s.area}</span></Td>
              <Td>{s.lineas.map((l: any) => <span key={l.item} className="block">{qty(l.cantidad)} × {art(l.articulo_id)}</span>)}</Td>
              <Td><Chip tono={tono(s.estado)}>{nombre(s.estado)}</Chip></Td>
              <Td><Avance etapa={etapa} soloServicios={soloServicios(o)} /></Td>
              <Td right onClick={(e) => e.stopPropagation()}>
                <span className="flex justify-end gap-1.5">
                  {s.estado === "PEN" && <><Btn small onClick={() => setOrden(s)}>Emitir orden</Btn><Btn small v="ghost" onClick={() => anular(s.id)}>Anular</Btn></>}
                  {s.estado !== "PEN" && <Btn small v="ghost" onClick={() => setSelId(s.id)}>Ver detalle</Btn>}
                </span>
              </Td>
            </tr>
          );
        })}
      </Table>

      {sel && sc && (
        <Drawer title={`Solicitud ${sel.numero}`} wide onClose={() => setSelId(null)}
          footer={<>
            {sel.estado === "PEN" && <><Btn v="danger" onClick={() => anular(sel.id)}>Anular solicitud</Btn><Btn v="primary" onClick={() => { setOrden(sel); setSelId(null); }}>Emitir orden</Btn></>}
            {sc.o && sc.o.estado !== "ANU" && <Btn v="primary" onClick={() => ir("ordenes", { orden: sc.o.id })}>Abrir orden {sc.o.numero}</Btn>}
          </>}>
          <ErrorBox e={err} />
          <DiagramaFlujo key={sel.id} actual={sc.etapa} soloServicios={soloServicios(sc.o)} className="mb-5" />

          <dl className="mb-5 grid grid-cols-3 gap-4">
            <div><dt className="text-suave">Solicitante</dt><dd className="font-medium">{quien(sel.solicitante)}</dd></div>
            <div><dt className="text-suave">Área</dt><dd>{sel.area}</dd></div>
            <div><dt className="text-suave">Fecha</dt><dd className="num">{fecha(sel.fecha)}</dd></div>
          </dl>

          <h3 className="mb-2 font-semibold">Artículos pedidos</h3>
          <Table head={["Artículo", { t: "Cantidad", right: true }]}>
            {sel.lineas.map((l: any) => <tr key={l.item}><Td>{art(l.articulo_id)}{l.observacion && <span className="block text-[12px] text-suave">{l.observacion}</span>}</Td><Td right>{qty(l.cantidad)}</Td></tr>)}
          </Table>

          <h3 className="mb-2 mt-6 font-semibold">Órdenes emitidas</h3>
          {data!.ord.filter((o) => o.solicitud_id === sel.id).length === 0
            ? <p className="text-suave">Todavía no hay orden. Use «Emitir orden» para elegir proveedor y precios.</p>
            : <Table head={["Orden", "Proveedor", { t: "Total sin IGV", right: true }, "Estado"]}>
                {data!.ord.filter((o) => o.solicitud_id === sel.id).map((o) => (
                  <tr key={o.id}><Td className="num font-medium">{o.numero}</Td><Td>{o.proveedor}</Td><Td right>{o.moneda} {money(o.total_sin_igv)}</Td><Td><Chip tono={tonoOrden(o.estado)}>{ESTADO_ORDEN[o.estado]}</Chip></Td></tr>
                ))}
              </Table>}
          {sc.c && <p className="mt-3 text-suave">Comprobante <span className="num text-texto">{sc.c.serie}-{sc.c.numero}</span>, pago en Cuentas por Pagar: <b className="text-texto">{sc.c.pago.estado_pago ?? "sin respuesta"}</b></p>}
        </Drawer>
      )}

      {nueva && data && (
        <Drawer title="Nueva solicitud" onClose={() => setNueva(false)} footer={<><Btn onClick={() => setNueva(false)}>Cancelar</Btn><Btn v="primary" onClick={crear}>Crear solicitud</Btn></>}>
          <ErrorBox e={err} />
          <p className="mb-4 text-suave">Se registra a nombre del usuario activo en la barra superior.</p>
          <Field label="Área solicitante" className="mb-4"><Input value={area} onChange={(e) => setArea(e.target.value)} /></Field>
          <span className="mb-1 block text-[13px] font-medium">Artículos</span>
          {lineas.map((l, i) => (
            <div key={i} className="mb-3 grid grid-cols-[1fr_90px_auto] gap-2">
              <Select aria-label="Artículo" value={l.articulo_id || data.art[0]?.id} onChange={(e) => setLineas(lineas.map((x, j) => j === i ? { ...x, articulo_id: e.target.value } : x))}>
                {data.art.filter((a) => a.estado === "A").map((a) => <option key={a.id} value={a.id}>{a.descripcion}</option>)}</Select>
              <Input aria-label="Cantidad" className="num text-right" value={l.cantidad} onChange={(e) => setLineas(lineas.map((x, j) => j === i ? { ...x, cantidad: e.target.value } : x))} />
              <Btn v="ghost" aria-label="Quitar artículo" disabled={lineas.length === 1} onClick={() => setLineas(lineas.filter((_, j) => j !== i))}>Quitar</Btn>
            </div>
          ))}
          <Btn small onClick={() => setLineas([...lineas, { articulo_id: "", cantidad: "1", observacion: "" }])}>Agregar artículo</Btn>
        </Drawer>
      )}
      {orden && data && <OrdenForm proveedores={data.prov} articulos={data.art} solicitudId={orden.id}
        inicial={orden.lineas.map((l: any) => ({ articulo_id: l.articulo_id, cantidad: l.cantidad, precio: "" }))}
        onClose={() => setOrden(null)} onSaved={() => { toast("Orden creada en borrador"); setOrden(null); ir("ordenes"); }} />}
    </>
  );
}
