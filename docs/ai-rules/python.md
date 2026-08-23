# Python Worker Rules

- Python 3.11+，当前开发基线使用 D/E 盘 Python 创建仓库 `.venv`。
- Worker 从 stdin 读取一行一个 JSON 消息，stdout 只输出协议消息；诊断写 stderr。
- Pydantic 校验所有输入输出；不直接打开 `control.db`、Vault 或其他 Worker 数据。
- LangGraph 负责 Agent 图恢复，PydanticAI 负责节点；不能建立第二套冲突的调度状态。
- CPU 密集任务使用独立进程；I/O 使用 asyncio；所有任务支持取消、超时和父进程失联退出。
