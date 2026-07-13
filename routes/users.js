const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const auth = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const { run, get, all } = require('../db/index');

const storage = multer.diskStorage({
  destination: 'public/uploads/avatars',
  filename: (req, file, cb) => cb(null, `${req.user.id}_${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => cb(null, /image\/(jpeg|png|gif|webp)/.test(file.mimetype)) });

router.get('/me', auth, (req, res) => res.json(req.user));

router.get('/search/users', auth, rateLimit('search', 30, 60_000), async (req, res) => {
  const q = '%' + (req.query.q || '') + '%';
  const users = await all(
    'SELECT id, username, display_name, avatar, last_seen FROM users WHERE (username LIKE ? OR display_name LIKE ?) AND id!=? LIMIT 20',
    [q, q, req.user.id]
  );
  res.json(users);
});

router.get('/:username', auth, async (req, res) => {
  const user = await get(
    'SELECT id, username, email, display_name, avatar, bio, created_at, last_seen FROM users WHERE username=?',
    [req.params.username.toLowerCase()]
  );
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  const [friendRow, postCount, friendCount] = await Promise.all([
    get('SELECT status FROM friends WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?)',
      [req.user.id, user.id, user.id, req.user.id]),
    get('SELECT COUNT(*) as c FROM posts WHERE user_id=?', [user.id]),
    get("SELECT COUNT(*) as c FROM friends WHERE (user_id=? OR friend_id=?) AND status='accepted'", [user.id, user.id])
  ]);
  res.json({ ...user, friend_status: friendRow?.status || null, post_count: postCount.c, friend_count: friendCount.c });
});

router.patch('/me', auth, async (req, res) => {
  const { display_name, bio } = req.body;
  await run('UPDATE users SET display_name=?, bio=? WHERE id=?',
    [display_name || req.user.display_name, bio ?? req.user.bio, req.user.id]);
  const updated = await get('SELECT id,username,email,display_name,avatar,bio FROM users WHERE id=?', [req.user.id]);
  res.json(updated);
});

router.post('/me/avatar', auth, upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
  const url = '/uploads/avatars/' + req.file.filename;
  await run('UPDATE users SET avatar=? WHERE id=?', [url, req.user.id]);
  res.json({ avatar: url });
});

// ── Смена пароля ────────────────────────────────────────────────────────────
router.patch('/me/password', auth, rateLimit('change_password', 5, 15 * 60_000), async (req, res) => {
  try {
    const { old_password, new_password } = req.body;
    if (!old_password || !new_password)
      return res.status(400).json({ error: 'Заполни все поля' });
    if (new_password.length < 6)
      return res.status(400).json({ error: 'Новый пароль: минимум 6 символов' });

    const row = await get('SELECT password FROM users WHERE id=?', [req.user.id]);
    const ok = await require('bcryptjs').compare(old_password, row.password);
    if (!ok) return res.status(401).json({ error: 'Старый пароль неверен' });

    const hash = await require('bcryptjs').hash(new_password, 10);
    await run('UPDATE users SET password=? WHERE id=?', [hash, req.user.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Отсроченное удаление аккаунта (мин. 14 дней) ───────────────────────────
const DELETION_DAYS = 14;

router.post('/me/schedule-deletion', auth, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Введи пароль для подтверждения' });
    const full = await get('SELECT password FROM users WHERE id=?', [req.user.id]);
    const ok = await require('bcryptjs').compare(password, full.password);
    if (!ok) return res.status(401).json({ error: 'Неверный пароль' });

    const deleteAt = Math.floor(Date.now() / 1000) + DELETION_DAYS * 86400;
    await run('UPDATE users SET deletion_scheduled_at=? WHERE id=?', [deleteAt, req.user.id]);

    const date = new Date(deleteAt * 1000).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' });
    res.json({ ok: true, delete_at: deleteAt, message: `Аккаунт будет удалён ${date}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/me/cancel-deletion', auth, async (req, res) => {
  await run('UPDATE users SET deletion_scheduled_at=NULL WHERE id=?', [req.user.id]);
  res.json({ ok: true });
});

module.exports = router;
