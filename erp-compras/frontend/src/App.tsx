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

const RUTAS = [
  { id: "resumen", t: "Resumen", C: Resumen },
  { id: "proveedores", t: "Proveedores", C: Proveedores },
  { id: "solicitudes", t: "Solicitudes", C: Solicitudes },
  { id: "ordenes", t: "Órdenes de compra", C: Ordenes },
  { id: "comprobantes", t: "Comprobantes", C: Comprobantes },
  { id: "registro", t: "Registro de Compras 8.1", C: Registro },
  { id: "integracion", t: "Integración con módulos", C: Integracion },
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
          <ul className="flex-1 px-2">
            {RUTAS.map((r) => (
              <li key={r.id}>
                <a href={`#${r.id}`} aria-current={r.id === actual.id ? "page" : undefined}
                  className={cx("mb-0.5 block rounded-md px-3 py-2 transition-colors", r.id === actual.id ? "bg-white/12 font-medium text-white" : "hover:bg-white/6 hover:text-white")}>
                  {r.t}
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
