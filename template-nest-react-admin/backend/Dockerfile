FROM node:24-alpine AS deps
WORKDIR /app
# 内网机器直连 npm 慢时保留镜像源；能直连可删掉这一行
RUN npm config set registry https://registry.npmmirror.com
COPY package.json package-lock.json* ./
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

# CI 的 test stage：与 build 共用 npm ci 那一层缓存
FROM build AS test
CMD ["sh", "-c", "npm run lint && npm test && npm run test:e2e"]

FROM build AS prune
RUN npm prune --omit=dev

# runtime 必须是文件里最后一个 stage —— 顺序错了默认产物会变成 test stage
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production TZ=Asia/Shanghai
COPY --from=prune /app/node_modules ./node_modules
COPY --from=prune /app/dist ./dist
COPY package.json ./
# 非 root 运行；日志目录先建好并交给它
RUN mkdir -p /app/logs && chown node:node /app/logs
USER node
EXPOSE 3100
# 应用启动不跑迁移：迁移由 compose 的独立 migrate 服务执行一次
CMD ["node", "dist/main.js"]
