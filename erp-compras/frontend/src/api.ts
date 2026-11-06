export const session = { empresa: "emp-prueba", usuario: "T-001" };

export class ApiError extends Error {
  constructor(public regla: string | null, message: string, public campos?: { campo: string; mensaje: string }[], public status = 0) {
    super(message);
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; empresa?: string; usuario?: string } = {}): Promise<T> {
  const r = await fetch(`/api/v1${path}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: { "Content-Type": "application/json", "X-Empresa": opts.empresa ?? session.empresa, "X-Usuario": opts.usuario ?? session.usuario },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  }).catch(() => { throw new ApiError("RED", "No se pudo conectar con el servidor de Compras. Revise que el backend esté encendido en el puerto 8000."); });
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    const e = data?.error ?? {};
    throw new ApiError(e.regla ?? null, e.mensaje ?? `Error ${r.status}`, e.campos, r.status);
  }
  return data as T;
}

export const money = (v: string | number | null | undefined) =>
  v == null || v === "" ? "—" : Number(v).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const qty = (v: string | number) => Number(v).toLocaleString("es-PE", { maximumFractionDigits: 3 });
export const fecha = (v: string | null | undefined) => (v ? v.slice(0, 10).split("-").reverse().join("/") : "—");
export const hoy = () => new Date().toISOString().slice(0, 10);
export const periodoDe = (iso: string) => iso.slice(0, 4) + iso.slice(5, 7);

export const ESTADO_ORDEN: Record<string, string> = {
  BOR: "Borrador", PEN: "Por aprobar", APR: "Aprobada", ENV: "Enviada", REC: "Recibida", FAC: "Facturada", ANU: "Anulada",
};
export const CLASIFICACION: Record<string, string> = {
  "1": "Mercadería, insumos o suministros", "2": "Activo fijo", "3": "Otros activos",
  "4": "Gastos de representación, viaje, capacitación u otros", "5": "Otros gastos y servicios",
};
