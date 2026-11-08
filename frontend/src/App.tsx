import { useEffect, useState } from "react";
import { api, session } from "./api";
import { ToastHost, cx, useLoad } from "./ui";
import Resumen from "./pages/Resumen";
import Proveedores from "./pages/Proveedores";
import Solicitudes from "./pages/Solicitudes";
import Ordenes from "./pages/Ordenes";
import Comprobantes from "./pages/Comprobantes";
import Registro from "./pages/Registro";
import Integracion from "./pages/Integracion";

/* Iconos de trazo simple (24×24) */
const I: Record<string, string> = {
  resumen: "M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z",
  solicitudes: "M8 4h8l3 3v13H5V4h3M9 11h6M9 15h4",
  ordenes: "M4 6h2l2 10h10l2-7H7M10 20h.01M17 20h.01",
  comprobantes: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  registro: "M4 5h16v14H4zM4 10h16M10 10v9",
  proveedores: "M3 20V9l5-3v4l5-3v4l5-3v12zM7 16h2M12 16h2",
  integracion: "M7 7h4v4H7zM13 13h4v4h-4zM11 9h4v4M9 11v4h4",
};
const Icono = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);

const RUTAS = [
  { id: "resumen", t: "Resumen", C: Resumen, g: "" },
  { id: "solicitudes", t: "Solicitudes", C: Solicitudes, g: "Flujo de compra" },
  { id: "ordenes", t: "Órdenes de compra", C: Ordenes, g: "Flujo de compra" },
  { id: "comprobantes", t: "Comprobantes", C: Comprobantes, g: "Flujo de compra" },
  { id: "registro", t: "Registro de Compras 8.1", C: Registro, g: "Reportes y datos" },
  { id: "proveedores", t: "Proveedores", C: Proveedores, g: "Reportes y datos" },
  { id: "integracion", t: "Integración con módulos", C: Integracion, g: "Reportes y datos" },
];

const VECINOS = [
  { t: "Cuentas por Pagar", d: "recibe compras · devuelve pago", on: true },
  { t: "Activos Fijos", d: "recibe activos · devuelve alta", on: true },
  { t: "Planillas", d: "Compras consulta trabajadores", on: true },
  { t: "Control de Asistencia", d: "sin intercambio con Compras", on: false },
];

const USUARIOS = [
  { id: "T-001", n: "Ana Quispe · Compradora" },
  { id: "T-002", n: "Luis Mamani · Solicitante" },
  { id: "T-003", n: "Carla Huanca · Aprobadora" },
  { id: "T-004", n: "Jorge Ccori · Cesado" },
];

export default function App() {
  const [ruta, setRuta] = useState(() => location.hash.slice(1) || "resumen");
  const [empresa, setEmpresa] = useState(session.empresa);
  const [usuario, setUsuario] = useState(session.usuario);
  const [nav, setNav] = useState<any>(null);
  const { data: empresas } = useLoad(() => api<any[]>("/empresas"), []);

  session.empresa = empresa; session.usuario = usuario;
  useEffect(() => {
    const f = () => setRuta(location.hash.slice(1) || "resumen");
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  const ir = (id: string, extra?: any) => { setNav(extra ?? null); location.hash = id; };

  const actual = RUTAS.find((r) => r.id === ruta) ?? RUTAS[0];
  const emp = empresas?.find((e) => e.id === empresa);

  return (
    <ToastHost>
      <div className="flex h-full">
        <nav className="flex w-[248px] shrink-0 flex-col bg-tinta text-white/80" aria-label="Navegación">
          <div className="px-5 pb-4 pt-5">
            <div className="text-[19px] font-semibold tracking-[-0.01em] text-white">Compras</div>
            <div className="text-[12.5px] text-white/50">ERP académico · Tribu Egresos</div>
          </div>
          <ul className="flex-1 overflow-y-auto px-2">
            {RUTAS.map((r, i) => (
              <li key={r.id}>
                {r.g && r.g !== RUTAS[i - 1]?.g && <div className="px-3 pb-1.5 pt-4 text-[12px] text-white/40">{r.g}</div>}
                <a href={`#${r.id}`} aria-current={r.id === actual.id ? "page" : undefined}
                  className={cx("relative mb-0.5 flex items-center gap-2.5 rounded-md px-3 py-2 transition-colors",
                    r.id === actual.id ? "bg-white/12 font-medium text-white before:absolute before:-left-2 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r before:bg-[#7c93ff]" : "hover:bg-white/6 hover:text-white")}>
                  <Icono d={I[r.id]} />{r.t}
                </a>
              </li>
            ))}
          </ul>
          <div className="border-t border-white/10 px-5 py-4">
            <div className="mb-2 text-[12.5px] text-white/50">Módulos conectados</div>
            <ul className="space-y-2">
              {VECINOS.map((v) => (
                <li key={v.t} className={cx("flex gap-2.5 text-[13px]", !v.on && "opacity-50")}>
                  <span className={cx("mt-[5px] h-2 w-2 shrink-0 rounded-full", v.on ? "bg-[#4fd3a7]" : "border border-white/40")} />
                  <span><span className="block text-white">{v.t}</span><span className="block text-[12px] text-white/50">{v.d}</span></span>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-end gap-4 border-b border-linea bg-white px-6 py-2.5">
            <span className="mr-auto text-[13px] text-suave">{actual.g ? `${actual.g} / ` : ""}<span className="font-medium text-texto">{actual.t}</span></span>
            {emp?.es_prueba && <span className="rounded bg-ambar-claro px-2 py-0.5 text-[12px] font-medium text-ambar">Empresa de prueba: se puede borrar y recargar</span>}
            <label className="flex items-center gap-2 text-[13px] text-suave">Empresa
              <select className="h-8 rounded-md border border-linea bg-white px-2 text-texto" value={empresa} onChange={(e) => setEmpresa(e.target.value)}>
                {(empresas ?? [{ id: "emp-prueba", razon_social: "Empresa de prueba" }]).map((e: any) => <option key={e.id} value={e.id}>{e.razon_social}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-[13px] text-suave">Usuario
              <select className="h-8 rounded-md border border-linea bg-white px-2 text-texto" value={usuario} onChange={(e) => setUsuario(e.target.value)}>
                {USUARIOS.map((u) => <option key={u.id} value={u.id}>{u.n}</option>)}
              </select>
            </label>
          </header>
          <main className="flex-1 overflow-y-auto px-8 py-6" key={empresa + usuario + actual.id}>
            <actual.C ir={ir} nav={nav} />
          </main>
        </div>
      </div>
    </ToastHost>
  );
}
