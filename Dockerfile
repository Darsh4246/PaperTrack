FROM node:20-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
      postgresql supervisor ca-certificates \
    && ln -s "$(ls -d /usr/lib/postgresql/*)" /usr/lib/postgresql/current \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY . .

COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY entrypoint.sh /entrypoint.sh
COPY start-app.sh /start-app.sh

# Strip Windows line endings and make scripts executable
RUN sed -i 's/\r$//' /entrypoint.sh /start-app.sh /etc/supervisor/conf.d/supervisord.conf \
    && chmod +x /entrypoint.sh /start-app.sh

ENTRYPOINT ["/entrypoint.sh"]