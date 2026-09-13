# M07 B站登录采集与本地生命周期 Implementation Plan

> **For agentic workers:** 使用适用的内联测试驱动流程逐项执行；完成后独立只读审查。不自动提交/推送，不派发实现代理。

**Goal:** 对齐原登录 Cookie、二维码会话及凭据校验流程，确保本地撤销/退出后迟到响应不能恢复凭据或写关闭的数据库。

**Architecture:** 保持 Renderer → typed bridge → Local Core → SQLite/Python Worker。Python只采集与解析，Core独占凭据事务和Outbox。平台响应与原生传输可在测试边界替换，业务服务和隔离SQLite使用真实实现。

**Tech Stack:** 现有 TypeScript、Python、SQLite、Vitest、pytest/httpx；不加依赖或业务HTTP服务。

**Readability:** 只新增现有TypeScript/Python实现，不引入C/C++/Rust/Java。

## Global Constraints

- 原 `D:\codex_work\BiliMonitor` 只读，基线 `fa2faa6`；客户端 `b7ce839`，不启动原工程，不触碰真人平台/凭据/用户库。
- 所有工具、测试库、截图和产物位于D盘，命令先加载 `scripts/activate-environment.ps1`。
- 原依据为 AuthService、QrLoginSessionStore、PassportClient、CookieState、CredentialRepository、AuthProperties及Auth/CookieState测试；连接升级监听器已预检，连接完整审计仍在M07后续，不宣告全项完成。
- 默认二维码180秒、后续轮询1500ms、会话每60000ms清理；在 `expiresAt + 180秒 < now` 时删除，保留过期/成功结果供再次读取。
- 不把原“重新校验”扩展成Cookie自动刷新；状态查询/扫码结果仅元数据，完整秘密只通过显式凭据接口返回。

## Task 1: 原Cookie采集与请求语义

**Files:** Modify `workers/python/src/bmd_workers/bilibili_auth.py`; Create `workers/python/tests/test_bilibili_auth_parity.py`。

**Interfaces:** 保持 `generate_qr_login()`、`poll_qr_login(qrcode_key,cookies)`、`validate_credential(cookies)`。复审确认必须分开HTTP会话与登录展示Cookie：共享WorkerPollResult兼容追加可选 `jarCookies`，保留真实HTTP CookieJar有效作用域/到期/删除；`cookies`仍为原凭据展示/校验语义。Core使用 `result.jarCookies ?? result.cookies` 保存下一轮会话，旧v1响应可继续读取。

**Additional files:** `packages/contracts/src/bilibili-auth.ts`、`schemas/bilibili-auth.v1.schema.json`、`src/bilibili-auth-contracts.test.ts`（相对contracts目录）；新增共享 `packages/contracts/fixtures/auth-poll-cookies.json`，由TS和Python共同验证。新增测试辅助 `packages/core-runtime/src/__fixtures__/auth-migration.ts`。Core外层退出补 `local-core-runtime.ts`，真实边界证据位于 `apps/desktop/src/main/auth-workflow.integration.test.ts`，不跨项目导入内部测试文件。

- [x] RED：响应Cookie覆盖旧jar，但回调query只补缺失；原值不擅自strip/二次解码；展示Cookie只保留COOKIE_ORDER白名单，HTTP会话保留其他有效Cookie。验证实际poll入口与nav HTTP请求，替换httpx传输而非业务解析。

```python
result = module.parse_qr_poll_response(raw, [{"name": "SESSDATA", "value": "SYNTHETIC_HEADER"}])
assert result["cookies"][0]["value"] == "SYNTHETIC_HEADER"
```

- [x] GREEN：先生成query候选，再用已有response覆盖同名项；Set-Cookie优先于jar，保留元数据。nav按原顺序显式发送Cookie Header，timeout/connect为10/5秒，User-Agent/Referer采用原默认值，禁重定向。

```python
cookies = merge_cookies(cross_domain_cookies, response_cookies)
headers = {**HEADERS, "Cookie": "; ".join(f"{c['name']}={c['value']}" for c in merge_cookies([], cookies))}
```

- [x] 网络异常只返回稳定错误和endpoint，不回显含二维码key的底层URL。用包含合成key的RequestError验证无泄漏。
- [x] 定向pytest通过，并验证成功输出仍被既有TypeScript/Python契约接受。
- [x] 复审RED：空值删除及省略Domain/Path的连续轮询，HTTP会话不携带raw缺省作用域或query补缺Cookie。只在内部Worker契约追加jarCookies；TS/JSON Schema/Python对同一fixture验证新旧响应及非法jarCookie拒绝。

## Task 2: 二维码会话与终态

**Files:** Modify `packages/core-runtime/src/bilibili-auth-service.ts`; Create `packages/core-runtime/src/bilibili-auth-parity.test.ts`。

**Interfaces:** 保留 `startQrLogin/pollQrLogin/stop`；内部增加清理计时器，默认60000ms且unref；Core停止释放计时器和会话。无新增Renderer API。

- [x] RED：生成前起算有效期；空Cookie成功响应返回FAILED而非抛“不完整”；成功缓存不再次验证/激活；同会话并发poll共用在途请求；超过保留期查询NOT_FOUND。

```ts
const start = await service.startQrLogin()
const [first, second] = await Promise.all([service.pollQrLogin(start.loginId), service.pollQrLogin(start.loginId)])
expect(first).toEqual(second)
expect(activationEvents).toHaveLength(1)
```

- [x] GREEN：生成前保存createdAt；按原保留期清会话；空Cookie返回可重试FAILED，不缓存未知FAILED；使用内部Promise防止同会话重复激活。
- [x] 最早Cookie到期按时间数值比较，避免不同秒精度的ISO字符串排序错误。

## Task 3: 本地撤销/退出与凭据恢复

**Files:** Modify `packages/core-runtime/src/bilibili-auth-service.ts`; Create `packages/core-runtime/src/bilibili-auth-lifecycle.test.ts`。

**Interfaces:** 既有 `currentStatus/currentCredential/refreshCurrentCredential/revokeCurrentCredential/connectionCredential/stop` 不变，取消使用CORE_STOPPED，已被撤销/替换的校验返回BILIBILI_AUTH_CHANGED。

- [x] RED：stop后迟到generate/poll/nav不能写数据库，stop幂等且不重启Worker；撤销/新凭据激活后旧校验不能把旧记录重新设ACTIVE；撤销使旧二维码不能重新建凭据。

```ts
const pending = service.currentStatus().catch(error => error)
await service.revokeCurrentCredential()
releaseNav()
expect(await pending).toMatchObject({ code: "BILIBILI_AUTH_CHANGED" })
expect(database.findActiveBilibiliCredential()).toBeUndefined()
```

- [x] GREEN：每个异步返回及catch前检查Core生命周期；校验写入前确认活跃credentialId仍一致，撤销清理旧会话及生成代次；停止先置状态再停source，不把取消记为认证过期。
- [x] 隔离库关闭并重开，使用同一测试密钥恢复凭据；校验不改原createdAt/refreshToken；撤销重开后仍NONE。验证事务Outbox不含秘密。
- [x] 独立只读审查、完整 `check.cmd`、`git diff --check`、生产fixture扫描与原仓库clean复验。记录本项证据和未覆盖真人/原生验收；后续用户已明确要求本地提交，不推送。

## 核验命令

```powershell
. .\scripts\activate-environment.ps1
python -m pytest workers/python/tests/test_bilibili_auth.py workers/python/tests/test_bilibili_auth_parity.py workers/python/tests/test_auth_cookie_contracts.py
pnpm --filter @bmd/core-runtime exec vitest run src/bilibili-auth-service.test.ts src/bilibili-auth-parity.test.ts src/bilibili-auth-lifecycle.test.ts
.\check.cmd
git diff --check
```

## 提交前验证记录

- 2026-09-13 用户明确要求“提交代码”，停止扩展业务，只核验并提交当前改动。复现mypy对Cookie.rest值类型的报错后，将HttpOnly存在标记由None改为空字符串；读取侧按属性存在判断，语义不变，不更改依赖或业务范围。
- 最新完整 `check.cmd` 退出0：Node423项、Python77项，TypeScript/mypy、Black/isort、Electron生产构建与D盘路径检查通过。生产包未发现本轮合成登录fixture，原仓库仍为 `fa2faa6` 且工作区干净。
- 本清单仅完成登录采集、会话和本地生命周期子项；M07连接联动、真人扫码、原生客户端验收及M08–M18仍未完成。
