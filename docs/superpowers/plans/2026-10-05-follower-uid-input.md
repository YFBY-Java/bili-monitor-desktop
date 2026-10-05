# 粉丝 UID 输入迁移（2026-10-05）

## 范围和依据

只处理 M06 粉丝页添加监控用户的 UID 文本输入，不修改原 B/S、不新增业务服务端、不修改 HTTP DTO/IPC 承载语义、不扩大到 Subject 的另一条 safe-integer 输入路径。

原 `frontend/src/views/bilibili/BilibiliView.vue:13–22,506–522` 以普通 text input 接收内容，使用 `Number()` 后验证正整数，再由 Axios JSON 序列化发送。原 Controller/Long DTO 和实际安装 Jackson/Spring 的只读内存核验另见 HTTP 绑定审计。历史 card API `docs/user/info.md:518–715` 已读，仅作接口参考，不作当前平台验收。

用户本轮明确选择：**保留精确 UID，兼容前导零、空白等原输入形式；拒绝真正的小数和越界值。** 因此不复刻 Number 舍入成另一个 UID 的缺陷。精确 LongMAX 可输入，原 UI 在大数上的舍入/后端溢出和浮点饱和行为不是兼容目标；这是一项已获确认的行为修正。

## 实施步骤

- [x] 先写并运行 RED 的纯输入归一化测试：原 ECMAScript 数值语法、25种空白、精确大数、科学/进制写法、真实小数、零/负数、非法输入和越界。
- [x] 实现仅用于粉丝表单的精确 normalizer，输出现有 v2 canonical positive Long 字符串；绝不将 UID 经过 Number。限制由原正 Long 域决定，不增加 safe53 或任意输入长度上限。
- [x] 先写并运行 RED 的真实浏览器表单测试，再接入 helper；去掉 UID 原生 pattern/required 阻断，统一显示校验错误，合法归一化后才调用窄化 v2 bridge。
- [x] 回归原 LongMAX、大数相邻值、错误保留草稿/可重试，确认原 v1 API 未被调用。
- [x] 独立复审，完整 `check.cmd`（最终Node1968/Python1003 exit0），验证 D盘/生产 fixture 隔离/进程和监听残留0/源库只读状态，更新台账与交接。

## 不在本切片中宣称完成的项

添加成功后的重读/选择顺序、原间隔草稿保留、关闭重开抽屉的迟到 mutation 及旧列表结果竞态由独立源码审计记录，下一项单独做 RED→修复→验证。HTTP malformed/body/path/query 转换与客户端 typed IPC 的承载差异不等同业务输入本轮已实现。M06和M01–M18仍为进行中，真人平台/原生/安装验收未执行。
