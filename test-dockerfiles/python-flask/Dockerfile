# Python Flask Application with Libraries Example
# This demonstrates Chainguard Libraries for Python detection

FROM python:3.11-slim

WORKDIR /app

# Copy dependency file - hover here to see library detection!
COPY requirements.txt /app/

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app

EXPOSE 5000

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "app:app"]
