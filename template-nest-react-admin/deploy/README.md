# 部署

四件套：`postgres` + 一次性 `migrate` + `api` + `nginx`。

## 首次部署

```bash
cd deploy
cp .env.example .env
# 填 POSTGRES_PASSWORD / JWT_SECRET（openssl rand -base64 48 | tr -d '\n'）
# 生产把 DEV_MODE 设为 false，并配好 SMTP_*
chmod 600 .env
mkdir -p /data/nest-react-admin/logs
chown 1000:1000 /data/nest-react-admin/logs   # 容器以 node(uid 1000) 运行
docker compose up -d --build
```

访问 `http://<服务器IP>:8000`。端口在 `docker-compose.yml` 的 nginx `ports` 里改。

## 迁移

- `migrate` 服务每次 `up` 都会跑一次；已经应用过的迁移会被 TypeORM 跳过，是幂等的。
- 改了实体后在本机生成迁移，提交代码后再部署：

```bash
cd backend
npm run migration:generate -- src/database/migrations/AddSomething
npm run migration:run
```

## 发版

```bash
cd deploy
docker compose up -d --build
docker compose logs -f api
```

- 日志在宿主 `/data/nest-react-admin/logs/`：`api.log`（完整时间线）、`api-error.log`（只有 ERROR+）、
  `archive/api.YYYY-MM-DD.log`（按天归档，默认保留 7 天）。
- 容器重建不会带走当天日志（bind mount）。

## 检查清单

- [ ] `JWT_SECRET` 是随机值，不是示例值
- [ ] `POSTGRES_PASSWORD` 不是 `change-me`
- [ ] `DEV_MODE=false` 且 SMTP 已配置（否则 api 启动即失败，属预期）
- [ ] `COOKIE_SECURE=true`（浏览器走 HTTPS 时）
- [ ] 日志目录属主是 1000:1000
- [ ] `docker compose ps` 里 api 是 `(healthy)`
