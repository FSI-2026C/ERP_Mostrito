"""Consulta a Planillas (solo lectura). Solo se guarda el código del trabajador, nunca una copia."""
import httpx
from .. import config
from . import simulador


def trabajadores() -> list[dict]:
    url = config.MODULOS.get("planillas")
    if url:
        r = httpx.get(f"{url.rstrip('/')}/trabajadores", timeout=10)
        r.raise_for_status()
        return r.json()
    return simulador.planillas_trabajadores()


def buscar(trabajador_id: str) -> dict | None:
    return next((t for t in trabajadores() if t["trabajador_id"] == trabajador_id), None)
