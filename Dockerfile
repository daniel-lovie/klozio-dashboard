# Railway deploy image. Nixpacks/Railpack builds were dying on the Metal builder
# with zero logs, so we pin the whole build ourselves.
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
# migration is idempotent; runs on every boot before the server starts
CMD ["sh", "-c", "node --experimental-strip-types scripts/migrate.mts && npm start"]
