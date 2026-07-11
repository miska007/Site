const router = require('express').Router();
const auth = require('../middleware/auth');
const { run, get, all } = require('../db/index');

// GET /api/messages  — список диалогов
router.get('/', auth, async (req, res) => {
  const dialogs = await all(`
    SELECT u.id, u.username, u.display_name, u.avatar, u.last_seen,
           m.content as last_message, m.created_at as last_time,
           (SELECT COUNT(*) FROM messages WHERE sender_id=u.id AND receiver_id=? AND read_at IS NULL) as unread
    FROM users u
    JOIN messages m ON m.id = (
      SELECT id FROM messages
      WHERE (sender_id=u.id AND receiver_id=?) OR (sender_id=? AND receiver_id=u.id)
      ORDER BY created_at DESC LIMIT 1
    )
    WHERE u.id != ?
    ORDER BY last_time DESC
  `, [req.user.id, req.user.id, req.user.id, req.user.id]);
  res.json(dialogs);
});

// GET /api/messages/:userId  — история с пользователем
router.get('/:userId', auth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const before = req.query.before ? parseInt(req.query.before) : null;
  const params = [req.user.id, req.params.userId, req.params.userId, req.user.id];
  const whereTime = before ? `AND m.created_at < ${before}` : '';

  const messages = await all(`
    SELECT m.*, u.username, u.display_name, u.avatar
    FROM messages m JOIN users u ON u.id=m.sender_id
    WHERE ((m.sender_id=? AND m.receiver_id=?) OR (m.sender_id=? AND m.receiver_id=?))
    ${whereTime}
    ORDER BY m.created_at DESC LIMIT ?
  `, [...params, limit]);

  // Пометить прочитанными
  await run(`UPDATE messages SET read_at=strftime('%s','now')
    WHERE sender_id=? AND receiver_id=? AND read_at IS NULL`,
    [req.params.userId, req.user.id]);

  res.json(messages.reverse());
});

// POST /api/messages/:userId  — отправить сообщение (REST fallback)
router.post('/:userId', auth, async (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Пустое сообщение' });
  const target = await get('SELECT id FROM users WHERE id=?', [req.params.userId]);
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });

  const { lastID } = await run(
    'INSERT INTO messages (sender_id, receiver_id, content) VALUES (?,?,?)',
    [req.user.id, target.id, content.trim()]
  );
  const msg = await get('SELECT m.*, u.username, u.display_name, u.avatar FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.id=?', [lastID]);
  res.status(201).json(msg);
});

module.exports = router;
