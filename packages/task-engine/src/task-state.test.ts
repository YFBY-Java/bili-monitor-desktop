import { describe, expect, it } from "vitest"

import { createTask, transitionTask } from "./task-state"

describe("durable task state", () => {
  it("moves a ready task through running to success", () => {
    const ready = createTask({
      id: "task-01",
      type: "core.bootstrap",
      now: "2026-08-23T00:00:00.000Z"
    })
    const running = transitionTask(ready, { type: "start", attemptId: "attempt-01" })
    const succeeded = transitionTask(running, { type: "succeed" })

    expect(running).toMatchObject({ state: "running", attemptId: "attempt-01" })
    expect(succeeded).toMatchObject({ state: "succeeded", attemptId: undefined })
  })

  it("persists approval waits as an explicit task state", () => {
    const task = transitionTask(
      transitionTask(
        createTask({ id: "task-02", type: "tool.invoke", now: "2026-08-23T00:00:00.000Z" }),
        { type: "start", attemptId: "attempt-02" }
      ),
      { type: "waitForApproval", approvalId: "approval-01" }
    )

    expect(task).toMatchObject({ state: "waiting_approval", approvalId: "approval-01" })
  })

  it("rejects an invalid transition instead of silently corrupting state", () => {
    const ready = createTask({
      id: "task-03",
      type: "campaign.run",
      now: "2026-08-23T00:00:00.000Z"
    })

    expect(() => transitionTask(ready, { type: "succeed" })).toThrow(/invalid task transition/i)
  })
})
