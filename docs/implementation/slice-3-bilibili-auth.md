# 原 B/S B站扫码登录态本地纵切

事实源：`D:\codex_work\BiliMonitor` commit `01200f3c21c264963f2ad92a23b991ced5b0c9c0` 中的 `BilibiliAuthController`、`BilibiliAuthService`、`BilibiliPassportClient`、`BilibiliCredentialRepository`、V7 migration 和原 Vue 登录面板。

## 业务语义

- `startQrLogin` 只生成一张 B站 Passport 二维码，返回 `loginId`、二维码 URL、180 秒有效期和 1500ms 轮询间隔。
- `pollQrLogin` 映射原平台码：86101→WAITING、86090→SCANNED、86038→EXPIRED、0→SUCCESS，其余→FAILED。
- 本地过期和平台过期都缓存 EXPIRED 终态；SUCCESS 缓存完整成功投影，重复轮询不重复激活凭据。
- 成功前必须同时存在 `SESSDATA`、`bili_jct` 和 `DedeUserID`；Cookie 来自 Worker 会话、响应 Cookie 和回调 URL 的稳定合并。
- `status` 与 `refresh` 都通过 `x/web-interface/nav` 校验；`refresh` 明确返回 `refreshed=false`，不伪装成 Cookie 刷新。
- 新凭据激活会撤销旧 ACTIVE；撤销不删除粉丝、直播或历史数据。

## 本地链路

```text
React Auth Panel
  -> narrow Preload IPC
  -> Electron Main
  -> Local Core BilibiliAuthService
  -> NDJSON stdio Python Auth Worker
  -> passport.bilibili.com / api.bilibili.com
```

应用不开放业务端口。Auth Worker 与 Crawler Worker 是独立进程角色；Cookie、CSRF、refresh token 和认证响应不进入 CAS、日志或 Outbox。

## 凭据保护

1. Electron Main 首次启动生成随机 32 字节密钥。
2. 密钥原文只存在于进程内；落盘前由 Windows `safeStorage` 保护。
3. Local Core 使用 AES-256-GCM 对完整凭据载荷加密。
4. SQLite v4 的 `bilibili_auth_credential.encrypted_payload` 只保存认证密文，并用 partial unique index 保证唯一 ACTIVE。
5. 状态查询不携带完整凭据；只有用户点击“查看完整登录态”才调用专用 IPC 解密，关闭抽屉后清除 Renderer 状态。

## 验证

- Contract：3 项；Storage：唯一 ACTIVE、替换、撤销和账号投影；Cipher：往返、密钥长度和篡改检测。
- Core：五态、终态缓存、成功激活、重启恢复、复验、查看、撤销和不完整 Cookie 拒绝。
- Worker：二维码/轮询/nav 解析、回调 URL Cookie 合并、auth role 路由和严格 mypy。
- Desktop：OS 密钥封装、Core router、Preload bridge、登录态 UI 和凭据抽屉。
- 2026-08-29 已用临时 live smoke 跑通 `Local Core -> Auth Worker -> B站二维码生成接口`；测试临时文件已删除。

仍需真人手工验收：用 Bilibili 手机客户端扫码并确认，观察 WAITING→SCANNED→SUCCESS，重启应用后复验账号，再撤销并确认状态变为 NONE。
