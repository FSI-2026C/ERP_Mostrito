import { useState } from "react";
import { api, fecha, qty } from "../api";
import { Btn, Chip, Drawer, ErrorBox, Field, Input, Select, Table, Td, Title, useLoad, useToast } from "../ui";
import OrdenForm from "./OrdenForm";

const tono = (e: string) => (e === "PEN" ? "ambar" : e === "ATE" ? "verde" : "rojo");
const nombre = (e: string) => ({ PEN: "Pendiente", ATE: "Atendida", ANU: "Anulada" }[e] ?? e);

export default function Solicitudes({ ir }: { ir: (r: string) => void }) {
  const toast = useToast();
  const { data, error, reload } = useLoad(async () => {
    const [sol, art, prov, trab] = await Promise.all([api<any[]>("/solicitudes"), api<any[]>("/articulos"), api<any[]>("/proveedores"), api<any[]>("/personal/trabajadores")]);
    return { sol, art, prov, trab };
  }, []);
  const [nueva, setNueva] = useState(false);
  const [orden, setOrden] = useState<any>(null);
  const [err, setErr] = useState<unknown>(null);
  const [area, setArea] = useState("Logística");
  const [lineas, setLineas] = useState([{ articulo_id: "", cantidad: "1", observacion: "" }]);

  const crear = async () => {
    try {
      await api("/solicitudes", { body: { area, lineas: lineas.map((l) => ({ ...l, articulo_id: l.articulo_id || data!.art[0].id, observacion: l.observacion || null })) } });
      toast("Solicitud creada"); setNueva(false); setErr(null); reload();
    } catch (e) { setErr(e); }
  };
  const anular = async (id: string) => { try { await api(`/solicitudes/${id}/anular`, { method: "POST", body: {} }); toast("Solicitud anulada"); reload(); } catch (e) { setErr(e); } };
  const quien = (id: string) => data?.trab.find((t) => t.trabajador_id === id)?.nombres ?? id;
  const art = (id: string) => data?.art.find((a) => a.id === id)?.descripcion ?? id;

  return (
    <>
      <Title sub="Pedidos internos de un área. El solicitante se valida contra Planillas: un trabajador cesado no puede pedir."
        right={<Btn v="primary" onClick={() => setNueva(true)}>Nueva solicitud</Btn>}>Solicitudes de compra</Title>
      <ErrorBox e={error ?? err} />
      <Table head={["Número", "Fecha", "Solicitante", "Pide", "Estado", ""]} empty="No hay solicitudes. Un área registra aquí lo que necesita comprar.">
        {data?.sol.map((s) => (
          <tr key={s.id}>
            <Td className="num font-medium">{s.numero}</Td>
            <Td className="num">{fecha(s.fecha)}</Td>
            <Td>{quien(s.solicitante)}<span className="block text-[12px] text-suave">{s.area}</span></Td>
            <Td>{s.lineas.map((l: any) => <span key={l.item} className="block">{qty(l.cantidad)} × {art(l.articulo_id)}</span>)}</Td>
            <Td><Chip tono={tono(s.estado)}>{nombre(s.estado)}</Chip></Td>
            <Td right>{s.estado === "PEN" && <span className="flex justify-end gap-1.5"><Btn small onClick={() => setOrden(s)}>Emitir orden</Btn><Btn small v="ghost" onClick={() => anular(s.id)}>Anular</Btn></span>}</Td>
          </tr>
        ))}
      </Table>

      {nueva && data && (
        <Drawer title="Nueva solicitud" onClose={() => setNueva(false)} footer={<><Btn onClick={() => setNueva(false)}>Cancelar</Btn><Btn v="primary" onClick={crear}>Crear solicitud</Btn></>}>
          <ErrorBox e={err} />
          <p className="mb-4 text-suave">Se registra a nombre del usuario activo en la barra superior.</p>
          <Field label="Área solicitante" className="mb-4"><Input value={area} onChange={(e) => setArea(e.target.value)} /></Field>
          {lineas.map((l, i) => (
            <div key={i} className="mb-3 grid grid-cols-[1fr_90px] gap-2">
              <Select aria-label="Artículo" value={l.articulo_id || data.art[0]?.id} onChange={(e) => setLineas(lineas.map((x, j) => j === i ? { ...x, articulo_id: e.target.value } : x))}>
                {data.art.filter((a) => a.estado === "A").map((a) => <option key={a.id} value={a.id}>{a.descripcion}</option>)}</Select>
              <Input aria-label="Cantidad" className="num text-right" value={l.cantidad} onChange={(e) => setLineas(lineas.map((x, j) => j === i ? { ...x, cantidad: e.target.value } : x))} />
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
