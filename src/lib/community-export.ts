export interface LessonFocusEntry {
  title: string
  content: string
  created_at: string
  recipient_teacher_id: string | null
  profiles?: { nickname: string }
  comments?: Array<{ content?: string; created_at?: string; profiles?: { nickname: string; role?: string } }>
}

/** Plain text avoids executable spreadsheet cells and preserves multi-line questions. */
export function lessonFocusText(entries: LessonFocusEntry[]): string {
  return ['知音 · 下节课回课重点', `共 ${entries.length} 条`, '', ...entries.flatMap((entry, index) => [
    `${index + 1}. ${entry.title}`,
    `学生昵称：${entry.profiles?.nickname ?? '未命名用户'}`,
    `提交时间：${entry.created_at}`,
    `来源：${entry.recipient_teacher_id ? '师生私密留言' : '社区帖子'}`,
    '问题内容：', entry.content,
    ...(entry.comments?.length ? ['交流记录：', ...entry.comments.flatMap(comment => [`${comment.profiles?.nickname ?? '未命名用户'}${comment.profiles?.role === 'teacher' ? '（老师）' : ''} · ${comment.created_at ?? ''}`, comment.content ?? ''])] : []),
    '',
  ])].join('\n')
}
