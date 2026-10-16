FROM node:24.19.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# CPU inference uses the binaries bundled in the npm package; no CUDA download.
RUN ONNXRUNTIME_NODE_INSTALL=skip npm ci
COPY . .
ARG APP_BASE_PATH=/abrgozin
ENV APP_BASE_PATH=$APP_BASE_PATH
RUN npm run build && npm prune --omit=dev && npm cache clean --force

FROM node:24.19.0-bookworm-slim
WORKDIR /app
ARG APP_BASE_PATH=/abrgozin
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321 APP_BASE_PATH=$APP_BASE_PATH DATA_DIR=/data MODEL_CACHE_DIR=/data/models
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node shared ./shared
COPY --chown=node:node scripts ./scripts
USER node
EXPOSE 4321
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:4321'+process.env.APP_BASE_PATH+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.mjs"]
