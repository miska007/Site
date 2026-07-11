const sqlite3 = require('./node_modules/sqlite3').verbose();
const bcrypt  = require('./node_modules/bcryptjs');
const path    = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'db', 'socialnet.db'));

db.serialize(() => {
  db.run('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0', () => {});
  db.run('ALTER TABLE users ADD COLUMN deletion_scheduled_at INTEGER DEFAULT NULL', () => {});

  db.run(`CREATE TABLE IF NOT EXISTS admin_settings (
    key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT ''
  )`, () => {});

  db.run(`CREATE TABLE IF NOT EXISTS group_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    inviter_id INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    invitee_id INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    UNIQUE(group_id, invitee_id)
  )`, () => {});

  db.run('CREATE INDEX IF NOT EXISTS idx_gi_group   ON group_invites(group_id)',   () => {});
  db.run('CREATE INDEX IF NOT EXISTS idx_gi_invitee ON group_invites(invitee_id)', () => {});

  const hash = bcrypt.hashSync('admin123', 10);
  db.run(
    `INSERT INTO users (username, email, password, display_name, is_admin)
     VALUES (?,?,?,?,1)
     ON CONFLICT(username) DO UPDATE SET is_admin=1, password=excluded.password`,
    ['admin', 'admin@local.ru', hash, 'Admin'],
    function(err) {
      if (err) console.error('ERROR:', err.message);
      else console.log('OK: admin готов, пароль: admin123');
      db.close();
    }
  );
});
