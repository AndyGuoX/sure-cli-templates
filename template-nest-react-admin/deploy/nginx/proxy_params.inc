# 两个 /api/ location 共用的转发头（分叉就是「一个接口 IP 对、一个不对」）。
# 后缀是 .inc 不是 .conf：conf.d/*.conf 会被 nginx 当成独立 server 配置自动加载。
# ⚠️ 必须是 `$http_host`（原样转发客户端的 Host 头），不能用 `$host` ——
# `$host` 会把端口吃掉，same-origin.middleware.ts 的 Origin/Host 比较就会判成跨站。
proxy_set_header Host $http_host;
proxy_set_header X-Real-IP $remote_addr;
# 覆盖而不是追加：上面的 real_ip 已把真实客户端解析出来了，后端只需要信一跳（trust proxy=1）。
proxy_set_header X-Forwarded-For $remote_addr;
proxy_connect_timeout 5s;
proxy_read_timeout 60s;
proxy_send_timeout 60s;
