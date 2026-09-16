FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY fetch_clarity.py .
ENTRYPOINT ["python", "fetch_clarity.py"]
