/** Local test fixture only. No production code imports this service. */
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

export const FIXTURE_IDS = {
  teacher: '11111111-1111-4111-8111-111111111111',
  student1: '22222222-2222-4222-8222-222222222221',
  student2: '22222222-2222-4222-8222-222222222222',
  genre: '33333333-3333-4333-8333-333333333333',
  score1: '44444444-4444-4444-8444-444444444441',
  score2: '44444444-4444-4444-8444-444444444442',
  draft: '44444444-4444-4444-8444-444444444443',
}

function seedTables() {
  const time = new Date().toISOString()
  const image = 'http://localhost:5001/home/music-journey.png'
  const score = (id, title, composer, category, difficulty, published) => ({ id, title, composer, category, difficulty, published, genre_id: FIXTURE_IDS.genre, tips: '关注乐句呼吸与双手平衡。', image_url: image, file_id: null, file_name: 'test-score.png', file_type: 'image/png', source: 'teacher', owner_id: FIXTURE_IDS.teacher, created_at: time })
  return {
    profiles: [
      { id: FIXTURE_IDS.teacher, nickname: '测试教师', role: 'teacher', class_name: null, created_at: time },
      { id: FIXTURE_IDS.student1, nickname: '测试学生一', role: 'student', class_name: '钢琴一班', created_at: time },
      { id: FIXTURE_IDS.student2, nickname: '测试学生二', role: 'student', class_name: '钢琴二班', created_at: time },
    ],
    score_genres: [{ id: FIXTURE_IDS.genre, name: '古典', teacher_id: FIXTURE_IDS.teacher, created_at: time }],
    scores: [score(FIXTURE_IDS.score1, '测试小奏鸣曲', '克莱门蒂', 'foreign', 'beginner', true), score(FIXTURE_IDS.score2, '测试牧童短笛', '贺绿汀', 'domestic', 'intermediate', true), score(FIXTURE_IDS.draft, '测试未发布琴谱', '测试作曲家', 'domestic', 'advanced', false)],
    practice_records: [], tasks: [], task_score_assignments: [], submissions: [], practice_list: [], semester_goals: [],
    posts: [], comments: [], post_likes: [],
  }
}

function splitTopLevel(value, delimiter = ',') {
  const parts = []
  let depth = 0, quoted = false, start = 0
  for (let index = 0; index < value.length; index++) {
    const character = value[index]
    if (character === '"' && value[index - 1] !== '\\') quoted = !quoted
    if (!quoted) {
      if (character === '(') depth++
      if (character === ')') depth--
      if (character === delimiter && depth === 0) { parts.push(value.slice(start, index)); start = index + 1 }
    }
  }
  parts.push(value.slice(start))
  return parts.filter(Boolean)
}

function scalar(value) {
  if (value === 'null') return null
  if (value === 'true') return true
  if (value === 'false') return false
  return value.replace(/^"|"$/g, '')
}

function compare(actual, operator, raw) {
  const expected = scalar(raw)
  if (operator === 'eq' || operator === 'is') return actual === expected || (actual != null && String(actual) === String(expected))
  if (operator === 'neq') return !compare(actual, 'eq', raw)
  if (operator === 'in') return splitTopLevel(raw.replace(/^\(|\)$/g, '')).some((item) => compare(actual, 'eq', item))
  if (operator === 'gte') return actual >= expected
  if (operator === 'lte') return actual <= expected
  if (operator === 'gt') return actual > expected
  if (operator === 'lt') return actual < expected
  if (operator === 'ilike' || operator === 'like') {
    const pattern = String(expected).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[%*]/g, '.*').replace(/_/g, '.')
    return new RegExp(`^${pattern}$`, operator === 'ilike' ? 'i' : '').test(String(actual ?? ''))
  }
  throw new Error(`Unsupported fixture filter: ${operator}`)
}

function logical(row, expression) {
  if (expression.startsWith('and(')) return splitTopLevel(expression.slice(4, -1)).every((part) => logical(row, part))
  if (expression.startsWith('or(')) return splitTopLevel(expression.slice(3, -1)).some((part) => logical(row, part))
  const match = /^([^.]+)\.([^.]+)\.(.*)$/.exec(expression)
  if (!match) throw new Error(`Invalid fixture expression: ${expression}`)
  return compare(row[match[1]], match[2], match[3])
}

function matches(row, params) {
  for (const [field, filter] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(field)) continue
    if (field === 'or' || field === 'and') {
      const values = splitTopLevel(filter.replace(/^\(|\)$/g, ''))
      if (field === 'or' ? !values.some((value) => logical(row, value)) : !values.every((value) => logical(row, value))) return false
      continue
    }
    const dot = filter.indexOf('.')
    if (!compare(row[field], filter.slice(0, dot), filter.slice(dot + 1))) return false
  }
  return true
}

function selectRow(table, row, selection, tables) {
  const output = {}
  for (const part of splitTopLevel(selection || '*')) {
    if (part === '*') { Object.assign(output, row); continue }
    const join = /^([^(:]+)(?::([^()]+))?\((.*)\)$/.exec(part)
    if (join) {
      const alias = join[1], target = (join[2] || alias).split('!')[0]
      let foreignId
      if (target === 'profiles') foreignId = row.student_id ?? row.user_id ?? row.owner_id ?? row.teacher_id
      else if (target === 'practice_records') foreignId = row.practice_record_id
      else if (target === 'score_genres') foreignId = row.genre_id
      else if (target === 'scores') foreignId = row.score_id
      const related = tables[target]?.find((candidate) => candidate.id === foreignId)
      output[alias] = related ? selectRow(target, related, join[3], tables) : null
    } else {
      const [alias, column] = part.split(':')
      output[alias] = row[column || alias]
    }
  }
  return output
}

function defaults(table, row) {
  const time = new Date().toISOString()
  const base = { id: randomUUID(), created_at: time, ...row }
  if (table === 'tasks') return { closed: false, target_classes: [], target_student_ids: [], ...base }
  if (table === 'scores') return { tips: null, image_url: null, file_id: null, file_name: null, file_type: null, genre_id: null, published: false, ...base }
  if (table === 'submissions') return { audio_url: null, audio_file_id: null, video_url: null, video_file_id: null, practice_record_id: null, record_text: null, grade: null, feedback: null, reviewed_at: null, submitted_at: time, ...base }
  if (table === 'practice_records') return { score_id: null, audio_url: null, audio_file_id: null, pause_count: 0, ...base }
  return base
}

function cascade(tables, table, rows) {
  const ids = new Set(rows.map((row) => row.id))
  if (table === 'tasks') for (const name of ['submissions', 'task_score_assignments']) tables[name] = tables[name].filter((row) => !ids.has(row.task_id))
  if (table === 'scores') {
    tables.practice_list = tables.practice_list.filter((row) => !ids.has(row.score_id))
    for (const name of ['practice_records', 'tasks', 'task_score_assignments']) for (const row of tables[name]) if (ids.has(row.score_id)) row.score_id = null
  }
  if (table === 'practice_records') for (const row of tables.submissions) if (ids.has(row.practice_record_id)) row.practice_record_id = null
}

export function createFixtureServer() {
  let tables = seedTables()
  return createServer(async (request, response) => {
    const send = (status, data, headers = {}) => {
      response.writeHead(status, { 'Content-Type': 'application/json', 'X-Test-Fixture': 'zhiyin-in-memory-only', ...headers })
      response.end(request.method === 'HEAD' || status === 204 ? undefined : JSON.stringify(data))
    }
    try {
      const url = new URL(request.url, 'http://127.0.0.1')
      if (url.pathname === '/health') return send(200, { test_fixture: true, storage: 'memory', ids: FIXTURE_IDS, tables: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length])) })
      if (url.pathname === '/reset' && request.method === 'POST') { tables = seedTables(); return send(200, { test_fixture: true, reset: true }) }
      const requestedTable = /^\/rest\/v1\/([^/]+)$/.exec(url.pathname)?.[1]
      const table = requestedTable === 'task_submissions' ? 'submissions' : requestedTable
      if (!table || !tables[table]) return send(404, { message: 'Unknown fixture route/table', code: '42P01' })
      const params = url.searchParams
      const prefer = request.headers.prefer || ''
      const single = String(request.headers.accept || '').includes('application/vnd.pgrst.object+json')
      let rows = tables[table].filter((row) => matches(row, params))
      let status = 200
      if (request.method === 'POST' || request.method === 'PATCH') {
        const chunks = []
        for await (const chunk of request) chunks.push(chunk)
        const body = JSON.parse(Buffer.concat(chunks).toString() || '{}')
        if (request.method === 'PATCH') for (const row of rows) Object.assign(row, body)
        else {
          const conflict = (params.get('on_conflict') || 'id').split(',')
          const resolution = prefer.includes('resolution=merge-duplicates') || prefer.includes('resolution=ignore-duplicates')
          rows = []
          for (const input of Array.isArray(body) ? body : [body]) {
            const existing = tables[table].find((row) => conflict.every((field) => input[field] !== undefined && row[field] === input[field]))
            if (existing && resolution) {
              if (prefer.includes('resolution=merge-duplicates')) Object.assign(existing, input)
              rows.push(existing)
            } else if (existing) return send(409, { message: 'Fixture unique constraint', code: '23505' })
            else { const row = defaults(table, input); tables[table].push(row); rows.push(row) }
          }
          status = 201
        }
      } else if (request.method === 'DELETE') {
        const removed = new Set(rows)
        tables[table] = tables[table].filter((row) => !removed.has(row))
        cascade(tables, table, rows)
      } else if (!['GET', 'HEAD'].includes(request.method)) return send(405, { message: 'Unsupported fixture method' })
      const count = rows.length
      const order = params.get('order')
      if (order) rows.sort((left, right) => {
        for (const sort of splitTopLevel(order)) {
          const [field, direction] = sort.split('.')
          const result = left[field] === right[field] ? 0 : left[field] == null ? -1 : right[field] == null ? 1 : left[field] < right[field] ? -1 : 1
          if (result) return direction === 'desc' ? -result : result
        }
        return 0
      })
      const offset = Number(params.get('offset') || 0)
      const limit = params.has('limit') ? Number(params.get('limit')) : rows.length
      rows = rows.slice(offset, offset + limit).map((row) => selectRow(table, row, params.get('select'), tables))
      const headers = { 'Content-Range': `${rows.length ? `${offset}-${offset + rows.length - 1}` : '*'}/${count}` }
      if (!['GET', 'HEAD'].includes(request.method) && !prefer.includes('return=representation')) return send(204, null, headers)
      if (single && rows.length !== 1) return send(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${rows.length} rows`, hint: null })
      return send(status, single ? rows[0] : rows, headers)
    } catch (error) { send(400, { code: 'FIXTURE_ERROR', message: error instanceof Error ? error.message : String(error) }) }
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.FIXTURE_PORT || 54329)
  const server = createFixtureServer()
  server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ test_fixture: true, url: `http://127.0.0.1:${port}`, ids: FIXTURE_IDS })))
}
