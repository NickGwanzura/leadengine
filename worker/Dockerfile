FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PLAYWRIGHT_BROWSERS_PATH=/opt/browsers
WORKDIR /worker
COPY worker/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && playwright install --with-deps chromium && chmod -R a+rX /opt/browsers
COPY worker/ ./
RUN useradd --create-home crawler && chown -R crawler:crawler /worker
USER crawler
CMD ["python", "main.py"]
