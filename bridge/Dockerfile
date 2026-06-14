FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY bridge/package.json bridge/package.json
RUN npm ci --omit=dev --workspace @varco/bridge --include-workspace-root=false

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY bridge bridge
RUN npm ci
RUN npm --workspace @varco/bridge run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/bridge/node_modules ./bridge/node_modules
COPY --from=build /app/bridge/dist ./bridge/dist
COPY --from=build /app/bridge/package.json ./bridge/package.json
EXPOSE 8787
CMD ["node", "bridge/dist/node.js"]
