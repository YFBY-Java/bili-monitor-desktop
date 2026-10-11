# 榜单 API 返回码与错误分类（2026-10-07）

## 原业务与实现

对照只读原 `BilibiliLiveRankApiClient.ensureSuccess`：使用已有 `response_code` 复刻 `JsonNode.asInt(Integer.MIN_VALUE)`，接受数值文本形式的成功码；-101 为登录失效，-352/-412 为风控，其余为 UNKNOWN。风控、>=500 和 -500 标记可重试，实际转换后的 biliCode 和 HTTP 200 保留。非空白标量 message 原文保留，容器及空白使用原默认 `Bilibili live rank API error: <code>`。

只修改 Python 的该函数；没有新增自动重试、修改 WBI/备用接口、字段解析、保存阶段、契约、UI、超时或并发。guard 失败停止当前类型后续页，但继续下一个类型，保持原服务流程。

## 少量验证与复核

一个新增真实 Core→Python stdio→SQLite 流程与一个扩充的既有 Python case 共用完整三响应 fixture：文本 0 成功落库，-101 保留消息空格，文本 -500 使用原默认消息。检查请求次数、attempt1、错误日志元数据、旧快照/条目/CAS 保留及数据库重开。生产修改前有文本成功码及错误分类两个实际 RED，修改后 GREEN。

既有 Python rank 文件6项、mypy20源、全 workspace TypeScript、相关 Black/isort和生产构建通过。五路径 true-before/final manifest/diff/brief 在 `.tools/temp/20261007-rank-api-values-*`（before 目录为 `20261007-rank-api-value-before`）；限定只读复核 C0/I0/Minor0，收尾重新核对五个 hash/字节无漂移。

当前生产隔离 Electron 五业务页/真实 IPC/单 Core 重启/资料文本与 JSON 保留/退出自有 PID0 通过：`.tools/temp/bmd-production-final-Wf4Yl8`，Core65452→52488。自动采集/OAuth关闭，没有用户数据库、真实凭据或平台请求，不是原生保存/安装验收。

## 阶段结果与接续

一次 `check.cmd`（session50251）终态 exit1：Core1044/1045，仅 Subject501 创建流程6610ms超原5000ms；Task3/Contracts511/Storage77/Realtime162/Browser12通过。本次粉丝大批量流程通过不证明间歇性能根因已修，Desktop及后续未由该命令执行，旧冷桌面失败仍开放。

接续原榜单三个响应的字段选择与数值解析：原主榜/备用榜不同字段，firstPresent 不等于第一个非空对象；完整 Long64/整数转换和精确出口仍未完成。原始条目物理JSONB、布局失败策略、性能/桌面稳定性、真人/原生/最新安装与全量目标继续 OPEN。原 B/S 只读、累积工作区/空 index 保留，无提交推送或全局记忆写入。
