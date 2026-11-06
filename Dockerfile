FROM node:20-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
      postgresql supervisor curl ca-certificates zstd \
    && ln -s "$(ls -d /usr/lib/postgresql/*)" /usr/lib/postgresql/current \
    && rm -rf /var/lib/apt/lists/*

# Install Ollama
RUN curl -fsSL https://ollama.com/install.sh | sh

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh /etc/supervisor/conf.d/supervisord.conf \
    && chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]