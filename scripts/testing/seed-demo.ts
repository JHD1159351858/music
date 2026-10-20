import { config } from 'dotenv'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createSupabaseServer } from '../../src/lib/supabase-server'
import { localDatabasePath } from '../../src/lib/local-database'
import { useLocalData } from '../../src/lib/storage-mode'
import { AUTH_SESSION_COOKIE, signAuthToken } from '../../src/lib/auth-session'
import { POST as upload } from '../../src/app/api/upload/route'
import { POST as createGenre } from '../../src/app/api/genres/route'
import { POST as createScore } from '../../src/app/api/scores/route'
import { POST as createRecord } from '../../src/app/api/practice/route'
import { POST as queueScore } from '../../src/app/api/practice-list/route'
import { POST as createGoal } from '../../src/app/api/semester-goals/route'
import { POST as createTask } from '../../src/app/api/tasks/route'
import { POST as submitTask } from '../../src/app/api/tasks/[id]/submissions/route'
import { PATCH as review } from '../../src/app/api/submissions/[id]/route'
import { POST as createPost } from '../../src/app/api/posts/route'
import { POST as createComment } from '../../src/app/api/comments/route'
import { POST as like } from '../../src/app/api/posts/[id]/like/route'
import { PATCH as mark } from '../../src/app/api/posts/[id]/route'
import { PATCH as assignClass } from '../../src/app/api/profiles/route'
import { POST as createKnowledge } from '../../src/app/api/knowledge/route'

config({ path: '.env.local', quiet: true })
config({ quiet: true })
interface Entity { id: string; [key: string]: unknown }
type Handler = (request: Request) => Promise<Response>
const primary = 's0000000-0000-0000-0000-000000000001'
const prefix = '[测试]'
const tables = ['profiles', 'score_genres', 'scores', 'practice_list', 'practice_records', 'tasks', 'submissions', 'posts', 'comments', 'post_likes', 'lesson_marks', 'semester_goals', 'course_knowledge']

async function main() {
  if (!useLocalData()) throw new Error('此脚本仅支持本地SQLite测试数据，拒绝写远端数据库')
  const db = createSupabaseServer()
  const dataDirectory = path.dirname(localDatabasePath())
  const manifestFile = path.join(dataDirectory, 'demo-seed-20261016.json')
  const counts = async () => {
    const result: Record<string, number | null> = {}
    for (const table of tables) {
      const rows = await db.from(table).select('*', { count: 'exact', head: true })
      if (rows.error) throw new Error(rows.error.message)
      result[table] = rows.count
    }
    return result
  }
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ database: localDatabasePath(), counts: await counts(), alreadySeeded: existsSync(manifestFile) }, null, 2))
    const profiles = await db.from('profiles').select('id,nickname,role,class_name')
    console.log(JSON.stringify(profiles.data, null, 2))
    return
  }
  if (existsSync(manifestFile)) { console.log('此批测试数据已有导入记录，跳过重复导入。'); return }
  // Only this maintenance process uses signed fixture identities; the running app keeps its existing login settings.
  process.env.ZHIYIN_STUDENT_TEST_MODE = 'false'
  const roster = await db.from('profiles').select('id,nickname,role,class_name')
  if (roster.error) throw new Error(roster.error.message)
  const teacher = roster.data?.find(row => row.id === 't0000000-0000-0000-0000-000000000001' && row.role === 'teacher')?.id as string | undefined
  const current = roster.data?.find(row => row.id === primary)
  if (!teacher || !current) throw new Error('缺少默认本地测试身份，停止导入')
  const before = await counts()
  const backupDirectory = path.join(dataDirectory, 'backups')
  await mkdir(backupDirectory, { recursive: true })
  const backupFile = path.join(backupDirectory, `before-demo-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`)
  const database = new DatabaseSync(localDatabasePath())
  try { database.prepare('VACUUM INTO ?').run(backupFile) } finally { database.close() }
  const manifest: { backupFile: string; createdAt: string; before: typeof before; entries: Record<string, Entity>; files: string[]; complete: boolean; after?: typeof before } = { backupFile, createdAt: new Date().toISOString(), before, entries: {}, files: [], complete: false }
  const checkpoint = () => writeFile(manifestFile, JSON.stringify(manifest, null, 2))
  await checkpoint()
  const cookies = new Map<string, string>()
  async function request(userId: string, method: string, body?: object): Promise<Request> {
    if (!cookies.has(userId)) cookies.set(userId, `${AUTH_SESSION_COOKIE}=${await signAuthToken({ kind: 'session', userId, role: userId === teacher ? 'teacher' : 'student', expiresAt: Date.now() + 3600000 })}`)
    return new Request('http://localhost:5000/api/demo-seed', { method, headers: { cookie: cookies.get(userId)!, origin: 'http://localhost:5000', 'content-type': 'application/json' }, body: body ? JSON.stringify({ ...body, user_id: userId }) : undefined })
  }
  async function call(key: string, userId: string, handler: Handler, body: object, method = 'POST'): Promise<Entity> {
    const response = await handler(await request(userId, method, body))
    const value = await response.json() as Entity & { error?: string }
    if (!response.ok) throw new Error(`${key}: ${value.error ?? response.status}`)
    manifest.entries[key] = value
    await checkpoint()
    return value
  }
  async function file(key: string, userId: string, content: Buffer, name: string, type: string): Promise<string> {
    const req = await request(userId, 'GET')
    const form = new FormData(); form.set('user_id', userId); form.set('file', new File([new Uint8Array(content)], name, { type }))
    const response = await upload(new Request(req.url, { method: 'POST', headers: { cookie: req.headers.get('cookie')! }, body: form }))
    const value = await response.json() as { fileId: string; error?: string }
    if (!response.ok) throw new Error(`${key}: ${value.error}`)
    manifest.files.push(value.fileId); await checkpoint()
    return value.fileId
  }
  const params = (id: string) => ({ params: Promise.resolve({ id }) })
  const classOne = typeof current.class_name === 'string' && current.class_name ? current.class_name : `${prefix}钢琴一班`
  const classTwo = `${prefix}钢琴二班`
  if (!current.class_name) await assignClass(await request(teacher, 'PATCH', { student_id: primary, class_name: classOne }))
  const students = [primary]
  for (const [index, nickname] of ['慢练的节拍', '晨光练琴人', '和弦漫步', '留白的休止符'].entries()) {
    const id = randomUUID()
    // Profiles have no public creation API; these nickname-only fixture identities are maintenance data.
    const created = await db.from('profiles').insert({ id, nickname: `${prefix}${nickname}`, role: 'student', class_name: index < 2 ? classOne : classTwo }).select().single()
    if (created.error) throw new Error(created.error.message)
    manifest.entries[`student-${index}`] = created.data as Entity; await checkpoint(); students.push(id)
  }
  const genres = [await call('genre-0', teacher, createGenre, { name: `${prefix}基础技巧` }), await call('genre-1', teacher, createGenre, { name: `${prefix}节奏训练` })]
  function sheet(title: string, row: number): Buffer {
    const systems = Array.from({ length: 4 }, (_, system) => {
      const y = 160 + system * 190
      const staff = Array.from({ length: 5 }, (_, line) => `<line x1="80" y1="${y + line * 12}" x2="920" y2="${y + line * 12}" stroke="#303030"/>`).join('')
      const notes = Array.from({ length: 12 }, (_, index) => { const x = 140 + index * 62; const noteY = y + 42 - ((index + system + row) % 7) * 6; return `<ellipse cx="${x}" cy="${noteY}" rx="8" ry="6" transform="rotate(-15 ${x} ${noteY})"/><line x1="${x + 7}" y1="${noteY}" x2="${x + 7}" y2="${noteY - 38}" stroke="black" stroke-width="2"/>` }).join('')
      return `${staff}${notes}<text x="80" y="${y - 22}" font-size="17">${system + 1}. DEMO · slow practice</text>`
    }).join('')
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1080" viewBox="0 0 1000 1080"><rect width="1000" height="1080" fill="white"/><text x="500" y="65" text-anchor="middle" font-size="30" font-family="sans-serif">${title}</text><text x="500" y="105" text-anchor="middle" font-size="18">DEMO ONLY · 自制谱图，仅用于页面与录音流程测试</text>${systems}<text x="80" y="1020" font-size="18">合成音频／视频为演示素材，不代表学生实际演奏。</text></svg>`)
  }
  function wav(): Buffer {
    const rate = 16000, seconds = 6, length = rate * seconds
    const buffer = Buffer.alloc(44 + length * 2)
    buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(length * 2, 40)
    const frequencies = [261.63, 293.66, 329.63, 349.23, 392, 440, 493.88, 523.25]
    for (let index = 0; index < length; index++) { const beat = index / rate / 0.75; const envelope = Math.min(1, beat % 1 * 20) * Math.max(0, 1 - beat % 1); buffer.writeInt16LE(Math.round(Math.sin(index / rate * 2 * Math.PI * frequencies[Math.floor(beat) % 8]) * 3500 * envelope), 44 + index * 2) }
    return buffer
  }
  const titles = ['五指连奏练习', '左右手交替', '三拍子节奏', 'C大调音阶', '双音与和弦', '教师待发布曲目']
  const scores: Entity[] = []
  for (const [index, name] of titles.entries()) {
    const title = `${prefix}${name}`
    const fileId = await file(`score-file-${index}`, teacher, sheet(title, index), `${title}.svg`, 'image/svg+xml')
    scores.push(await call(`score-${index}`, teacher, createScore, { id: randomUUID(), title, composer: '知音自制测试素材', difficulty: index < 2 ? 'beginner' : index < 4 ? 'intermediate' : 'advanced', category: index % 2 ? 'foreign' : 'domestic', genre_id: genres[index % 2].id, published: index < 5, target_classes: index === 4 ? [classTwo] : [], tips: '测试数据：谱图与合成音视频仅用于功能演示，不代表真实教学成果。练习时先慢速、放松手腕。', file_id: fileId, file_name: `${title}.svg`, file_type: 'image/svg+xml' }))
  }
  const personalFile = await file('personal-sheet', primary, sheet(`${prefix}我的个人练习`, 2), `${prefix}个人谱图.svg`, 'image/svg+xml')
  const personal = await call('personal-score', primary, createScore, { id: randomUUID(), title: `${prefix}我的个人练习`, composer: '个人自选测试素材', difficulty: 'beginner', category: 'domestic', file_id: personalFile, file_name: '测试个人谱图.svg', file_type: 'image/svg+xml' })
  for (const score of scores.slice(0, 3)) await call(`queue-${score.id}`, primary, queueScore, { score_id: score.id })
  const audioIds = new Map<string, string>()
  for (const student of students) audioIds.set(student, await file(`audio-${student}`, student, wav(), `${prefix}合成音阶示例.wav`, 'audio/wav'))
  await call('personal-record', primary, createRecord, { id: randomUUID(), score_id: personal.id, piece_title: personal.title, source: 'student', started_at: new Date(Date.now() - 2 * 3600000).toISOString(), duration_seconds: 720, pause_count: 1, audio_file_id: audioIds.get(primary) })
  const recordByStudent = new Map<string, Entity>()
  for (const [studentIndex, student] of students.entries()) for (let day = 0; day < 14; day++) {
    if (studentIndex === 4 || (day + studentIndex) % 3 === 1) continue
    const score = scores[day % 4]
    const started = new Date(Date.now() - day * 86400000 - 3600000)
    const record = await call(`record-${studentIndex}-${day}`, student, createRecord, { id: randomUUID(), score_id: score.id, piece_title: score.title, source: 'teacher', started_at: started.toISOString(), duration_seconds: 600 + ((day * 7 + studentIndex * 11) % 30) * 60, pause_count: day % 3, audio_file_id: audioIds.get(student) })
    if (day === 0) recordByStudent.set(student, record)
  }
  const year = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }).slice(0, 4)
  await call('semester-goal', teacher, createGoal, { name: `${prefix}秋季学期10小时目标`, start_date: `${year}-09-01`, end_date: `${year}-12-31`, target_minutes: 600 })
  const now = Date.now()
  const taskDefinitions = [
    { name: '连奏练习·已评阅示例', start: -7, end: 7, requirements: { audio: 'required', record: 'required', video: 'optional' }, closed: false },
    { name: '节奏训练·待提交', start: -2, end: 5, requirements: { audio: 'optional', record: 'required', video: 'off' }, closed: false },
    { name: '下周视奏·尚未开始', start: 3, end: 10, requirements: { audio: 'required', record: 'required', video: 'off' }, closed: false },
    { name: '阶段回顾·已关闭', start: -14, end: -1, requirements: { audio: 'optional', record: 'required', video: 'optional' }, closed: true },
  ]
  const tasks: Entity[] = []
  for (const [index, definition] of taskDefinitions.entries()) tasks.push(await call(`task-${index}`, teacher, createTask, { title: `${prefix}${definition.name}`, description: '测试任务：按慢速练习，记录困难乐句并提交所需材料。所有记录和评分均为演示数据，不计入真实课程成绩。', start_at: new Date(now + definition.start * 86400000).toISOString(), end_at: new Date(now + definition.end * 86400000).toISOString(), audience: 'all', score_mode: index === 2 ? 'random' : 'fixed', score_id: index === 2 ? null : scores[0].id, requirements: definition.requirements, closed: definition.closed }))
  let videoId: string | undefined
  if (process.env.ZHIYIN_DEMO_VIDEO && existsSync(process.env.ZHIYIN_DEMO_VIDEO)) videoId = await file('video-primary', primary, await readFile(process.env.ZHIYIN_DEMO_VIDEO), `${prefix}合成视频示例-非真人演奏.mp4`, 'video/mp4')
  for (const [index, student] of students.slice(0, 3).entries()) {
    const submitted = await call(`submission-${index}`, student, req => submitTask(req, params(tasks[0].id)), { audio_file_id: audioIds.get(student), video_file_id: index === 0 ? videoId : undefined, record_text: '【测试记录】完成慢速连奏练习，重点关注音色和双手衔接。所附音视频为合成示例。', practice_record_id: recordByStudent.get(student)?.id })
    if (index < 2) await call(`review-${index}`, teacher, req => review(req, params(submitted.id)), { grade: index === 0 ? 88 : 93, feedback: '【测试评语】练习记录完整，下一阶段注意连奏均匀和手腕放松。此评分仅用于演示回传流程。' }, 'PATCH')
  }
  const questions = ['连奏时怎样保持手指放松？', '如何区分节拍与节奏？', '初学阶段如何安排每天的练习？', '第一次课堂展示要准备什么？', '慢练过程中如何记录困难片段？', '我今天完成了左右手配合练习']
  const categories = ['method', 'theory', 'repertoire', 'performance', 'other', 'method']
  for (const [index, question] of questions.entries()) {
    const post = await call(`post-${index}`, students[index % 4], createPost, { title: `${prefix}${question}`, content: '【测试帖子】本内容为社区功能演示。练习时发现部分乐句衔接不够连贯，想听听大家的练习经验；实际教学问题请以任课教师指导为准。', category: categories[index], ask_teacher: index < 2 })
    await call(`comment-${index}`, teacher, createComment, { post_id: post.id, content: '【测试回复】先拆成短句慢练，记录具体问题，下次课再结合演奏进行指导。' })
    for (const student of students.slice(0, 1 + index % 3)) await call(`like-${index}-${student}`, student, req => like(req, params(post.id)), {})
    if (index === 0) await call('lesson-public', teacher, req => mark(req, params(post.id)), { marked_for_lesson: true }, 'PATCH')
  }
  for (const [index, student] of students.slice(0, 2).entries()) {
    const post = await call(`message-${index}`, student, createPost, { title: `${prefix}请老师下节课检查双手衔接`, content: '【测试私密留言】右手换指时容易紧张，希望下节课当面指导。仅用于私信和回课清单测试。', category: 'method', recipient_teacher_id: teacher })
    await call(`message-reply-${index}`, teacher, createComment, { post_id: post.id, content: '【测试教师回复】已收到，下节课会单独检查这段换指，先保持慢速。' })
    await call(`lesson-private-${index}`, teacher, req => mark(req, params(post.id)), { marked_for_lesson: true }, 'PATCH')
  }
  for (const [index, item] of [
    ['连奏练习', '连奏,legato', '【测试知识】连奏练习可先缩短乐句、降低速度，注意音与音的连接。演奏处理仅供参考，具体以教师指导为准。'],
    ['节拍与节奏', '节拍,节奏,拍号', '【测试知识】节拍用于组织稳定的强弱规律，节奏描述音的长短与组合。此条目用于验证课程知识检索。'],
    ['练习记录方法', '练习计划,练习记录,慢练', '【测试知识】记录曲目、有效时长、遇到的困难和下次目标；暂停时间不计入有效练习时长。'],
    [scores[0].title as string, `${scores[0].title},五指练习`, '【测试作品资料】自制基础练习谱，用于功能演示。\n创作年代：2026年测试素材\n所属时期：现代自制教学示例\n曲调特点：按谱面顺序展示基础音阶走向，不对应历史作品。'],
  ].entries()) await call(`knowledge-${index}`, teacher, createKnowledge, { title: `${prefix}${item[0]}`.replace(`${prefix}${prefix}`, prefix), keywords: item[1].split(','), content: item[2], source_url: null })
  manifest.after = await counts(); manifest.complete = true; await checkpoint()
  console.log(JSON.stringify({ database: localDatabasePath(), backupFile, manifestFile, before, after: manifest.after, added: Object.fromEntries(tables.map(table => [table, (manifest.after?.[table] ?? 0) - (before[table] ?? 0)])) }, null, 2))
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : '导入失败'); process.exitCode = 1 })
