# Stage 1: Build client
FROM node:22-alpine AS builder

WORKDIR /app

# Install root dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Install client dependencies
COPY client/package.json client/package-lock.json* ./client/
RUN cd client && npm install

# Copy source
COPY . .

# Build client (outputs to client/dist/)
RUN cd client && npx vite build

# Stage 2: Production
FROM node:22-alpine

WORKDIR /app

# Install root dependencies (production + tsx for running server)
COPY package.json package-lock.json* ./
RUN npm install --production && npm install tsx

# Copy server source (tsx runs TypeScript directly)
COPY server/ ./server/

# Copy built client
COPY --from=builder /app/client/dist ./client/dist

# Copy database (will be overridden by volume mount on Railway)
COPY lupita.db ./lupita.db

# Copy .env template (Railway injects env vars, but keep as fallback)
COPY .env* ./

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

CMD ["npx", "tsx", "server/server.ts"]
