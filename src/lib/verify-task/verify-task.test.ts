import { describe, expect, test } from 'vitest'
import {
  bumpAttempt,
  markFailed,
  markGaveUp,
  markRunning,
  markSucceeded,
  newVerifyTask
} from './verify-task.js'

const mkTask = () =>
  newVerifyTask({
    openBadgesCredentialIndices: [0, 2],
    deadlineMs: 60_000,
    maxAttempts: 2
  })

describe('newVerifyTask', () => {
  test('starts queued at attempt 1 with a deadline in the future', () => {
    const before = Date.now()
    const task = mkTask()
    const after = Date.now()

    expect(task.status).toBe('queued')
    expect(task.attempt).toBe(1)
    expect(task.maxAttempts).toBe(2)
    expect(task.openBadgesCredentialIndices).toEqual([0, 2])
    expect(task.startedAt).toBeUndefined()
    expect(task.lastError).toBeUndefined()
    expect(typeof task.attemptId).toBe('string')
    expect(task.attemptId.length).toBeGreaterThan(0)

    const queuedAt = Date.parse(task.queuedAt)
    const deadlineAt = Date.parse(task.deadlineAt)
    expect(queuedAt).toBeGreaterThanOrEqual(before)
    expect(queuedAt).toBeLessThanOrEqual(after)
    expect(deadlineAt - queuedAt).toBe(60_000)
  })

  test('copies the indices array (no aliasing of the input)', () => {
    const indices = [1, 3]
    const task = newVerifyTask({
      openBadgesCredentialIndices: indices,
      deadlineMs: 1000,
      maxAttempts: 1
    })
    indices.push(99)
    expect(task.openBadgesCredentialIndices).toEqual([1, 3])
  })
})

describe('lifecycle helpers', () => {
  test('markRunning sets startedAt and status=running', () => {
    const queued = mkTask()
    const running = markRunning(queued)
    expect(running.status).toBe('running')
    expect(running.startedAt).toBeDefined()
    expect(queued.status).toBe('queued')
    expect(queued.startedAt).toBeUndefined()
  })

  test('markSucceeded transitions to succeeded without changing other fields', () => {
    const running = markRunning(mkTask())
    const done = markSucceeded(running)
    expect(done.status).toBe('succeeded')
    expect(done.attemptId).toBe(running.attemptId)
    expect(done.attempt).toBe(running.attempt)
  })

  test('markFailed records lastError with timestamp', () => {
    const running = markRunning(mkTask())
    const failed = markFailed(running, { message: 'boom' })
    expect(failed.status).toBe('failed')
    expect(failed.lastError?.message).toBe('boom')
    expect(failed.lastError?.at).toBeDefined()
  })

  test('markGaveUp is terminal', () => {
    const failed = markFailed(markRunning(mkTask()), { message: 'x' })
    const gave = markGaveUp(failed)
    expect(gave.status).toBe('gave-up')
  })
})

describe('bumpAttempt', () => {
  test('increments attempt, mints new attemptId, clears startedAt/lastError, resets to queued', () => {
    const failed = markFailed(markRunning(mkTask()), { message: 'boom' })
    const next = bumpAttempt(failed, 30_000)

    expect(next.attempt).toBe(failed.attempt + 1)
    expect(next.attemptId).not.toBe(failed.attemptId)
    expect(next.status).toBe('queued')
    expect(next.startedAt).toBeUndefined()
    expect(next.lastError).toBeUndefined()
    expect(
      Date.parse(next.deadlineAt) - Date.parse(next.queuedAt)
    ).toBe(30_000)
    expect(next.openBadgesCredentialIndices).toEqual(
      failed.openBadgesCredentialIndices
    )
  })
})
