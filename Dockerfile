# Multi-stage build for Render / any Docker host
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY database/package.json database/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY scripts/package.json scripts/
RUN npm ci
COPY . .
RUN npm run build -w shared \
 && npm run generate -w database \
 && npm run build -w frontend \
 && npm run build -w backend

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
ENV MARKET_DATA_MODE=live
ENV LIVE_ONLY=true
ENV MIN_ODDS=1.60
ENV MAX_ODDS=1.80
ENV TARGET_PROFIT=0.05
ENV REAL_EXECUTION_ENABLED=false
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/shared ./shared
COPY --from=build /app/database ./database
COPY --from=build /app/backend ./backend
COPY --from=build /app/frontend/dist ./frontend/dist
COPY --from=build /app/scripts ./scripts
EXPOSE 3001
CMD ["npm", "run", "start", "-w", "backend"]
