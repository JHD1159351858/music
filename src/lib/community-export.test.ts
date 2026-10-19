import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lessonFocusText } from './community-export'

test('lesson focus export includes complete multi-line questions and teacher replies as plain text', () => {
  const output = lessonFocusText([{ title: '=标题', content: '第一行\n第二行', created_at: '2026-10-16T08:00:00Z', recipient_teacher_id: 'teacher', profiles: { nickname: '同学甲' }, comments: [{ content: '分手慢练\n下节课检查', created_at: '2026-10-16T09:00:00Z', profiles: { nickname: '老师甲', role: 'teacher' } }] }])
  for (const value of ['1. =标题', '第一行\n第二行', '师生私密留言', '同学甲', '老师甲（老师）', '分手慢练\n下节课检查']) assert.ok(output.includes(value))
})
