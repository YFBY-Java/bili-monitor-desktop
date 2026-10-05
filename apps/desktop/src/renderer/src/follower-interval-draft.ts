import type { BilibiliFollowerMonitorV2 } from "@bmd/contracts"

export const MAX_FOLLOWER_INTERVAL = 2_592_000
export interface FollowerIntervalDraft { value: number; dirty: boolean }
export type FollowerIntervalDrafts = Record<string, FollowerIntervalDraft>

export function clampFollowerInterval(value: number): number {
  return Number.isFinite(value) ? Math.min(MAX_FOLLOWER_INTERVAL, Math.max(1, Math.round(value))) : 1
}

export function followerIntervalStep(value: number): number {
  return value < 60 ? 1 : value < 3_600 ? 60 : value < 86_400 ? 300 : 3_600
}

// Preserve the source's explicit dirty flag even when a read temporarily equals
// the draft. A later differing read makes that same draft effectively dirty again.
export function syncFollowerIntervalDrafts(drafts: FollowerIntervalDrafts, users: readonly BilibiliFollowerMonitorV2[]): FollowerIntervalDrafts {
  return Object.fromEntries(users.map(user => {
    const draft = drafts[user.id]
    return [user.id, draft?.dirty && draft.value !== user.intervalSeconds
      ? draft : { value: user.intervalSeconds, dirty: draft?.dirty ?? false }]
  }))
}
