import { useState } from "react";
import { api, ESTADO_ORDEN, fecha, money, qty, hoy } from "../api";
import { Btn, Chip, Drawer, ErrorBox, Field, Input, Select, Table, Td, Title, tonoOrden, useLoad, useToast } from "../ui";
import { DiagramaFlujo, comprobanteDe, etapaDe } from "../flujo";
import OrdenForm from "./OrdenForm";

export default function Ordenes({ ir, nav }: { ir: (r: string, x?: any) => void; nav?: any }) {
  const toast = useToast();
  const { data, error, reload } = useLoad(async () => {
    const [ord, art, prov, cmp] = await Promise.all([api<any[]>("/ordenes"), api<any[]>("/articulos"), api<any[]>("/proveedores"), api<any[]>("/comprobantes")]);
    return { ord, art, prov, cmp };
  }, []);
  const [nueva, setNueva] = useState(false);
  const [selId, setSelId] = useState<string | null>(nav?.orden ?? null);
  const [err, setErr] = useState<unknown>(null);
  const [rec, setRec] = useState({ recepcion_ext: "", tipo: "T", fecha: hoy() });
  const sel = data?.ord.find((o) => o.id === selId);

  const accion = async (ruta: string, ok: string, body?: unknown) => {
    try { const r = await api(`/ordenes/${sel.id}/${ruta}`, { method: "POST", body: body ?? {} }); toast(ok + (r?.evento_generado ? ". Aviso listo para Activos Fijos" : "")); setErr(null); reload(); }
    catch (e) { setErr(e); }
  };

  return (
    <>
      <Title sub="El total se calcula con las líneas. Una orden aprobada ya no se edita: se anula o se emite otra."
        right={<Btn v="primary" onClick={() => setNueva(true)}>Nueva orden</Btn>}>Órdenes de compra</Title>
      <ErrorBox e={error} />
      <Table head={["Número", "Proveedor", "Fecha", { t: "Total sin IGV", right: true }, "Estado", ""]} empty="No hay órdenes. Emita una desde una solicitud o con «Nueva orden».">
        {data?.ord.map((o) => (
          <tr key={o.id} className="cursor-pointer hover:bg-papel/70" onClick={() => { setSelId(o.id); setErr(null); }}>
            <Td className="num font-medium">{o.numero}</Td>
            <Td>{o.proveedor}{o.lineas.some((l: any) => l.es_activo_fijo) && <span className="ml-2"><Chip tono="azul">Activo fijo</Chip></span>}</Td>
            <Td className="num">{fecha(o.fecha)}</Td>
            <Td right>{o.moneda} {money(o.total_sin_igv)}</Td>
            <Td><Chip tono={tonoOrden(o.estado)}>{ESTADO_ORDEN[o.estado]}</Chip></Td>
            <Td right><Btn small v="ghost">Abrir</Btn></Td>
          </tr>
        ))}
      </Table>

      {nueva && data && <OrdenForm proveedores={data.prov} articulos={data.art} onClose={() => setNueva(false)} onSaved={() => { toast("Orden creada en borrador"); setNueva(false); reload(); }} />}

      {sel && (
        <Drawer title={`Orden ${sel.numero}`} wide onClose={() => setSelId(null)}>
          <ErrorBox e={err} />
          <DiagramaFlujo key={sel.id + sel.estado} actual={etapaDe({ orden: sel, cmp: comprobanteDe(sel, data!.cmp) })}
            soloServicios={sel.lineas.every((l: any) => l.es_servicio)} className="mb-5" />
          <dl className="mb-5 grid grid-cols-3 gap-4">
            <div><dt className="text-suave">Proveedor</dt><dd className="font-medium">{sel.proveedor}</dd></div>
            <div><dt className="text-suave">Creada por</dt><dd>{sel.creado_por}</dd></div>
            <div><dt className="text-suave">Aprobada por</dt><dd>{sel.aprobado_por ?? "—"}</dd></div>
          </dl>
          <Table head={["Artículo", { t: "Cantidad", right: true }, { t: "Precio", right: true }, { t: "Importe", right: true }]}>
            {sel.lineas.map((l: any) => (
              <tr key={l.item}>
                <Td>{l.descripcion}{l.es_activo_fijo && <span className="ml-2"><Chip tono="azul">Activo fijo</Chip></span>}{l.es_servicio && <span className="ml-2"><Chip>Servicio</Chip></span>}</Td>
                <Td right>{qty(l.cantidad)} {l.unidad}</Td><Td right>{money(l.precio)}</Td><Td right>{money(l.total_linea)}</Td>
              </tr>
            ))}
          </Table>
          <p className="mt-2 text-right text-[15px]">Total sin IGV <b className="num ml-2">{sel.moneda} {money(sel.total_sin_igv)}</b></p>

          {sel.recepciones.length > 0 && (
            <div className="mt-5"><h3 className="mb-2 font-semibold">Recepciones de Almacén</h3>
              {sel.recepciones.map((r: any) => <div key={r.recepcion_ext} className="text-suave"><span className="num text-texto">{r.recepcion_ext}</span> · {r.tipo === "T" ? "total" : "parcial"} · {fecha(r.fecha)}</div>)}</div>
          )}

          <div className="mt-6 flex flex-wrap gap-2 border-t border-linea pt-4">
            {sel.estado === "BOR" && <Btn v="primary" onClick={() => accion("enviar-aprobacion", "Enviada a aprobación")}>Enviar a aprobación</Btn>}
            {sel.estado === "PEN" && <Btn v="primary" onClick={() => accion("aprobar", "Orden aprobada")}>Aprobar orden</Btn>}
            {sel.estado === "APR" && <Btn v="primary" onClick={() => accion("enviar-proveedor", "Enviada al proveedor")}>Marcar enviada al proveedor</Btn>}
            {sel.estado === "REC" && <Btn v="primary" onClick={() => ir("comprobantes", { orden: sel })}>Registrar comprobante</Btn>}
            {["BOR", "PEN", "APR", "ENV"].includes(sel.estado) && sel.recepciones.length === 0 && <Btn v="danger" onClick={() => accion("anular", "Orden anulada")}>Anular orden</Btn>}
          </div>
          {sel.estado === "PEN" && <p className="mt-2 text-[12.5px] text-suave">Solo un usuario con permiso de aprobador en Planillas puede aprobar (pruebe con Carla Huanca).</p>}

          {["APR", "ENV"].includes(sel.estado) && (
            <div className="mt-6 rounded-lg border border-linea bg-white p-4">
              <h3 className="mb-1 font-semibold">Registrar recepción de Almacén</h3>
              <p className="mb-3 text-[12.5px] text-suave">Compras guarda solo el identificador. Una recepción total deja la orden lista para su comprobante.</p>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Código en Almacén"><Input value={rec.recepcion_ext} onChange={(e) => setRec({ ...rec, recepcion_ext: e.target.value })} placeholder="REC-ALM-0002" /></Field>
                <Field label="Alcance"><Select value={rec.tipo} onChange={(e) => setRec({ ...rec, tipo: e.target.value })}><option value="T">Total</option><option value="P">Parcial</option></Select></Field>
                <Field label="Fecha"><Input type="date" value={rec.fecha} onChange={(e) => setRec({ ...rec, fecha: e.target.value })} /></Field>
              </div>
              <Btn className="mt-3" onClick={() => accion("recepciones", "Recepción registrada", rec)}>Registrar recepción</Btn>
            </div>
          )}
        </Drawer>
      )}
    </>
  );
}
