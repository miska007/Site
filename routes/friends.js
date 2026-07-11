const router = require('express').Router();
const auth = require('../middleware/auth');
const { run, get, all } = require('../db/index');

// GET /api/friends  — список друзей
router.get('/', auth, async (req, res) => {
  const friends = await all(`
    SELECT u.id, u.username, u.display_name, u.avatar, u.last_seen,
           f.status, f.user_id as requester_id, f.id as friendship_id
    FROM friends f
    JOIN users u ON u.id = CASE WHEN f.user_id=? THEN f.friend_id ELSE f.user_id END
    WHERE f.user_id=? OR f.friend_id=?
    ORDER BY f.status, u.display_name
  `, [req.user.id, req.user.id, req.user.id]);
  res.json(friends);
});

// POST /api/friends/:id  — отправить заявку
router.post('/:id', auth, async (req, res) => {
  const targetId = parseInt(req.params.id);
  if (targetId === req.user.id) return res.status(400).json({ error: 'Нельзя добавить себя' });
  const user = await get('SELECT id, display_name FROM users WHERE id=?', [targetId]);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  const existing = await get(
    'SELECT * FROM friends WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?)',
    [req.user.id, targetId, targetId, req.user.id]
  );
  if (existing) return res.status(409).json({ error: 'Заявка уже отправлена или вы уже друзья' });

  await run('INSERT INTO friends (user_id, friend_id, status) VALUES (?,?,\'pending\')', [req.user.id, targetId]);
  await run('INSERT INTO notifications (user_id, type, from_id, ref_id, ref_type, text) VALUES (?,?,?,?,?,?)',
    [targetId, 'friend_request', req.user.id, req.user.id, 'user', `${req.user.display_name} хочет добавить тебя в друзья`]);
  res.json({ ok: true });
});

// PATCH /api/friends/:id  — принять/отклонить
router.patch('/:id', auth, async (req, res) => {
  const { action } = req.body; // 'accept' | 'decline'
  const row = await get(
    'SELECT * FROM friends WHERE id=? AND friend_id=?',
    [req.params.id, req.user.id]
  );
  if (!row) return res.status(404).json({ error: 'Заявка не найдена' });

  if (action === 'accept') {
    await run('UPDATE friends SET status=\'accepted\' WHERE id=?', [row.id]);
    await run('INSERT INTO notifications (user_id, type, from_id, ref_id, ref_type, text) VALUES (?,?,?,?,?,?)',
      [row.user_id, 'friend_accepted', req.user.id, req.user.id, 'user', `${req.user.display_name} принял твою заявку в друзья`]);
    res.json({ ok: true, status: 'accepted' });
  } else {
    await run('DELETE FROM friends WHERE id=?', [row.id]);
    res.json({ ok: true, status: 'declined' });
  }
});

// DELETE /api/friends/:id  — удалить из друзей
router.delete('/:id', auth, async (req, res) => {
  await run(
    'DELETE FROM friends WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?)',
    [req.user.id, req.params.id, req.params.id, req.user.id]
  );
  res.json({ ok: true });
});

module.exports = router;
