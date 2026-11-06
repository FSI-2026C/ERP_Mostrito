import { useState } from "react";
import { api, money } from "../api";
import { Btn, Drawer, ErrorBox, Field, Input, Select } from "../ui";

type Linea = { articulo_id: string; cantidad: string; precio: string };

export default function OrdenForm({ proveedores, articulos, inicial, solicitudId, onClose, onSaved }: {
  proveedores: any[]; articulos: any[]; inicial?: Linea[]; solicitudId?: string; onClose: () => void; onSaved: () => void;
}) {
  const [prov, setProv] = useState(proveedores.find((p) => p.estado === "A")?.id ?? "");
  const [moneda, setMoneda] = useState("PEN");
  const [lineas, setLineas] = useState<Linea[]>(inicial?.length ? inicial : [{ articulo_id: articulos[0]?.id ?? "", cantidad: "1", precio: "" }]);
  const [err, setErr] = useState<unknown>(null);
  const set = (i: number, k: keyof Linea, v: string) => setLineas(lineas.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const total = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.precio) || 0), 0);

  const guardar = async () => {
    try {
      await api("/ordenes", { body: { proveedor_id: prov, moneda, solicitud_id: solicitudId ?? null, lineas: lineas.map((l) => ({ ...l, precio: l.precio || "0" })) } });
      onSaved();
    } catch (e) { setErr(e); }
  };

  return (
    <Drawer title={solicitudId ? "Emitir orden desde la solicitud" : "Nueva orden de compra"} wide onClose={onClose}
      footer={<><span className="mr-auto text-suave">Total sin IGV <b className="num ml-1 text-[16px] text-texto">{moneda} {money(total)}</b></span>
        <Btn onClick={onClose}>Cancelar</Btn><Btn v="primary" onClick={guardar}>Guardar como borrador</Btn></>}>
      <ErrorBox e={err} />
      <div className="mb-5 grid grid-cols-3 gap-4">
        <Field label="Proveedor" className="col-span-2"><Select value={prov} onChange={(e) => setProv(e.target.value)}>
          {proveedores.filter((p) => p.estado === "A").map((p) => <option key={p.id} value={p.id}>{p.nombre} · {p.numero_doc}</option>)}</Select></Field>
        <Field label="Moneda"><Select value={moneda} onChange={(e) => setMoneda(e.target.value)}><option value="PEN">Soles</option><option value="USD">Dólares</option></Select></Field>
      </div>
      <div className="rounded-lg border border-linea bg-white">
        <div className="grid grid-cols-[1fr_110px_130px_110px_32px] gap-2 border-b border-linea px-3 py-2 text-[12.5px] text-suave">
          <span>Artículo</span><span className="text-right">Cantidad</span><span className="text-right">Precio sin IGV</span><span className="text-right">Importe</span><span />
        </div>
        {lineas.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_110px_130px_110px_32px] items-center gap-2 border-b border-linea/70 px-3 py-2 last:border-0">
            <Select aria-label="Artículo" value={l.articulo_id} onChange={(e) => set(i, "articulo_id", e.target.value)}>
              {articulos.filter((a) => a.estado === "A").map((a) => <option key={a.id} value={a.id}>{a.descripcion}{a.es_activo_fijo ? " (activo fijo)" : a.es_servicio ? " (servicio)" : ""}</option>)}</Select>
            <Input aria-label="Cantidad" className="num text-right" inputMode="decimal" value={l.cantidad} onChange={(e) => set(i, "cantidad", e.target.value)} />
            <Input aria-label="Precio" className="num text-right" inputMode="decimal" placeholder="0.0000" value={l.precio} onChange={(e) => set(i, "precio", e.target.value)} />
            <span className="num text-right">{money((Number(l.cantidad) || 0) * (Number(l.precio) || 0))}</span>
            <Btn v="ghost" small aria-label="Quitar línea" disabled={lineas.length === 1} onClick={() => setLineas(lineas.filter((_, j) => j !== i))}>✕</Btn>
          </div>
        ))}
        <div className="px-3 py-2"><Btn small onClick={() => setLineas([...lineas, { articulo_id: articulos[0]?.id ?? "", cantidad: "1", precio: "" }])}>Agregar línea</Btn></div>
      </div>
    </Drawer>
  );
}
