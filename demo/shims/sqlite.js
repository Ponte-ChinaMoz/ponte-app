// node:sqlite (DatabaseSync) sobre sql.js, com a base de dados guardada no IndexedDB do navegador.
import initSqlJs from 'sql.js/dist/sql-asm-memory-growth.js';

export const shared = { SQL: null, db: null, dirty: false, onDirty: null };

export async function initSqlite(bytes) {
  shared.SQL = await initSqlJs();
  shared.db = new shared.SQL.Database(bytes || undefined);
  shared.db.exec('PRAGMA foreign_keys = ON;');
}
const touch = () => { shared.dirty = true; shared.onDirty?.(); };
const isWrite = (sql) => !/^\s*(SELECT|PRAGMA\s+table_info|WITH)\b/i.test(sql);

class Statement {
  constructor(sql) { this.sql = sql; }
  all(...params) {
    const st = shared.db.prepare(this.sql);
    try {
      if (params.length) st.bind(params);
      const out = [];
      while (st.step()) out.push(st.getAsObject());
      return out;
    } finally { st.free(); }
  }
  get(...params) { return this.all(...params)[0]; }
  run(...params) {
    const st = shared.db.prepare(this.sql);
    try { if (params.length) st.bind(params); while (st.step()) { /* consumir */ } } finally { st.free(); }
    const changes = shared.db.getRowsModified();
    const id = shared.db.exec('SELECT last_insert_rowid() AS id')[0]?.values[0][0] ?? 0;
    if (isWrite(this.sql)) touch();
    return { changes, lastInsertRowid: id };
  }
}

export class DatabaseSync {
  exec(sql) { shared.db.exec(sql); if (isWrite(sql)) touch(); }
  prepare(sql) { return new Statement(sql); }
  close() {}
}
export default { DatabaseSync };
