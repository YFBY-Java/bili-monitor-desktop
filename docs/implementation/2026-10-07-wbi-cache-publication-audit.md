# WBI 材料派生与成功缓存发布（2026-10-07）

## 原业务与修复

只读核对原 `BilibiliWbiSigner.fetchKeys/mixinKey`：nav 成功后，在 `fetchKeys` 内按映射表前32项执行 Java `String.charAt` 派生，再返回并发布成功缓存；不能先把无效材料缓存起来，待后续榜单签名时才失败。映射前32项最大索引58，因此59个 UTF-16 单元足够，原实现不要求64字符或十六进制内容。先读本地API资料库 `docs/misc/sign/wbi.md` 的 nav/材料获取和重排算法；它仅是历史参考，不替代原业务基线或真人协议验收。

Python此前直接发布抓取材料；58单元的强制刷新会污染成功缓存，并在后续签名中抛出未处理 IndexError。现在 `_wbi_keys` 在发布前复用签名用的纯 `_wbi_mixin_key` 派生；仅捕获派生 IndexError，返回 PARSE_ERROR/可重试/nav/HTTP200，保持已有成功缓存且不发榜单请求。安全固定消息保留原解析错误前缀，不泄露材料，也不声称复制JVM异常全文。

共享派生按UTF-16单元选择，随后UTF-8编码对孤立代理使用原Java的ASCII `?`；不误拒绝59单元的补充平面字符。原 Cookie/Referer/缓存时间/强刷/取消/其它错误分类及输入协议不变。直接提供 `wbiKeys` 的分支不扩成另一套错误处理。Node侧已有短材料保护，本片两个Node快照文件完全未改，不把其已有行为计成新修复。

## 必要验证与复核

- 仅扩充原唯一 Runtime/HTTP回放 case，没有新命名case、测试文件或矩阵。首次实际RED为签名IndexError；首次最小修复后，59 UTF-16单元输入又实际RED，随后修正派生索引/编码。现有ASCII59与UTF1659成功，ASCII58失败、旧缓存/请求数量/后续恢复断言保留。
- 两个既有Python测试文件最终35项通过，两文件Black/isort及mypy23源通过。没有调预算、减少数据量或重复全量检查求绿。
- 初审C0/I0/Minor1：Unicode流程缺固定签名断言。现有请求固定时钟1700000000，增加真实请求 `w_rid` 字面值 `a002dcec9569047244f356fb3b4603d3`。独立Node推导使用原charAt映射和UTF-8替换规则，不调用被测Python。初稿推导漏掉 `web_location=444.8` 导致v2失败，仅纠正测试期望；最终v3 35项通过、格式通过，生产源未改。复审C0/I0/Minor0，Minor闭合。
- 真实before为 `.tools/temp/20261007-wbi-short-key-before`；仅两个Python源改变，另外两个Node源hash一致，已有测试名称数保持。最终生产源21734字节/SHA256 `EF8FFA307F6D488D77F96C73BF18D826943C14290F7721B1A5028CE392A69815`；测试23634字节/SHA256 `0BDD0FC6D7853C4EF2222F97C1B2CE0AD5E64F35CD7C119880569C6D140C0D3C`。

## 当前阶段结果及交付边界

一次标准check session93298终态exit1：Task3、Contracts511、Storage78、Realtime162、Browser12通过；Core1045/1047，剩Subject501创建6254ms超过5s、粉丝2004历史33585ms超过30s。前次另外两个超时此次未出现，不冒称已修；Desktop和后续未由该命令执行。该阶段包含最终相同生产源、固定签名断言加入前的测试，最终断言由v3另行覆盖。

当前Desktop类型/全部生产bundle构建session59877终态exit0；当前源码生产smoke session23623终态exit0，D盘 `.tools/temp/bmd-platform-production-7q6zBQ`、schema18、Core27760→17196：五页、真实Main/Preload/Core/Python平台输入/失败证据与重启保留、无监控创建及正常退出自有PID0通过。该smoke不发送WBI短材料，不代替本片Runtime回放或真人榜单验收。

日志在D盘 `.tools/temp/20261007-wbi-short-key-{red,green,utf16-red,python-final,python-final-v2,python-final-v3,phase-check,build,production}.log`，真实失败记录保留。最新[独立目录版](2026-10-07-platform-account-directory-audit.md)在本片之前生成，包含平台输入/失败证据和schema18，但包内Python不含本WBI修复；本片没有重打/覆盖旧目录，不拿源码构建冒称最新安装包验收。

## 接续

继续原功能收尾审计，按当前源码与持久审计识别具体未完成项，不重做已完成的平台、普通材料API、字段/归档或JSON文本切片。工作台布局失败策略、配置/其他独立兼容域、规模性能与桌面冷启动稳定性、最新整包、真人扫码/OAuth/获准直播间及原生保存复制/安装仍OPEN。原B/S只读干净、客户端累积工作区/空暂存区保持，无提交推送、用户库/真实凭据/真实平台操作或全局记忆写入；完整目标active，不标M01–M18全部完成。
