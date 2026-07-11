const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const auth = require('../middleware/auth');
const { run, get, all } = require('../db/index');

const storage = multer.diskStorage({
  destination: 'public/uploads/groups',
  filename: (req, file, cb) => cb(null, `g_${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => cb(null, /image\/(jpeg|png|gif|webp)/.test(file.mimetype)) });

// GET /api/groups  — все публичные + мои
router.get('/', auth, async (req, res) => {
  const groups = await all(`
    SELECT g.*, u.username as creator_username, u.display_name as creator_name,
           (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id=g.id) as member_count,
           (SELECT 1 FROM group_members gm WHERE gm.group_id=g.id AND gm.user_id=?) as is_member
    FROM groups g JOIN users u ON u.id=g.creator_id
    WHERE g.is_private=0 OR g.creator_id=?
       OR g.id IN (SELECT group_id FROM group_members WHERE user_id=?)
    ORDER BY member_count DESC, g.created_at DESC LIMIT 50
  `, [req.user.id, req.user.id, req.user.id]);
  res.json(groups);
});

// GET /api/groups/my
router.get('/my', auth, async (req, res) => {
  const groups = await all(`
    SELECT g.*, (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id=g.id) as member_count,
           gm.role
    FROM groups g JOIN group_members gm ON gm.group_id=g.id AND gm.user_id=?
    ORDER BY g.name
  `, [req.user.id]);
  res.json(groups);
});

// POST /api/groups
router.post('/', auth, async (req, res) => {
  const { name, description, is_private } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Название обязательно' });
  const { lastID } = await run(
    'INSERT INTO groups (name, description, creator_id, is_private) VALUES (?,?,?,?)',
    [name.trim(), description?.trim() || '', req.user.id, is_private ? 1 : 0]
  );
  await run('INSERT INTO group_members (group_id, user_id, role) VALUES (?,?,\'admin\')', [lastID, req.user.id]);
  const group = await get('SELECT * FROM groups WHERE id=?', [lastID]);
  res.status(201).json(group);
});

// GET /api/groups/:id
router.get('/:id', auth, async (req, res) => {
  const group = await get(`
    SELECT g.*, u.username as creator_username, u.display_name as creator_name,
           (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id=g.id) as member_count,
           (SELECT role FROM group_members WHERE group_id=g.id AND user_id=?) as my_role,
           (SELECT 1 FROM group_invites WHERE group_id=g.id AND invitee_id=?) as has_invite
    FROM groups g JOIN users u ON u.id=g.creator_id WHERE g.id=?
  `, [req.user.id, req.user.id, req.params.id]);
  if (!group) return res.status(404).json({ error: 'Группа не найдена' });
  res.json(group);
});

// POST /api/groups/:id/join  — вступить (публичная) или принять приглашение (приватная)
router.post('/:id/join', auth, async (req, res) => {
  const group = await get('SELECT * FROM groups WHERE id=?', [req.params.id]);
  if (!group) return res.status(404).json({ error: 'Группа не найдена' });

  const existing = await get('SELECT 1 FROM group_members WHERE group_id=? AND user_id=?', [group.id, req.user.id]);
  if (existing) return res.status(409).json({ error: 'Ты уже в этой группе' });

  if (group.is_private) {
    const invite = await get('SELECT 1 FROM group_invites WHERE group_id=? AND invitee_id=?', [group.id, req.user.id]);
    if (!invite) return res.status(403).json({ error: 'Группа приватная. Нужно приглашение.' });
    // Clean up invite
    await run('DELETE FROM group_invites WHERE group_id=? AND invitee_id=?', [group.id, req.user.id]);
  }

  await run('INSERT INTO group_members (group_id, user_id) VALUES (?,?)', [group.id, req.user.id]);
  res.json({ ok: true });
});

// DELETE /api/groups/:id/leave
router.delete('/:id/leave', auth, async (req, res) => {
  const member = await get('SELECT * FROM group_members WHERE group_id=? AND user_id=?', [req.params.id, req.user.id]);
  if (!member) return res.status(404).json({ error: 'Ты не состоишь в группе' });
  if (member.role === 'admin') return res.status(400).json({ error: 'Передай права администратора перед выходом' });
  await run('DELETE FROM group_members WHERE group_id=? AND user_id=?', [req.params.id, req.user.id]);
  res.json({ ok: true });
});

// POST /api/groups/:id/invite/:userId  — пригласить пользователя (только admin группы)
router.post('/:id/invite/:userId', auth, async (req, res) => {
  const groupId = parseInt(req.params.id);
  const inviteeId = parseInt(req.params.userId);

  const group = await get('SELECT * FROM groups WHERE id=?', [groupId]);
  if (!group) return res.status(404).json({ error: 'Группа не найдена' });

  // Only group admin or site admin can invite
  const member = await get('SELECT role FROM group_members WHERE group_id=? AND user_id=?', [groupId, req.user.id]);
  if (!member && !req.user.is_admin) return res.status(403).json({ error: 'Нет прав' });
  if (member && member.role !== 'admin' && !req.user.is_admin) return res.status(403).json({ error: 'Только администратор группы может приглашать' });

  const invitee = await get('SELECT id, display_name FROM users WHERE id=?', [inviteeId]);
  if (!invitee) return res.status(404).json({ error: 'Пользователь не найден' });

  const alreadyMember = await get('SELECT 1 FROM group_members WHERE group_id=? AND user_id=?', [groupId, inviteeId]);
  if (alreadyMember) return res.status(409).json({ error: 'Пользователь уже в группе' });

  const alreadyInvited = await get('SELECT 1 FROM group_invites WHERE group_id=? AND invitee_id=?', [groupId, inviteeId]);
  if (alreadyInvited) return res.status(409).json({ error: 'Приглашение уже отправлено' });

  await run('INSERT INTO group_invites (group_id, inviter_id, invitee_id) VALUES (?,?,?)', [groupId, req.user.id, inviteeId]);

  // Create notification
  await run('INSERT INTO notifications (user_id, type, from_id, ref_id, ref_type, text) VALUES (?,?,?,?,?,?)',
    [inviteeId, 'group_invite', req.user.id, groupId, 'group',
     `${req.user.display_name} приглашает тебя в сообщество «${group.name}»`]);

  // Real-time push
  const io = req.app.get('io');
  const onlineUsers = req.app.get('onlineUsers');
  const targetSocket = onlineUsers?.get(inviteeId);
  if (io && targetSocket) {
    io.to(targetSocket).emit('notification:new', { type: 'group_invite', groupId, groupName: group.name });
  }

  res.json({ ok: true });
});

// DELETE /api/groups/:id/invite  — отклонить приглашение
router.delete('/:id/invite', auth, async (req, res) => {
  await run('DELETE FROM group_invites WHERE group_id=? AND invitee_id=?', [req.params.id, req.user.id]);
  res.json({ ok: true });
});

// GET /api/groups/:id/posts
router.get('/:id/posts', auth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const offset = parseInt(req.query.offset) || 0;
  const isMember = await get('SELECT 1 FROM group_members WHERE group_id=? AND user_id=?', [req.params.id, req.user.id]);
  const group = await get('SELECT is_private FROM groups WHERE id=?', [req.params.id]);
  if (!group) return res.status(404).json({ error: 'Группа не найдена' });
  if (group.is_private && !isMember) return res.status(403).json({ error: 'Группа приватная' });

  const posts = await all(`
    SELECT p.*, u.username, u.display_name, u.avatar,
           (SELECT COUNT(*) FROM likes WHERE post_id=p.id) as likes,
           (SELECT COUNT(*) FROM comments WHERE post_id=p.id) as comments,
           (SELECT 1 FROM likes WHERE post_id=p.id AND user_id=?) as liked
    FROM posts p JOIN users u ON u.id=p.user_id
    WHERE p.group_id=?
    ORDER BY p.created_at DESC LIMIT ? OFFSET ?
  `, [req.user.id, req.params.id, limit, offset]);
  res.json(posts);
});

// GET /api/groups/:id/members
router.get('/:id/members', auth, async (req, res) => {
  const members = await all(`
    SELECT u.id, u.username, u.display_name, u.avatar, gm.role, gm.joined_at
    FROM group_members gm JOIN users u ON u.id=gm.user_id
    WHERE gm.group_id=? ORDER BY gm.role DESC, u.display_name
  `, [req.params.id]);
  res.json(members);
});

// POST /api/groups/:id/avatar
router.post('/:id/avatar', auth, upload.single('avatar'), async (req, res) => {
  const member = await get('SELECT role FROM group_members WHERE group_id=? AND user_id=?', [req.params.id, req.user.id]);
  if (!member || member.role !== 'admin') return res.status(403).json({ error: 'Нет прав' });
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
  const url = '/uploads/groups/' + req.file.filename;
  await run('UPDATE groups SET avatar=? WHERE id=?', [url, req.params.id]);
  res.json({ avatar: url });
});

module.exports = router;
