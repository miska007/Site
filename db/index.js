const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'socialnet.db');

// Ensure uploads/sounds dir exists
const SOUNDS_DIR = path.join(__dirname, '../public/uploads/sounds');
if (!fs.existsSync(SOUNDS_DIR)) fs.mkdirSync(SOUNDS_DIR, { recursive: true });

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) { console.error('DB open error:', err); process.exit(1); }
  console.log('SQLite connected:', DB_PATH);
});

db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA foreign_keys = ON');
db.run('PRAGMA cache_size = -8000');   // 8MB cache
db.run('PRAGMA synchronous = NORMAL'); // faster, still safe with WAL

// Promise helpers
const run = (sql, params = []) => new Promise((res, rej) =>
  db.run(sql, params, function(err) { err ? rej(err) : res({ lastID: this.lastID, changes: this.changes }); }));

const get = (sql, params = []) => new Promise((res, rej) =>
  db.get(sql, params, (err, row) => err ? rej(err) : res(row)));

const all = (sql, params = []) => new Promise((res, rej) =>
  db.all(sql, params, (err, rows) => err ? rej(err) : res(rows)));

// Schema
const schema = `
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  email       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password    TEXT    NOT NULL,
  display_name TEXT   NOT NULL DEFAULT '',
  avatar      TEXT    DEFAULT NULL,
  bio         TEXT    DEFAULT '',
  is_admin    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  last_seen   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS posts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT    NOT NULL,
  image_url  TEXT    DEFAULT NULL,
  group_id   INTEGER DEFAULT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT    NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS likes (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS friends (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status     TEXT    NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  UNIQUE(user_id, friend_id)
);

CREATE TABLE IF NOT EXISTS groups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  description TEXT    DEFAULT '',
  avatar      TEXT    DEFAULT NULL,
  creator_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_private  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS group_members (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id  INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT    NOT NULL DEFAULT 'member',
  joined_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  UNIQUE(group_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_invites (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id    INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  inviter_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  UNIQUE(group_id, invitee_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content     TEXT    NOT NULL,
  read_at     INTEGER DEFAULT NULL,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT    NOT NULL,
  from_id    INTEGER DEFAULT NULL,
  ref_id     INTEGER DEFAULT NULL,
  ref_type   TEXT    DEFAULT NULL,
  text       TEXT    NOT NULL DEFAULT '',
  read_at    INTEGER DEFAULT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS admin_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_posts_user    ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_group   ON posts(group_id);
CREATE INDEX IF NOT EXISTS idx_posts_time    ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_likes_post    ON likes(post_id);
CREATE INDEX IF NOT EXISTS idx_friends_user  ON friends(user_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend ON friends(friend_id);
CREATE INDEX IF NOT EXISTS idx_msg_sender    ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_msg_receiver  ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_notif_user    ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_gm_group      ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_gm_user       ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_gi_group      ON group_invites(group_id);
CREATE INDEX IF NOT EXISTS idx_gi_invitee    ON group_invites(invitee_id);
`;

db.serialize(() => {
  schema.split(';').map(s => s.trim()).filter(Boolean).forEach(sql => {
    db.run(sql, err => {
      if (err && !err.message.includes('already exists')) console.error('Schema error:', err.message);
    });
  });

  // Migrations for existing DBs
  db.run('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0', () => {});
});

module.exports = { db, run, get, all };
