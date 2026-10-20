import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'

type Row = Record<string, unknown>
type DatabaseError = { code: string; message: string }
type QueryResult = { data: Row[] | Row | null; error: DatabaseError | null; count: number | null }
type SelectOptions = { count?: 'exact'; head?: boolean }
type UpsertOptions = { onConflict?: string; ignoreDuplicates?: boolean }
type Filter = { sql: string; values: SQLInputValue[] }
type Relation = { table: string; local: string; foreign: string; many?: boolean }

const tables = new Set(['profiles', 'classes', 'auth_identities', 'scores', 'practice_records', 'posts', 'comments', 'post_likes', 'score_genres', 'practice_list', 'semester_goals', 'tasks', 'task_score_assignments', 'submissions', 'lesson_marks', 'course_knowledge'])
const booleanColumns = new Set(['published', 'ask_teacher', 'marked_for_lesson', 'closed'])
const jsonColumns = new Set(['target_classes', 'target_student_ids', 'requirements', 'keywords', 'pages', 'details'])
const relations: Record<string, Record<string, Relation>> = {
  scores: { score_genres: { table: 'score_genres', local: 'genre_id', foreign: 'id' } },
  practice_list: { scores: { table: 'scores', local: 'score_id', foreign: 'id' } },
  practice_records: { profiles: { table: 'profiles', local: 'user_id', foreign: 'id' } },
  posts: {
    profiles: { table: 'profiles', local: 'user_id', foreign: 'id' },
    comments: { table: 'comments', local: 'id', foreign: 'post_id', many: true },
    post_likes: { table: 'post_likes', local: 'id', foreign: 'post_id', many: true },
    lesson_marks: { table: 'lesson_marks', local: 'id', foreign: 'post_id', many: true },
  },
  comments: { profiles: { table: 'profiles', local: 'user_id', foreign: 'id' } },
  submissions: {
    profiles: { table: 'profiles', local: 'student_id', foreign: 'id' },
    practice_records: { table: 'practice_records', local: 'practice_record_id', foreign: 'id' },
  },
}

const createdAt = "created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))"
const schema = `
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY, nickname TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('teacher','student')),
  class_name TEXT, ${createdAt}
);
CREATE TABLE IF NOT EXISTS auth_identities (
  id TEXT PRIMARY KEY, details TEXT NOT NULL CHECK(json_valid(details))
);
CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE CHECK(length(name) BETWEEN 1 AND 100),
  join_code TEXT NOT NULL UNIQUE CHECK(length(join_code) = 8 AND join_code NOT GLOB '*[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]*'),
  teacher_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, ${createdAt}
);
CREATE TABLE IF NOT EXISTS score_genres (
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, teacher_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, ${createdAt}
);
CREATE TABLE IF NOT EXISTS scores (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, composer TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK(difficulty IN ('beginner','intermediate','advanced')),
  category TEXT NOT NULL DEFAULT 'foreign' CHECK(category IN ('domestic','foreign')),
  genre_id TEXT REFERENCES score_genres(id) ON DELETE RESTRICT,
  published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)), tips TEXT, image_url TEXT,
  file_id TEXT, file_name TEXT, file_type TEXT, pages TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(pages)), source TEXT NOT NULL CHECK(source IN ('teacher','student')),
  owner_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
  target_classes TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(target_classes)), ${createdAt}
);
CREATE TABLE IF NOT EXISTS practice_records (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  score_id TEXT REFERENCES scores(id) ON DELETE SET NULL, piece_title TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('teacher','student')), practice_date TEXT NOT NULL,
  started_at TEXT NOT NULL, duration_seconds INTEGER NOT NULL CHECK(duration_seconds >= 0),
  pause_count INTEGER NOT NULL DEFAULT 0 CHECK(pause_count >= 0), audio_url TEXT, audio_file_id TEXT, ${createdAt}
);
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL, content TEXT NOT NULL, category TEXT NOT NULL,
  ask_teacher INTEGER NOT NULL DEFAULT 0 CHECK(ask_teacher IN (0,1)),
  marked_for_lesson INTEGER NOT NULL DEFAULT 0 CHECK(marked_for_lesson IN (0,1)),
  recipient_teacher_id TEXT REFERENCES profiles(id) ON DELETE RESTRICT,
  like_count INTEGER NOT NULL DEFAULT 0, ${createdAt}
);
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, content TEXT NOT NULL, ${createdAt}
);
CREATE TABLE IF NOT EXISTS post_likes (
  id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, ${createdAt}, UNIQUE(post_id,user_id)
);
CREATE TABLE IF NOT EXISTS lesson_marks (
  id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  teacher_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, ${createdAt}, UNIQUE(post_id,teacher_id)
);
CREATE TABLE IF NOT EXISTS course_knowledge (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL,
  keywords TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(keywords)), source_url TEXT,
  teacher_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, ${createdAt}
);
CREATE TABLE IF NOT EXISTS practice_list (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  score_id TEXT NOT NULL REFERENCES scores(id) ON DELETE CASCADE, ${createdAt}, UNIQUE(user_id,score_id)
);
CREATE TABLE IF NOT EXISTS semester_goals (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL CHECK(end_date >= start_date),
  target_minutes INTEGER NOT NULL CHECK(target_minutes > 0), teacher_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, ${createdAt}
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, start_at TEXT NOT NULL,
  end_at TEXT NOT NULL CHECK(end_at > start_at), audience TEXT NOT NULL CHECK(audience IN ('all','classes','students')),
  target_classes TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(target_classes)),
  target_student_ids TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(target_student_ids)),
  score_mode TEXT NOT NULL CHECK(score_mode IN ('fixed','random')), score_id TEXT REFERENCES scores(id) ON DELETE SET NULL,
  requirements TEXT NOT NULL CHECK(json_valid(requirements)), closed INTEGER NOT NULL DEFAULT 0 CHECK(closed IN (0,1)),
  teacher_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, ${createdAt}
);
CREATE TABLE IF NOT EXISTS task_score_assignments (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  score_id TEXT REFERENCES scores(id) ON DELETE SET NULL, UNIQUE(task_id,student_id)
);
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  audio_url TEXT, audio_file_id TEXT, video_url TEXT, video_file_id TEXT,
  practice_record_id TEXT REFERENCES practice_records(id) ON DELETE RESTRICT,
  record_text TEXT, grade INTEGER CHECK(grade BETWEEN 0 AND 100), feedback TEXT, reviewed_at TEXT,
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), UNIQUE(task_id,student_id)
);
CREATE INDEX IF NOT EXISTS practice_user_date_idx ON practice_records(user_id,practice_date);
CREATE INDEX IF NOT EXISTS scores_owner_idx ON scores(owner_id);
CREATE INDEX IF NOT EXISTS posts_created_idx ON posts(created_at);
CREATE INDEX IF NOT EXISTS comments_post_idx ON comments(post_id);
CREATE INDEX IF NOT EXISTS tasks_teacher_idx ON tasks(teacher_id);
CREATE INDEX IF NOT EXISTS classes_teacher_idx ON classes(teacher_id);
`

export function localDatabasePath(): string {
  return path.join(path.resolve(process.env.ZHIYIN_DATA_DIR || path.join(process.cwd(), 'data')), 'zhiyin.sqlite')
}

function openDatabase(file: string): DatabaseSync {
  mkdirSync(path.dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  try {
    db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;')
    db.exec('BEGIN IMMEDIATE')
    db.exec(schema)
    const scoreColumns = db.prepare('PRAGMA table_info(scores)').all()
    if (!scoreColumns.some(column => column.name === 'target_classes')) db.exec("ALTER TABLE scores ADD COLUMN target_classes TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(target_classes))")
    if (!scoreColumns.some(column => column.name === 'pages')) db.exec("ALTER TABLE scores ADD COLUMN pages TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(pages))")
    const postColumns = db.prepare('PRAGMA table_info(posts)').all()
    if (!postColumns.some(column => column.name === 'recipient_teacher_id')) db.exec('ALTER TABLE posts ADD COLUMN recipient_teacher_id TEXT REFERENCES profiles(id) ON DELETE RESTRICT')
    const seed = db.prepare('INSERT INTO profiles (id,nickname,role) VALUES (?,?,?) ON CONFLICT(id) DO NOTHING')
    seed.run('t0000000-0000-0000-0000-000000000001', '林老师', 'teacher')
    seed.run('s0000000-0000-0000-0000-000000000001', '抚琴听雨', 'student')
    seed.run('s0000000-0000-0000-0000-000000000002', '黑白键旅人', 'student')
    // A legacy global mark has an unambiguous owner only with a single teacher.
    // Migrate each post once; otherwise clearing a mark would recreate it on reopen.
    const legacyMarks = db.prepare('SELECT id FROM posts WHERE marked_for_lesson = 1').all()
    const teachers = db.prepare("SELECT id FROM profiles WHERE role = 'teacher'").all()
    if (teachers.length === 1) {
      const migrateMark = db.prepare('INSERT INTO lesson_marks(id,post_id,teacher_id) VALUES(?,?,?) ON CONFLICT(post_id,teacher_id) DO NOTHING')
      for (const post of legacyMarks) migrateMark.run(randomUUID(), post.id as string, teachers[0].id as string)
      db.exec('UPDATE posts SET marked_for_lesson = 0 WHERE marked_for_lesson = 1')
    }
    db.exec('COMMIT')
    return db
  } catch (error: unknown) {
    db.close()
    throw error
  }
}

function identifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error('Invalid database identifier')
  return `"${value}"`
}

function encode(value: unknown): SQLInputValue {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return Number(value)
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return value
  return JSON.stringify(value)
}

function decode(row: Row): Row {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
    booleanColumns.has(key) ? Boolean(value) : jsonColumns.has(key) && typeof value === 'string' ? JSON.parse(value) as unknown : value,
  ]))
}

function projectionParts(value: string): string[] {
  const parts: string[] = []
  let depth = 0, start = 0
  for (let index = 0; index < value.length; index++) {
    if (value[index] === '(') depth++
    if (value[index] === ')') depth--
    if (value[index] === ',' && depth === 0) { parts.push(value.slice(start, index).trim()); start = index + 1 }
  }
  parts.push(value.slice(start).trim())
  return parts
}

function project(db: DatabaseSync, table: string, row: Row, selection: string): Row {
  const output: Row = {}
  for (const part of projectionParts(selection)) {
    if (part === '*') { Object.assign(output, row); continue }
    const joined = /^(?:(\w+):)?(\w+)\((.*)\)$/.exec(part)
    if (joined) {
      const [, alias, target, nested] = joined
      const relation = relations[table]?.[target]
      if (!relation) throw new Error(`Unsupported relation ${table}.${target}`)
      const matches = row[relation.local] === null || row[relation.local] === undefined ? [] : db.prepare(`SELECT * FROM ${identifier(relation.table)} WHERE ${identifier(relation.foreign)} = ?`).all(encode(row[relation.local]))
      const projected = matches.map(match => project(db, relation.table, decode(match), nested))
      output[alias || target] = relation.many ? projected : projected[0] ?? null
    } else {
      identifier(part)
      if (!(part in row)) throw new Error(`Unknown column ${table}.${part}`)
      output[part] = row[part]
    }
  }
  return output
}

function databaseError(error: unknown): DatabaseError {
  const message = error instanceof Error ? error.message : 'Database operation failed'
  const code = /UNIQUE constraint|PRIMARY KEY/i.test(message) ? '23505' : /FOREIGN KEY constraint/i.test(message) ? '23503' : /CHECK constraint|NOT NULL constraint/i.test(message) ? '23514' : 'SQLITE_ERROR'
  return { code, message }
}

class LocalQuery implements PromiseLike<QueryResult> {
  private operation: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select'
  private selection = '*'
  private returning = false
  private options: SelectOptions = {}
  private upsertOptions: UpsertOptions = {}
  private rows: Row[] = []
  private filters: Filter[] = []
  private ordering: string[] = []
  private offset = 0
  private maximum: number | undefined
  private cardinality: 'many' | 'single' | 'maybeSingle' = 'many'
  private result: Promise<QueryResult> | undefined

  constructor(private file: string, private table: string) {}
  select(selection = '*', options: SelectOptions = {}): this { this.selection = selection; this.options = options; this.returning = true; return this }
  insert(values: Row | Row[]): this { this.operation = 'insert'; this.rows = Array.isArray(values) ? values : [values]; return this }
  upsert(values: Row | Row[], options: UpsertOptions = {}): this { this.operation = 'upsert'; this.rows = Array.isArray(values) ? values : [values]; this.upsertOptions = options; return this }
  update(values: Row): this { this.operation = 'update'; this.rows = [values]; return this }
  delete(): this { this.operation = 'delete'; return this }
  eq(column: string, value: unknown): this { this.filters.push({ sql: `${identifier(column)} ${value === null ? 'IS NULL' : '= ?'}`, values: value === null ? [] : [encode(value)] }); return this }
  is(column: string, value: null | boolean): this { this.filters.push({ sql: `${identifier(column)} IS ?`, values: [encode(value)] }); return this }
  in(column: string, values: unknown[]): this { this.filters.push({ sql: values.length ? `${identifier(column)} IN (${values.map(() => '?').join(',')})` : '0', values: values.map(encode) }); return this }
  contains(column: string, values: Record<string, unknown>[]): this {
    for (const value of values) {
      const entries = Object.entries(value)
      this.filters.push({
        sql: `EXISTS (SELECT 1 FROM json_each(${identifier(column)}) AS item${entries.length ? ` WHERE ${entries.map(() => 'json_extract(item.value, ?) IS ?').join(' AND ')}` : ''})`,
        values: entries.flatMap(([key, item]) => [`$.${identifier(key)}`, encode(item)]),
      })
    }
    return this
  }
  ilike(column: string, value: string): this { this.filters.push({ sql: `LOWER(${identifier(column)}) LIKE LOWER(?)`, values: [value] }); return this }
  gte(column: string, value: unknown): this { this.filters.push({ sql: `${identifier(column)} >= ?`, values: [encode(value)] }); return this }
  lte(column: string, value: unknown): this { this.filters.push({ sql: `${identifier(column)} <= ?`, values: [encode(value)] }); return this }
  or(expression: string): this {
    const alternatives = expression.split(',').map(item => {
      const match = /^(\w+)\.eq\.(.*)$/.exec(item)
      if (!match) throw new Error('Unsupported database OR filter')
      const value = match[2] === 'true' ? true : match[2] === 'false' ? false : match[2]
      return { sql: `${identifier(match[1])} = ?`, value: encode(value) }
    })
    this.filters.push({ sql: `(${alternatives.map(item => item.sql).join(' OR ')})`, values: alternatives.map(item => item.value) })
    return this
  }
  order(column: string, options: { ascending?: boolean } = {}): this { this.ordering.push(`${identifier(column)} ${options.ascending === false ? 'DESC' : 'ASC'}`); return this }
  limit(value: number): this { this.maximum = Math.max(0, Math.floor(value)); return this }
  range(from: number, to: number): this { this.offset = Math.max(0, Math.floor(from)); this.maximum = Math.max(0, Math.floor(to) - this.offset + 1); return this }
  single(): this { this.cardinality = 'single'; return this }
  maybeSingle(): this { this.cardinality = 'maybeSingle'; return this }

  then<TResult1 = QueryResult, TResult2 = never>(onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): Promise<TResult1 | TResult2> {
    this.result ??= Promise.resolve().then(() => this.execute())
    return this.result.then(onfulfilled, onrejected)
  }

  private execute(): QueryResult {
    let db: DatabaseSync | undefined
    let transaction = false
    try {
      if (!tables.has(this.table)) throw new Error('Unknown database table')
      db = openDatabase(this.file)
      const table = identifier(this.table)
      const where = this.filters.length ? ` WHERE ${this.filters.map(filter => filter.sql).join(' AND ')}` : ''
      const filterValues = this.filters.flatMap(filter => filter.values)
      let rows: Row[]
      let count: number | null = null
      if (this.operation === 'select') {
        if (this.options.count) count = Number(db.prepare(`SELECT COUNT(*) AS total FROM ${table}${where}`).get(...filterValues)?.total ?? 0)
        const ordering = this.ordering.length ? ` ORDER BY ${this.ordering.join(',')}` : ''
        const paging = this.maximum === undefined ? '' : ` LIMIT ${this.maximum} OFFSET ${this.offset}`
        rows = this.options.head ? [] : db.prepare(`SELECT * FROM ${table}${where}${ordering}${paging}`).all(...filterValues).map(decode)
      } else {
        db.exec('BEGIN IMMEDIATE')
        transaction = true
        if (this.operation === 'delete') rows = db.prepare(`DELETE FROM ${table}${where} RETURNING *`).all(...filterValues).map(decode)
        else if (this.operation === 'update') {
          const entries = Object.entries(this.rows[0]).filter(([, value]) => value !== undefined)
          rows = entries.length ? db.prepare(`UPDATE ${table} SET ${entries.map(([column]) => `${identifier(column)} = ?`).join(',')}${where} RETURNING *`).all(...entries.map(([, value]) => encode(value)), ...filterValues).map(decode) : db.prepare(`SELECT * FROM ${table}${where}`).all(...filterValues).map(decode)
        } else {
          rows = []
          for (const row of this.rows) {
            const entries = Object.entries({ ...row, id: row.id ?? randomUUID() }).filter(([, value]) => value !== undefined)
            let conflict = ''
            if (this.operation === 'upsert') {
              const conflictColumns = (this.upsertOptions.onConflict || 'id').split(',').map(column => column.trim())
              const updates = entries.filter(([column]) => column !== 'id' && !conflictColumns.includes(column))
              conflict = ` ON CONFLICT (${conflictColumns.map(identifier).join(',')}) ` + (this.upsertOptions.ignoreDuplicates || !updates.length ? 'DO NOTHING' : `DO UPDATE SET ${updates.map(([column]) => `${identifier(column)} = excluded.${identifier(column)}`).join(',')}`)
            }
            rows.push(...db.prepare(`INSERT INTO ${table} (${entries.map(([column]) => identifier(column)).join(',')}) VALUES (${entries.map(() => '?').join(',')})${conflict} RETURNING *`).all(...entries.map(([, value]) => encode(value))).map(decode))
          }
        }
        if (this.options.count) count = rows.length
      }
      if (this.cardinality !== 'many' && (rows.length > 1 || this.cardinality === 'single' && rows.length !== 1)) {
        if (transaction) { db.exec('ROLLBACK'); transaction = false }
        return { data: null, error: { code: 'PGRST116', message: 'Expected a single database row' }, count }
      }
      const connection = db
      const projected = rows.map(row => project(connection, this.table, row, this.selection))
      const data = this.options.head || this.operation !== 'select' && !this.returning ? null : this.cardinality === 'many' ? projected : projected[0] ?? null
      if (transaction) { db.exec('COMMIT'); transaction = false }
      return { data, error: null, count }
    } catch (error: unknown) {
      if (transaction && db) db.exec('ROLLBACK')
      return { data: null, error: databaseError(error), count: null }
    } finally { db?.close() }
  }
}

/** Local storage shares the application's existing API role and ownership checks. */
export function createLocalDatabaseClient() {
  const file = localDatabasePath()
  return { from: (table: string) => new LocalQuery(file, table) }
}
