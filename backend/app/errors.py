from fastapi import HTTPException


def regla(codigo: str, mensaje: str, status: int = 422):
    """Error de regla de negocio: el código es el RE_/RN_ del diccionario."""
    return HTTPException(status, {"regla": codigo, "mensaje": mensaje})
