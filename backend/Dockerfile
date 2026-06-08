# ---- build ----
FROM node:22-bookworm AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build          # nest build → dist/

# ---- runtime ----
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# Cloud Run injects PORT=8080; the app reads API_PORT, so we map it.
ENV API_PORT=8080
EXPOSE 8080
CMD ["node", "dist/api.main.js"]