import { useState } from "react";
import { api } from "../api";
import { Btn, Chip, Drawer, ErrorBox, Field, Input, Select, Table, Td, Title, useLoad, useToast } from "../ui";

const TIPOS: Record<string, string> = { "6": "RUC", "1": "DNI", "4": "Carnet de extranjería", "7": "Pasaporte", "0": "Sin RUC (no domiciliado)", A: "Cédula diplomática" };

export default function Proveedores() {
  const toast = useToast();
  const { data, error, reload } = useLoad(() => api<any[]>("/proveedores"), []);
  const [abierto, setAbierto] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [f, setF] = useState({ tipo_doc: "6", numero_doc: "", nombre: "" });

  const guardar = async () => {
    try { await api("/proveedores", { body: f }); toast("Proveedor guardado"); setAbierto(false); setErr(null); setF({ tipo_doc: "6", numero_doc: "", nombre: "" }); reload(); }
    catch (e) { setErr(e); }
  };
  const estado = async (p: any) => { await api(`/proveedores/${p.id}/estado?activo=${p.estado !== "A"}`, { method: "PATCH" }); reload(); };

  return (
    <>
      <Title sub="Personas y empresas a las que se les compra. Un RUC lleva 11 dígitos y un DNI 8." right={<Btn v="primary" onClick={() => setAbierto(true)}>Nuevo proveedor</Btn>}>Proveedores</Title>
      <ErrorBox e={error} />
      <Table head={["Documento", "Nombre o razón social", "Estado", ""]} empty="Todavía no hay proveedores. Registre el primero con «Nuevo proveedor».">
        {data?.map((p) => (
          <tr key={p.id}>
            <Td><span className="text-suave">{TIPOS[p.tipo_doc]}</span> <span className="num ml-1 font-medium">{p.numero_doc}</span></Td>
            <Td>{p.nombre}</Td>
            <Td><Chip tono={p.estado === "A" ? "verde" : "gris"}>{p.estado === "A" ? "Activo" : "Inactivo"}</Chip></Td>
            <Td right><Btn small v="ghost" onClick={() => estado(p)}>{p.estado === "A" ? "Desactivar" : "Activar"}</Btn></Td>
          </tr>
        ))}
      </Table>
      {abierto && (
        <Drawer title="Nuevo proveedor" onClose={() => setAbierto(false)} footer={<><Btn onClick={() => setAbierto(false)}>Cancelar</Btn><Btn v="primary" onClick={guardar}>Guardar proveedor</Btn></>}>
          <ErrorBox e={err} />
          <div className="space-y-4">
            <Field label="Tipo de documento"><Select value={f.tipo_doc} onChange={(e) => setF({ ...f, tipo_doc: e.target.value })}>
              {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Número de documento" hint="Se guarda tal cual, con los ceros iniciales."><Input inputMode="numeric" value={f.numero_doc} onChange={(e) => setF({ ...f, numero_doc: e.target.value })} /></Field>
            <Field label="Nombre o razón social"><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Field>
          </div>
        </Drawer>
      )}
    </>
  );
}
