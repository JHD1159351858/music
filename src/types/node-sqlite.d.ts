declare module 'node:sqlite' {
  export type SQLInputValue = null | number | bigint | string | NodeJS.ArrayBufferView
  export class StatementSync {
    all(...values: SQLInputValue[]): Record<string, unknown>[]
    get(...values: SQLInputValue[]): Record<string, unknown> | undefined
    run(...values: SQLInputValue[]): { changes: number | bigint; lastInsertRowid: number | bigint }
  }
  export class DatabaseSync {
    constructor(path: string)
    exec(sql: string): void
    prepare(sql: string): StatementSync
    close(): void
  }
}
