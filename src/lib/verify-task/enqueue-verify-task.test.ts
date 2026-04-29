import { afterEach, describe, expect, test } from 'vitest'
import {
  enqueueVerifyTask,
  peekVerifyTaskQueueForTests,
  resetVerifyTaskQueueForTests,
  setVerifyTaskProcessorForTests
} from './enqueue-verify-task.js'

const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

afterEach(() => {
  resetVerifyTaskQueueForTests()
})

describe('enqueueVerifyTask', () => {
  test('processes a single id', async () => {
    const seen: string[] = []
    setVerifyTaskProcessorForTests(async (id) => {
      seen.push(id)
    })

    enqueueVerifyTask('a')
    await flush()
    await flush() // second tick lets the drainer's microtasks complete

    expect(seen).toEqual(['a'])
  })

  test('drains multiple ids in FIFO order using a single drainer', async () => {
    const seen: string[] = []
    let concurrentRuns = 0
    let maxConcurrent = 0

    setVerifyTaskProcessorForTests(async (id) => {
      concurrentRuns++
      maxConcurrent = Math.max(maxConcurrent, concurrentRuns)
      await new Promise((r) => setImmediate(r))
      seen.push(id)
      concurrentRuns--
    })

    enqueueVerifyTask('a')
    enqueueVerifyTask('b')
    enqueueVerifyTask('c')

    while (peekVerifyTaskQueueForTests().length > 0 || concurrentRuns > 0) {
      await flush()
    }

    expect(seen).toEqual(['a', 'b', 'c'])
    expect(maxConcurrent).toBe(1)
  })

  test('does not run synchronously off the initial enqueue call', () => {
    const seen: string[] = []
    setVerifyTaskProcessorForTests(async (id) => {
      seen.push(id)
    })

    enqueueVerifyTask('a')

    // setImmediate guarantees the drainer hasn't fired yet.
    expect(seen).toEqual([])
    expect(peekVerifyTaskQueueForTests()).toEqual(['a'])
  })

  test('re-entrant enqueue from inside a worker appends without spawning a parallel drainer', async () => {
    const seen: string[] = []
    let concurrentRuns = 0
    let maxConcurrent = 0
    let firstRun = true

    setVerifyTaskProcessorForTests(async (id) => {
      concurrentRuns++
      maxConcurrent = Math.max(maxConcurrent, concurrentRuns)
      if (firstRun && id === 'a') {
        firstRun = false
        enqueueVerifyTask('a-child')
      }
      await new Promise((r) => setImmediate(r))
      seen.push(id)
      concurrentRuns--
    })

    enqueueVerifyTask('a')
    enqueueVerifyTask('b')

    while (peekVerifyTaskQueueForTests().length > 0 || concurrentRuns > 0) {
      await flush()
    }

    // 'a-child' was enqueued mid-'a' and must run after 'a' and 'b'.
    expect(seen).toEqual(['a', 'b', 'a-child'])
    expect(maxConcurrent).toBe(1)
  })

  test('a thrown processor error does not wedge the queue', async () => {
    const seen: string[] = []
    setVerifyTaskProcessorForTests(async (id) => {
      if (id === 'bad') throw new Error('boom')
      seen.push(id)
    })

    enqueueVerifyTask('bad')
    enqueueVerifyTask('good')
    while (peekVerifyTaskQueueForTests().length > 0) {
      await flush()
    }
    await flush()

    expect(seen).toEqual(['good'])
  })

  test('enqueue after the previous drain finished re-arms the loop', async () => {
    const seen: string[] = []
    setVerifyTaskProcessorForTests(async (id) => {
      seen.push(id)
    })

    enqueueVerifyTask('a')
    while (peekVerifyTaskQueueForTests().length > 0) {
      await flush()
    }
    await flush()

    enqueueVerifyTask('b')
    while (peekVerifyTaskQueueForTests().length > 0) {
      await flush()
    }
    await flush()

    expect(seen).toEqual(['a', 'b'])
  })
})
