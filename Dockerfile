FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/client/package.json apps/client/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/sim/package.json packages/sim/package.json
RUN npm ci --ignore-scripts

FROM dependencies AS build
COPY . .
RUN npm run build

FROM dependencies AS production-dependencies
RUN npm ci --omit=dev --ignore-scripts --workspace=@diep-fried/server

FROM node:22-alpine AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
WORKDIR /app
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/LICENSE ./LICENSE
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/client/dist ./apps/client/dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "apps/server/dist/main.js"]
