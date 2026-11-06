import os
from decimal import Decimal

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg://compras:compras@localhost:5432/compras_db")
SCHEMA = "compras"
TASA_IGV = Decimal(os.getenv("TASA_IGV", "0.18"))  # RE_CmpIgvCal: tasa configurable

# URL base de cada módulo destino. Si está vacía, Compras usa el simulador interno
# (útil para desarrollar sin que el otro equipo tenga su API lista).
MODULOS = {
    "cuentas-por-pagar": os.getenv("CXP_URL", ""),
    "activos-fijos": os.getenv("ACTIVOS_URL", ""),
    "planillas": os.getenv("PLANILLAS_URL", ""),
}
