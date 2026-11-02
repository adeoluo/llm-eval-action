export interface IssueComment {
  id: number
  body?: string | null
}

export interface CommentApi {
  list(issueNumber: number): Promise<IssueComment[]>
  create(issueNumber: number, body: string): Promise<void>
  update(commentId: number, body: string): Promise<void>
}

export function commentMarker(title: string): string {
  const key = title.replace(/[^A-Za-z0-9 _.:()-]/g, '').replace(/-{2,}/g, '-')
  return `<!-- llm-eval-action:${key} -->`
}

/** Creates the report comment, or edits the earlier one carrying the same marker. */
export async function upsertComment(
  api: CommentApi,
  issueNumber: number,
  report: string,
  title: string
): Promise<'created' | 'updated'> {
  const marker = commentMarker(title)
  const body = `${marker}\n${report}`
  const existing = (await api.list(issueNumber)).find((comment) => comment.body?.includes(marker))
  if (existing !== undefined) {
    await api.update(existing.id, body)
    return 'updated'
  }
  await api.create(issueNumber, body)
  return 'created'
}
