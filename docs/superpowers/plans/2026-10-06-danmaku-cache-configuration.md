# 弹幕公共缓存时长迁移

本轮只迁移原 `wbiCacheSeconds`、`buvidCacheSeconds` 及直接消费点。原 B/S、API 参考仓库只读；客户端原有未提交修改保留；不提交、不推送、不运行真实平台或用户数据。

- [x] 原 signed32 配置绑定、默认 43200、Node 启动透传；旧五项连接配置不破坏。
- [x] Node 成功解析后计时，消费下限 300 秒；AUTH_EXPIRED 保留 Buvid/强刷 WBI，risk 清两项，nav 匿名。
- [x] 同一原 WBI 属性接入 Python Rank，成功解析后计时，不再写死一小时。
- [x] 仅三个新增代表性用例，复用已有合成网络与配置透传断言；新旧定点10项通过，类型/格式、Main唯一构建exit0、27路径任务审查PASS。
- [x] 更新迁移进度及未完成边界，不将本功能当作 M09 或全量迁移完成。

不在本轮重构：跨 Node/Python 共享缓存、同步双检/并发读取归属、多段 fallback 重新 LOGIN、bucket/probe。完整历史回归留阶段结束；此前全量失败记录不撤销。
