FROM node:20-alpine

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev || npm install --omit=dev

# Copy application files
COPY . .

# Default to port 4000 (can be overridden via build args or environment)
ARG PORT=4000
ENV PORT=${PORT}
ENV HOST=0.0.0.0
ENV NODE_ENV=production

EXPOSE 4000

CMD ["node", "server.js"]
