# fdpm-mcp-http — the remote MCP server.
#
# Build from the repository root:
#   docker build -f fdpm-cli/Dockerfile -t fdpm-mcp:1.3.0 fdpm-cli
#
# The image runs as an unprivileged user with a read-only root filesystem;
# the only writable path it needs is the data volume it is given.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci
COPY . .
RUN npm run build
# Drop dev dependencies in place rather than re-resolving them in the
# runtime stage. A second `npm ci --omit=dev` there would re-run the
# `@fdpm/zod-bridge` workspace's `prepare` script, which needs `tsc` —
# a dev dependency that no longer exists at that point.
RUN npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    FDPM_DATA_DIR=/data \
    FDPM_MCP_HTTP_PORT=8080 \
    FDPM_MCP_HTTP_HOST=0.0.0.0
WORKDIR /app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/dist ./dist
COPY --from=build /app/plugins ./plugins

# Normalise read permissions on everything the runtime reads.
#
# This is not defensive tidying. Ten of the twenty plugin manifests are mode
# 600 in the working tree, `COPY` preserves that, and the container runs as an
# unprivileged user — so plugin discovery died with EACCES and the server came
# up with `core:empty` and nothing else. Git does not track read bits, so a
# clean-clone CI build would have worked and only a local build broke: exactly
# the kind of difference an image must not inherit from a developer's umask.
RUN chmod -R a+rX /app

# uid 10001 matches the securityContext in k8s/statefulset.yaml.
RUN useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin fdpm \
 && mkdir -p /data && chown 10001:10001 /data
USER 10001

EXPOSE 8080
VOLUME ["/data"]

# SIGTERM drains sessions and disposes pooled Hosts before exit.
STOPSIGNAL SIGTERM

# The probe endpoints are unauthenticated by design; Kubernetes probes
# cannot speak MCP and must never need a token.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.FDPM_MCP_HTTP_PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/src/bin/fdpm-mcp-http.js"]
