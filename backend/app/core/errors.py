from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class DomainError(Exception):
    status_code = 400
    code = "domain_error"

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class NotFoundError(DomainError):
    status_code = 404
    code = "not_found"


class ConflictError(DomainError):
    status_code = 409
    code = "conflict"


class InvalidStateError(DomainError):
    status_code = 422
    code = "invalid_state"


class ForbiddenError(DomainError):
    status_code = 403
    code = "forbidden"


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def _domain(_: Request, exc: DomainError):  # noqa: ANN202
        return JSONResponse(status_code=exc.status_code, content={"error": exc.code, "detail": exc.message})
