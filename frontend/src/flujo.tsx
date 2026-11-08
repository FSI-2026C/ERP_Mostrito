import { useState, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "./ui";

/* Mapa de estados del ciclo de compra: solicitud -> orden -> comprobante -> pago.
   Refleja las reglas de backend/app/services/flujo.py. */

export type Etapa = "SOL" | "BOR" | "PEN" | "APR" | "ENV" | "REC" | "FAC" | "PAG" | "SOL_ANU" | "ORD_ANU";
export const PRINCIPAL: Etapa[] = ["SOL", "BOR", "PEN", "APR", "ENV", "REC", "FAC", "PAG"];

type Info = { t: string; corto: string; que: string; quien: string; siguiente?: string; modulo?: string };
export const ETAPAS: Record<Etapa, Info> = {
  SOL: { t: "Solicitud pendiente", corto: "Solicitud", quien: "Compradora", modulo: "Planillas valida al solicitante",
    que: "Un área pidió artículos y todavía no hay orden de compra.", siguiente: "Emitir orden desde la solicitud" },
  BOR: { t: "Orden en borrador", corto: "Borrador", quien: "Compradora",
    que: "Se arma la orden: proveedor, cantidades y precios. Es el único momento en que se pueden cambiar las líneas.", siguiente: "Enviar a aprobación" },
  PEN: { t: "Orden por aprobar", corto: "Por aprobar", quien: "Aprobador", modulo: "Planillas confirma el permiso de aprobador",
    que: "La orden espera la aprobación de un trabajador activo con permiso de aprobador.", siguiente: "Aprobar orden" },
  APR: { t: "Orden aprobada", corto: "Aprobada", quien: "Compradora", modulo: "Activos Fijos recibe aviso si hay activos",
    que: "La orden ya no se edita. Si trae activos fijos, se avisa a Activos Fijos.", siguiente: "Marcar enviada al proveedor (o registrar la recepción directamente)" },
  ENV: { t: "Enviada al proveedor", corto: "Enviada", quien: "Almacén",
    que: "El proveedor tiene la orden; se espera la entrega en Almacén. Si son solo servicios, ya se puede registrar el comprobante.", siguiente: "Registrar recepción total" },
  REC: { t: "Recibida en Almacén", corto: "Recibida", quien: "Compradora", modulo: "Almacén entrega el código de recepción",
    que: "Almacén confirmó la recepción total. Falta el comprobante del proveedor.", siguiente: "Registrar comprobante" },
  FAC: { t: "Facturada", corto: "Facturada", quien: "Cuentas por Pagar", modulo: "Cuentas por Pagar recibe la compra",
    que: "El comprobante está en el Registro de Compras 8.1 y se envió a Cuentas por Pagar.", siguiente: "Esperar el pago de Cuentas por Pagar" },
  PAG: { t: "Pagada", corto: "Pagada", quien: "—", modulo: "Cuentas por Pagar confirma el pago",
    que: "Cuentas por Pagar informó el pago completo. El ciclo terminó." },
  SOL_ANU: { t: "Solicitud anulada", corto: "Anulada", quien: "—",
    que: "La solicitud se anuló antes de emitir una orden. No continúa." },
  ORD_ANU: { t: "Orden anulada", corto: "Orden anulada", quien: "—",
    que: "Una orden se puede anular mientras no tenga recepciones. Su solicitud vuelve a pendiente para emitir otra orden." },
};

/** Etapa actual a partir de la solicitud, su orden y el comprobante de esa orden. */
export function etapaDe({ sol, orden, cmp }: { sol?: any; orden?: any; cmp?: any }): Etapa {
  if (sol?.estado === "ANU") return "SOL_ANU";
  if (sol && sol.estado === "PEN" && (!orden || orden.estado === "ANU")) return "SOL";
  if (!orden) return "SOL";
  if (orden.estado === "ANU") return "ORD_ANU";
  if (orden.estado === "FAC" && cmp?.pago?.estado_pago === "PAGADO") return "PAG";
  return orden.estado as Etapa;
}

/** Orden vigente de una solicitud (la última que no esté anulada; si todas lo están, la última). */
export function ordenDe(sol: any, ordenes: any[]) {
  const suyas = ordenes.filter((o) => o.solicitud_id === sol.id);
  return suyas.filter((o) => o.estado !== "ANU").at(-1) ?? suyas.at(-1);
}
export const comprobanteDe = (orden: any, cmps: any[]) => orden && cmps.find((c) => c.orden_id === orden.id && c.estado === "R");

/* ---------- Geometría ---------- */
const W = 104, H = 52, PASO = 128, X0 = 16, Y = 112;
const x = (i: number) => X0 + i * PASO;
const cxOf = (i: number) => x(i) + W / 2;
const POS: Record<Etapa, { x: number; y: number }> = {
  ...Object.fromEntries(PRINCIPAL.map((e, i) => [e, { x: x(i), y: Y }])),
  SOL_ANU: { x: x(0), y: 228 },
  ORD_ANU: { x: 324, y: 228 },
} as any;

type Props = {
  actual?: Etapa;          // resalta el estado de un caso concreto
  soloServicios?: boolean; // la recepción se omite
  conteos?: Partial<Record<Etapa, number>>; // modo panorama: cantidad de casos en cada estado
  onAbrir?: (e: Etapa) => void;
  extra?: (e: Etapa) => ReactNode; // acciones bajo la explicación del estado elegido
  className?: string;
};

export function DiagramaFlujo({ actual, soloServicios, conteos, onAbrir, extra, className }: Props) {
  const [sel, setSel] = useState<Etapa | null>(null);
  const foco = sel ?? actual ?? "SOL";
  const iAct = actual ? PRINCIPAL.indexOf(actual) : -1;
  const estado = (e: Etapa): "actual" | "hecho" | "omitido" | "futuro" | "anulado" => {
    if (e === actual) return actual.endsWith("ANU") ? "anulado" : "actual";
    if (!actual) return "futuro";
    if (actual === "ORD_ANU") return e === "SOL" ? "hecho" : "futuro";
    const i = PRINCIPAL.indexOf(e);
    if (i >= 0 && i < iAct) return e === "REC" && soloServicios ? "omitido" : "hecho";
    return "futuro";
  };
  const enCamino = (a: Etapa, b: Etapa) => {
    const s = estado(b);
    return (s === "hecho" || s === "actual") && estado(a) === "hecho";
  };
  const info = ETAPAS[foco];

  return (
    <div className={cx("rounded-xl border border-linea bg-white", className)}>
      <div className="overflow-x-auto">
        <svg viewBox="0 0 1032 300" className="flujo block min-w-[760px]" role="group" aria-label="Diagrama de estados de la compra">
          <defs>
            {(["linea", "azul", "rojo"] as const).map((c) => (
              <marker key={c} id={`fl-${c}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" className={`fl-punta-${c}`} />
              </marker>
            ))}
          </defs>

          {/* Fases */}
          {[
            { t: "Solicitud", a: 0, b: 0 },
            { t: "Orden de compra", a: 1, b: 5 },
            { t: "Comprobante y pago", a: 6, b: 7 },
          ].map((g) => (
            <g key={g.t} className="fl-fase">
              <path d={`M${x(g.a)} 40 V34 H${x(g.b) + W} V40`} />
              <text x={(x(g.a) + x(g.b) + W) / 2} y={26} textAnchor="middle">{g.t}</text>
            </g>
          ))}

          {/* Avance principal */}
          {PRINCIPAL.slice(1).map((e, i) => {
            const on = enCamino(PRINCIPAL[i], e);
            return <line key={e} x1={x(i) + W} y1={Y + H / 2} x2={x(i + 1) - 2} y2={Y + H / 2}
              className={on ? "fl-on" : "fl-off"} markerEnd={`url(#fl-${on ? "azul" : "linea"})`} />;
          })}

          {/* Atajo: solo servicios */}
          <path d={`M${cxOf(4) + 12} ${Y} C${cxOf(4) + 12} 62, ${cxOf(6) - 12} 62, ${cxOf(6) - 12} ${Y - 3}`} className="fl-alt" markerEnd="url(#fl-linea)" />
          <text x={cxOf(5)} y={70} textAnchor="middle" className="fl-nota">solo servicios: sin recepción</text>

          {/* Anular solicitud */}
          <line x1={cxOf(0)} y1={Y + H} x2={cxOf(0)} y2={POS.SOL_ANU.y - 3} className="fl-anu" markerEnd="url(#fl-rojo)" />

          {/* Anular orden: desde borrador, por aprobar, aprobada o enviada */}
          {[1, 2, 3, 4].map((i) => (
            <path key={i} d={`M${cxOf(i)} ${Y + H} C${cxOf(i)} 200, ${376 + (i - 2.5) * 24} 200, ${376 + (i - 2.5) * 24} ${POS.ORD_ANU.y - 3}`}
              className="fl-anu" markerEnd="url(#fl-rojo)" />
          ))}
          <text x={POS.ORD_ANU.x + W + 12} y={POS.ORD_ANU.y + 30} className="fl-nota fl-nota-rojo">anular (sin recepciones)</text>

          {/* La solicitud vuelve a pendiente */}
          <path d={`M${POS.ORD_ANU.x + W / 2} ${POS.ORD_ANU.y + H} V288 H134 V${Y + H - 12} H${x(0) + W + 3}`} className="fl-alt" markerEnd="url(#fl-linea)" />
          <text x={240} y={283} textAnchor="middle" className="fl-nota">la solicitud vuelve a pendiente</text>

          {/* Anular comprobante */}
          <path d={`M${cxOf(6) - 14} ${Y + H} C${cxOf(6) - 14} 206, ${cxOf(5) + 14} 206, ${cxOf(5) + 14} ${Y + H + 3}`} className="fl-alt" markerEnd="url(#fl-linea)" />
          <text x={(cxOf(5) + cxOf(6)) / 2} y={222} textAnchor="middle" className="fl-nota">anular comprobante</text>

          {/* Nodos */}
          {(Object.keys(POS) as Etapa[]).map((e) => {
            const p = POS[e], s = estado(e), n = conteos?.[e];
            const anu = e.endsWith("ANU");
            const activar = () => { setSel(e); onAbrir?.(e); };
            return (
              <g key={e} transform={`translate(${p.x} ${p.y})`} tabIndex={0} role="button"
                aria-label={`${ETAPAS[e].t}${n != null ? `: ${n}` : ""}`} aria-pressed={foco === e}
                className={cx("fl-nodo", `fl-${s}`, anu && "fl-esanu", foco === e && "fl-foco", conteos && !n && "fl-vacio")}
                onClick={activar} onKeyDown={(k: KeyboardEvent) => (k.key === "Enter" || k.key === " ") && (k.preventDefault(), activar())}>
                <title>{ETAPAS[e].t}</title>
                {s === "actual" && <rect x={-5} y={-5} width={W + 10} height={H + 10} rx={14} className="fl-halo" />}
                <rect width={W} height={H} rx={10} className="fl-caja" />
                <text x={W / 2} y={conteos ? 22 : 31} textAnchor="middle" className="fl-t">{ETAPAS[e].corto}</text>
                {conteos && <text x={W / 2} y={41} textAnchor="middle" className="fl-n">{n ?? 0}</text>}
                {s === "hecho" && <path d={`M${W - 18} 9 l3.5 3.5 l6 -7`} className="fl-check" />}
                {s === "omitido" && <text x={W / 2} y={H + 14} textAnchor="middle" className="fl-nota">omitido</text>}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="grid gap-x-6 gap-y-2 border-t border-linea px-4 py-3 sm:grid-cols-[1fr_auto]" aria-live="polite">
        <div>
          <div className="flex items-center gap-2">
            <span className={cx("h-2.5 w-2.5 rounded-full", foco.endsWith("ANU") ? "bg-rojo" : foco === actual ? "bg-azul" : "border border-suave")} />
            <span className="font-semibold">{info.t}</span>
            {foco === actual && <span className="text-[12px] text-suave">estado actual</span>}
            {conteos && <span className="num text-[12px] text-suave">{conteos[foco] ?? 0} en este estado</span>}
          </div>
          <p className="mt-1 max-w-[70ch] text-suave">{info.que}</p>
          {extra && <div className="mt-2">{extra(foco)}</div>}
        </div>
        <dl className="grid min-w-[240px] grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px]">
          {info.siguiente && <><dt className="text-suave">Siguiente paso</dt><dd className="font-medium">{info.siguiente}</dd></>}
          {info.quien !== "—" && <><dt className="text-suave">Lo hace</dt><dd>{info.quien}</dd></>}
          {info.modulo && <><dt className="text-suave">Otro módulo</dt><dd>{info.modulo}</dd></>}
        </dl>
      </div>
    </div>
  );
}

/** Barra compacta de avance para usar dentro de una tabla. */
export function Avance({ etapa, soloServicios }: { etapa: Etapa; soloServicios?: boolean }) {
  const anu = etapa.endsWith("ANU");
  const i = PRINCIPAL.indexOf(etapa);
  return (
    <span className="inline-flex min-w-[150px] flex-col gap-1" title={ETAPAS[etapa].t}>
      <span className="flex gap-[3px]" aria-hidden>
        {PRINCIPAL.map((e, j) => (
          <span key={e} className={cx("h-1.5 flex-1 rounded-full",
            anu ? (etapa === "ORD_ANU" && j === 0 ? "bg-azul/40" : "bg-rojo/25")
              : j < i ? (e === "REC" && soloServicios ? "bg-azul/25" : "bg-azul/60") : j === i ? "bg-azul" : "bg-black/8")} />
        ))}
      </span>
      <span className={cx("text-[12.5px]", anu ? "text-rojo" : "text-texto")}>{ETAPAS[etapa].t}</span>
    </span>
  );
}
