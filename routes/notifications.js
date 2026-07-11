const router = require('express').Router();
const auth = require('../middleware/auth');
const { run, get, all } = require('../db/index');

// GET /api/notifications
router.get('/', auth, async (req, res) => {
  const notifs = await all(`
    SELECT n.*, u.username as from_username, u.display_name as from_name, u.avatar as from_avatar
    FROM notifications n
    LEFT JOIN users u ON u.id=n.from_id
    WHERE n.user_id=?
    ORDER BY n.created_at DESC LIMIT 50
  `, [req.user.id]);
  res.json(notifs);
});

// GET /api/notifications/unread-count — returns both notifications and messages
router.get('/unread-count', auth, async (req, res) => {
  const [nRow, mRow] = await Promise.all([
    get('SELECT COUNT(*) as c FROM notifications WHERE user_id=? AND read_at IS NULL', [req.user.id]),
    get('SELECT COUNT(*) as c FROM messages WHERE receiver_id=? AND read_at IS NULL', [req.user.id])
  ]);
  res.json({ notifications: nRow.c, messages: mRow.c });
});

// POST /api/notifications/read-all
router.post('/read-all', auth, async (req, res) => {
  await run("UPDATE notifications SET read_at=strftime('%s','now') WHERE user_id=? AND read_at IS NULL", [req.user.id]);
  res.json({ ok: true });
});

// DELETE /api/notifications/:id
router.delete('/:id', auth, async (req, res) => {
  await run('DELETE FROM notifications WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
  res.json({ ok: true });
});

module.exports = router;
