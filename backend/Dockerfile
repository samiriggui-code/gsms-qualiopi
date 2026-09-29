# Image unique pour l'API et le worker (structure adaptée de Mizan, MIT — voir THIRD_PARTY_NOTICES.md).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app
COPY referentials ./referentials
COPY docker/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh \
    && useradd --create-home --uid 10001 gsms \
    && mkdir -p /app/var/documents \
    && chown -R gsms /app/var
USER gsms

EXPOSE 8000
ENTRYPOINT ["/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
