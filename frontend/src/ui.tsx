import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError } from "./api";

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

/* ---------- Botones ---------- */
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { v?: "primary" | "quiet" | "danger" | "ghost"; small?: boolean };
export function Btn({ v = "quiet", small, className, ...p }: BtnProps) {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap";
  const size = small ? "h-7 px-2.5 text-[13px]" : "h-9 px-3.5";
  const tone = {
    primary: "bg-azul text-white hover:bg-[#2340cf]",
    quiet: "bg-white text-texto border border-linea hover:bg-papel",
    danger: "bg-white text-rojo border border-rojo/30 hover:bg-rojo-claro",
    ghost: "text-suave hover:text-texto hover:bg-black/5",
  }[v];
  return <button className={cx(base, size, tone, className)} {...p} />;
}

/* ---------- Estados ---------- */
const TONOS: Record<string, string> = {
  gris: "bg-black/5 text-suave", azul: "bg-azul-claro text-azul", verde: "bg-verde-claro text-verde",
  ambar: "bg-ambar-claro text-ambar", rojo: "bg-rojo-claro text-rojo",
};
export function Chip({ tono = "gris", children }: { tono?: keyof typeof TONOS | string; children: ReactNode }) {
  return <span className={cx("inline-flex items-center rounded px-1.5 py-0.5 text-[12px] font-medium leading-4", TONOS[tono])}>{children}</span>;
}
export const tonoOrden = (e: string) => ({ BOR: "gris", PEN: "ambar", APR: "azul", ENV: "azul", REC: "verde", FAC: "verde", ANU: "rojo" }[e] ?? "gris");
export const tonoEvento = (e: string) => ({ P: "ambar", E: "verde", F: "rojo" }[e] ?? "gris");
export const nombreEvento = (e: string) => ({ P: "Pendiente", E: "Entregado", F: "Fallido" }[e] ?? e);

/* ---------- Formularios ---------- */
const campo = "h-9 w-full rounded-md border border-linea bg-white px-2.5 text-texto placeholder:text-suave/60 focus:border-azul disabled:bg-papel disabled:text-suave";
export const Input = (p: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(campo, p.className)} />;
export const Select = (p: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(campo, p.className)} />;
export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-[13px] font-medium text-texto">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-suave">{hint}</span>}
    </label>
  );
}

/* ---------- Tabla ---------- */
export function Table({ head, children, empty }: { head: (string | { t: string; right?: boolean })[]; children: ReactNode; empty?: ReactNode }) {
  const rows = Array.isArray(children) ? children.length : children ? 1 : 0;
  return (
    <div className="overflow-x-auto rounded-lg border border-linea bg-white">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-linea bg-[#F8F9FB] text-[12.5px] text-suave">
            {head.map((h, i) => {
              const o = typeof h === "string" ? { t: h } : h;
              return <th key={i} className={cx("px-3 py-2 font-medium", (o as any).right && "text-right")}>{o.t}</th>;
            })}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-linea/70 [&>tr:last-child]:border-0">{children}</tbody>
      </table>
      {rows === 0 && <div className="px-4 py-10 text-center text-suave">{empty}</div>}
    </div>
  );
}
export const Td = ({ right, className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement> & { right?: boolean }) =>
  <td {...p} className={cx("px-3 py-2.5 align-middle", right && "text-right num", className)} />;

/* ---------- Panel lateral ---------- */
export function Drawer({ title, onClose, children, wide, footer }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-tinta/40" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside role="dialog" aria-label={title} className={cx("drawer flex h-full w-full flex-col bg-papel shadow-2xl", wide ? "max-w-[860px]" : "max-w-[560px]")}>
        <header className="flex items-center justify-between border-b border-linea bg-white px-5 py-3">
          <h2 className="text-[16px] font-semibold">{title}</h2>
          <Btn v="ghost" small onClick={onClose} aria-label="Cerrar">Cerrar</Btn>
        </header>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-linea bg-white px-5 py-3">{footer}</footer>}
      </aside>
    </div>
  );
}

/* ---------- Mensajes ---------- */
export function ErrorBox({ e }: { e: unknown }) {
  if (!e) return null;
  const a = e as ApiError;
  return (
    <div role="alert" className="mb-4 rounded-md border border-rojo/25 bg-rojo-claro px-3 py-2.5 text-[13px] text-rojo">
      <div className="font-medium">{a.message}</div>
      {a.regla && a.regla !== "VALIDACION" && a.regla !== "RED" && <div className="mt-0.5 text-[12px] opacity-80">Regla {a.regla}</div>}
      {a.campos?.map((c, i) => <div key={i} className="mt-0.5 text-[12px]">{c.campo}: {c.mensaje}</div>)}
    </div>
  );
}

type Toast = { id: number; msg: string };
const ToastCtx = createContext<(m: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastHost({ children }: { children: ReactNode }) {
  const [t, setT] = useState<Toast[]>([]);
  const push = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setT((x) => [...x, { id, msg }]);
    setTimeout(() => setT((x) => x.filter((i) => i.id !== id)), 3600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2">
        {t.map((i) => <div key={i.id} className="rounded-md bg-tinta px-4 py-2.5 text-[13px] text-white shadow-lg">{i.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- JSON ---------- */
function resaltar(json: string) {
  return json.replace(/("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(\.\d+)?([eE][+-]?\d+)?)/g, (m) => {
    let c = "n";
    if (m.startsWith('"')) c = m.endsWith(":") ? "k" : "s";
    else if (m === "null") c = "z";
    else if (m === "true" || m === "false") c = "b";
    return `<span class="${c}">${m.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</span>`;
  });
}
export function JsonView({ data, label, className }: { data: unknown; label?: string; className?: string }) {
  const txt = JSON.stringify(data, null, 2);
  const [ok, setOk] = useState(false);
  return (
    <div className={cx("overflow-hidden rounded-lg bg-tinta", className)}>
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5 text-[12px] text-white/60">
        <span>{label ?? "JSON"}</span>
        <button className="rounded px-1.5 py-0.5 hover:bg-white/10 hover:text-white" onClick={() => { navigator.clipboard?.writeText(txt); setOk(true); setTimeout(() => setOk(false), 1400); }}>
          {ok ? "Copiado" : "Copiar"}
        </button>
      </div>
      <pre className="json max-h-[520px] overflow-auto p-3 text-white/90" dangerouslySetInnerHTML={{ __html: resaltar(txt) }} />
    </div>
  );
}

export const Title = ({ children, sub, right }: { children: ReactNode; sub?: ReactNode; right?: ReactNode }) => (
  <div className="mb-5 flex items-end justify-between gap-4">
    <div>
      <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.01em]">{children}</h1>
      {sub && <p className="mt-1 max-w-[62ch] text-suave">{sub}</p>}
    </div>
    <div className="flex gap-2">{right}</div>
  </div>
);

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivo = true;
    fn().then((d) => vivo && (setData(d), setError(null))).catch((e) => vivo && setError(e));
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { data, error, reload: () => setN((x) => x + 1) };
}
