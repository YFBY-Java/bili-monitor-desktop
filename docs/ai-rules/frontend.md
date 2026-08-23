# Frontend Rules

- 组件只负责渲染和交互，数据来自共享 contract 和 typed bridge。
- 页面必须有 loading、empty、error、stale 和 success 状态。
- 服务状态由 TanStack Query 管理，本地交互状态由 Zustand 管理；不要复制同一业务真相。
- 高频直播/Agent 流使用 MessagePort、有界缓冲和虚拟列表，不把完整历史留在内存。
- 颜色、字体、间距沿用现有樱花雾白设计 token。
