export type TaskState =
  | "ready"
  | "running"
  | "waiting_retry"
  | "waiting_approval"
  | "paused"
  | "succeeded"
  | "failed"
  | "cancelled"

export interface DurableTask {
  id: string
  type: string
  state: TaskState
  createdAt: string
  updatedAt: string
  attemptId: string | undefined
  approvalId: string | undefined
  version: number
}

export type TaskTransition =
  | { type: "start"; attemptId: string; now?: string }
  | { type: "succeed"; now?: string }
  | { type: "fail"; now?: string }
  | { type: "waitForApproval"; approvalId: string; now?: string }
  | { type: "approve"; now?: string }
  | { type: "scheduleRetry"; now?: string }
  | { type: "pause"; now?: string }
  | { type: "cancel"; now?: string }

export function createTask(input: { id: string; type: string; now?: string }): DurableTask {
  const now = input.now ?? new Date().toISOString()
  return {
    id: input.id,
    type: input.type,
    state: "ready",
    createdAt: now,
    updatedAt: now,
    attemptId: undefined,
    approvalId: undefined,
    version: 1
  }
}

export function transitionTask(task: DurableTask, transition: TaskTransition): DurableTask {
  const now = transition.now ?? new Date().toISOString()
  const update = (changes: Partial<DurableTask>): DurableTask => ({
    ...task,
    ...changes,
    updatedAt: now,
    version: task.version + 1
  })

  if ((task.state === "ready" || task.state === "waiting_retry") && transition.type === "start") {
    return update({ state: "running", attemptId: transition.attemptId, approvalId: undefined })
  }
  if (task.state === "running" && transition.type === "succeed") {
    return update({ state: "succeeded", attemptId: undefined })
  }
  if (task.state === "running" && transition.type === "fail") {
    return update({ state: "failed", attemptId: undefined })
  }
  if (task.state === "running" && transition.type === "waitForApproval") {
    return update({ state: "waiting_approval", approvalId: transition.approvalId, attemptId: undefined })
  }
  if (task.state === "waiting_approval" && transition.type === "approve") {
    return update({ state: "ready", approvalId: undefined })
  }
  if ((task.state === "running" || task.state === "failed") && transition.type === "scheduleRetry") {
    return update({ state: "waiting_retry", attemptId: undefined })
  }
  if ((task.state === "ready" || task.state === "waiting_retry") && transition.type === "pause") {
    return update({ state: "paused" })
  }
  if (!(["succeeded", "cancelled"] as TaskState[]).includes(task.state) && transition.type === "cancel") {
    return update({ state: "cancelled", attemptId: undefined, approvalId: undefined })
  }

  throw new Error(`Invalid task transition: ${task.state} -> ${transition.type}`)
}
