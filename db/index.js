const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'socialnet.db');

// Ensure upload dirs exist
['../public/uploads/sounds', '../public/uploads/avatars', '../public/uploads/posts', '../public/uploads/groups']
  .forEach(d => { const p = path.join(__dirname, d); if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); });

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('cache_size = -8000');
db.pragma('synchronous = NORMAL');

// ── Promise-compatible helpers (same API as before) ──────────────────────────
// better-sqlite3 синхронный, оборачиваем в async для совместимости с роутами

const run = (sql, params = []) => {
  try {
    const stmt = db.prepare(sql);
    const result = stmt.run(...params);
    return Promise.resolve({ lastID: result.lastInsertRowid, changes: result.changes });
  } catch (e) { return Promise.reject(e); }
};

const get = (sql, params = []) => {
  try {
    const row = db.prepare(sql).get(...params);
    return Promise.resolve(row ?? null);
  } catch (e) { return Promise.reject(e); }
};

const all = (sql, params = []) => {
  try {
    const rows = db.prepare(sql).all(...params);
    return Promise.resolve(rows);
  } catch (e) { return Promise.reject(e); }
};

// ── Schema ───────────────────────────────────────────────────────────────────
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  username     TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  email        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password     TEXT    NOT NULL,
  display_name TEXT    NOT NULL DEFAULT '',
  avatar       TEXT    DEFAULT NULL,
  bio          TEXT    DEFAULT '',
  is_admin     INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  last_seen    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  deletion_scheduled_at INTEGER DEFAULT NULL
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
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  inviter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
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

CREATE INDEX IF NOT EXISTS idx_posts_user     ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_group    ON posts(group_id);
CREATE INDEX IF NOT EXISTS idx_posts_time     ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post  ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_likes_post     ON likes(post_id);
CREATE INDEX IF NOT EXISTS idx_friends_user   ON friends(user_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend ON friends(friend_id);
CREATE INDEX IF NOT EXISTS idx_msg_sender     ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_msg_receiver   ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_notif_user     ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_gm_group       ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_gm_user        ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_gi_group       ON group_invites(group_id);
CREATE INDEX IF NOT EXISTS idx_gi_invitee     ON group_invites(invitee_id);
`);

module.exports = { db, run, get, all };
