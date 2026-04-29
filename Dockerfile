FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache git
COPY . .
RUN corepack enable && corepack prepare --activate
RUN pnpm install
RUN pnpm build
CMD ["node", "dist/server.js"]
EXPOSE 4004
