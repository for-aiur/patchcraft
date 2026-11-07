FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci && npm cache clean --force

FROM dependencies AS tests
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npx playwright install --with-deps chromium --no-shell && rm -rf /var/lib/apt/lists/*
COPY . .
CMD ["npm", "test"]

FROM dependencies AS authoring
COPY . .
EXPOSE 3001
CMD ["npm", "run", "server"]

FROM dependencies AS app
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]
