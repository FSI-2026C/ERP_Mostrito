import { useState } from "react";
import { api, fecha, money, session } from "../api";
import { Btn, Chip, ErrorBox, Input, Table, Td, Title, useLoad, Field } from "../ui";

const CAMPOS = ["Periodo", "CUO", "Correlativo del asiento", "Fecha de emisión", "Fecha de vencimiento", "Tipo de comprobante", "Serie", "Año DUA/DSI", "Número", "Número final", "Tipo de documento del proveedor", "Número de documento", "Razón social", "Base imponible gravada", "IGV", "Base (gravada y no gravada)", "IGV", "Base (sin derecho a crédito)", "IGV", "Adquisiciones no gravadas", "ISC", "Otros tributos", "Importe total", "Moneda", "Tipo de cambio", "Fecha del comprobante modificado", "Tipo del comprobante modificado", "Serie del comprobante modificado", "Dependencia aduanera", "Número del comprobante modificado", "Fecha constancia de detracción", "Número constancia de detracción", "Marca de retención", "Clasificación de bienes y servicios", "Contrato o proyecto", "Error tipo 1", "Error tipo 2", "Error tipo 3", "Error tipo 4", "Medio de pago", "Estado"];

export default function Registro() {
  const ahora = new Date();
  const [mes, setMes] = useState(`${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`);
  const periodo = mes.replace("-", "");
  const { data, error } = useLoad(() => api<any>(`/registro-compras/${periodo}`), [periodo]);
  const [abierta, setAbierta] = useState<number | null>(null);

  const descargar = async () => {
    const r = await fetch(`/api/v1/registro-compras/${periodo}/txt`, { headers: { "X-Empresa": session.empresa, "X-Usuario": session.usuario } });
    const blob = await r.blob();
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = data.nombre_archivo; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <Title sub="Libro 080100 con los comprobantes vigentes del periodo: 41 campos separados por barra vertical. Los anulados no entran."
        right={<><Field label="Periodo"><Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} /></Field><Btn v="primary" className="mt-[22px]" disabled={!data?.filas.length} onClick={descargar}>Descargar TXT</Btn></>}>Registro de Compras 8.1</Title>
      <ErrorBox e={error} />
      {data && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-linea bg-white px-4 py-3">
            <div><span className="text-suave">Archivo </span><span className="num font-medium">{data.nombre_archivo}</span></div>
            <div><span className="text-suave">Comprobantes </span><b className="num">{data.totales.comprobantes}</b></div>
            <div><span className="text-suave">Base </span><b className="num">{money(data.totales.base)}</b></div>
            <div><span className="text-suave">IGV </span><b className="num">{money(data.totales.igv)}</b></div>
            <div><span className="text-suave">Total </span><b className="num">{money(data.totales.total)}</b></div>
          </div>
          <Table head={["CUO", "Emisión", "Comprobante", "Proveedor", { t: "Base", right: true }, { t: "IGV", right: true }, { t: "Total", right: true }, "Estado", ""]}
            empty="No hay comprobantes registrados en este periodo. El archivo se descarga con indicador «sin información».">
            {data.filas.flatMap((f: string[], i: number) => [
              <tr key={i}>
                <Td className="num">{f[1]}</Td><Td className="num">{f[3]}</Td><Td className="num">{f[5]}-{f[6]}-{f[8]}</Td>
                <Td>{f[12]}<span className="block text-[12px] text-suave">{f[10] === "6" ? "RUC" : "Doc. " + f[10]} {f[11]}</span></Td>
                <Td right>{money(f[13])}</Td><Td right>{money(f[14])}</Td><Td right className="font-medium">{money(f[22])}</Td>
                <Td><Chip tono="verde">{f[40]}</Chip></Td>
                <Td right><Btn small v="ghost" onClick={() => setAbierta(abierta === i ? null : i)}>{abierta === i ? "Ocultar campos" : "Ver 41 campos"}</Btn></Td>
              </tr>,
              abierta === i && (
                <tr key={`d${i}`}><td colSpan={9} className="bg-papel px-4 py-3">
                  <div className="grid grid-cols-3 gap-x-6 gap-y-1">
                    {f.map((v, k) => <div key={k} className="flex justify-between gap-3 border-b border-linea/70 py-0.5 text-[13px]"><span className="text-suave">{k + 1}. {CAMPOS[k]}</span><span className="num font-medium">{v || "—"}</span></div>)}
                  </div>
                </td></tr>
              ),
            ])}
          </Table>
          <p className="mt-3 max-w-[80ch] text-[12.5px] text-suave">Campo 41 (estado): 1 si la compra es del periodo, 6 si es de los 12 meses anteriores, 7 si es más antigua. Las notas de crédito van en negativo y los importes en dólares se convierten a soles con el tipo de cambio.</p>
        </>
      )}
    </>
  );
}
