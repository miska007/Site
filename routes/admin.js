const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const adminAuth = require('../middleware/admin');
const { run, get, all } = require('../db/index');

const soundStorage = multer.diskStorage({
  destination: 'public/uploads/sounds',
  filename: (req, file, cb) => {
    const type = req.params.type; // message | notification | friend_request | group_invite
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `sound_${type}${ext}`);
  }
});
const uploadSound = multer({
  storage: soundStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok = /^audio\/(mpeg|ogg|wav|mp4|webm|aac)/.test(file.mimetype) ||
               /\.(mp3|ogg|wav|m4a|aac|webm)$/.test(file.originalname.toLowerCase());
    cb(null, ok);
  }
});

// GET /api/admin/stats
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const [users, posts, msgs, groups, notifs] = await Promise.all([
      get('SELECT COUNT(*) as c FROM users'),
      get('SELECT COUNT(*) as c FROM posts'),
      get('SELECT COUNT(*) as c FROM messages'),
      get('SELECT COUNT(*) as c FROM groups'),
      get('SELECT COUNT(*) as c FROM notifications WHERE read_at IS NULL')
    ]);
    res.json({
      users: users.c, posts: posts.c,
      messages: msgs.c, groups: groups.c,
      unread_notifications: notifs.c
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/users
router.get('/users', adminAuth, async (req, res) => {
  try {
    const users = await all(`
      SELECT id, username, email, display_name, avatar, is_admin,
             created_at, last_seen,
             (SELECT COUNT(*) FROM posts WHERE user_id=users.id) as post_count
      FROM users ORDER BY created_at DESC
    `);
    res.json(users);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/admin/users/:id  — toggle admin or update
router.patch('/users/:id', adminAuth, async (req, res) => {
  try {
    const { is_admin } = req.body;
    if (typeof is_admin !== 'undefined') {
      if (parseInt(req.params.id) === req.user.id)
        return res.status(400).json({ error: 'Нельзя изменить собственные права' });
      await run('UPDATE users SET is_admin=? WHERE id=?', [is_admin ? 1 : 0, req.params.id]);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', adminAuth, async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id)
      return res.status(400).json({ error: 'Нельзя удалить себя' });
    await run('DELETE FROM users WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/settings
router.get('/settings', adminAuth, async (req, res) => {
  try {
    const rows = await all('SELECT key, value FROM admin_settings');
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/settings
router.put('/settings', adminAuth, async (req, res) => {
  try {
    const entries = Object.entries(req.body);
    for (const [key, value] of entries) {
      // Only allow known keys
      if (!/^[a-zA-Z0-9_-]+$/.test(key)) continue;
      await run(
        'INSERT INTO admin_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
        [key, String(value)]
      );
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/sounds/:type  — upload sound file
router.post('/sounds/:type', adminAuth, uploadSound.single('sound'), async (req, res) => {
  try {
    const allowed = ['message', 'notification', 'friend_request', 'group_invite'];
    if (!allowed.includes(req.params.type))
      return res.status(400).json({ error: 'Неверный тип звука' });
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

    const url = '/uploads/sounds/' + req.file.filename;
    const key = `sound_${req.params.type}`;
    await run(
      'INSERT INTO admin_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      [key, url]
    );
    res.json({ ok: true, url });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/admin/sounds/:type  — remove sound
router.delete('/sounds/:type', adminAuth, async (req, res) => {
  try {
    const key = `sound_${req.params.type}`;
    const row = await get('SELECT value FROM admin_settings WHERE key=?', [key]);
    if (row) {
      const filePath = path.join(__dirname, '../public', row.value);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await run('DELETE FROM admin_settings WHERE key=?', [key]);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
