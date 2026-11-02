import { describe, expect, it, vi } from 'vitest'
import { commentMarker, upsertComment, type CommentApi } from '../src/comment'

function fakeApi(existing: { id: number; body?: string | null }[]): CommentApi & {
  create: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
} {
  return {
    list: vi.fn(async () => existing),
    create: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined)
  }
}

describe('upsertComment', () => {
  it('creates a comment with a marker when none exists', async () => {
    const api = fakeApi([
      { id: 1, body: 'unrelated' },
      { id: 2, body: null }
    ])
    expect(await upsertComment(api, 5, 'report', 'Gate')).toBe('created')
    expect(api.create).toHaveBeenCalledWith(5, `${commentMarker('Gate')}\nreport`)
    expect(api.update).not.toHaveBeenCalled()
  })

  it('updates the earlier comment for the same title', async () => {
    const api = fakeApi([{ id: 9, body: `${commentMarker('Gate')}\nold` }])
    expect(await upsertComment(api, 5, 'new', 'Gate')).toBe('updated')
    expect(api.update).toHaveBeenCalledWith(9, `${commentMarker('Gate')}\nnew`)
  })

  it('keeps separate comments for different titles and strips comment terminators', () => {
    expect(commentMarker('A')).not.toBe(commentMarker('B'))
    expect(commentMarker('x-->y')).toBe('<!-- llm-eval-action:x-y -->')
    expect(commentMarker('a--!>b<c')).toBe('<!-- llm-eval-action:a-bc -->')
  })
})
