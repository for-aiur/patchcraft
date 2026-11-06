FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci && npx playwright install --with-deps chromium --only-shell && npm cache clean --force
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]
