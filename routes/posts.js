const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const auth = require('../middleware/auth');
const { run, get, all } = require('../db/index');

const storage = multer.diskStorage({
  destination: 'public/uploads/posts',
  filename: (req, file, cb) => cb(null, `${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => cb(null, /image\/(jpeg|png|gif|webp)/.test(file.mimetype)) });

const withMeta = async (posts, userId) => {
  return Promise.all(posts.map(async p => {
    const [likes, comments, liked] = await Promise.all([
      get('SELECT COUNT(*) as c FROM likes WHERE post_id=?', [p.id]),
      get('SELECT COUNT(*) as c FROM comments WHERE post_id=?', [p.id]),
      get('SELECT 1 FROM likes WHERE post_id=? AND user_id=?', [p.id, userId])
    ]);
    return { ...p, likes: likes.c, comments: comments.c, liked: !!liked };
  }));
};

// GET /api/posts/feed
router.get('/feed', auth, async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit) || 20, 50);
  const offset = parseInt(req.query.offset) || 0;
  const posts = await all(`
    SELECT p.*, u.username, u.display_name, u.avatar,
           g.name as group_name, g.id as gid
    FROM posts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN groups g ON g.id = p.group_id
    WHERE p.group_id IS NULL AND (
      p.user_id = ? OR
      p.user_id IN (
        SELECT CASE WHEN user_id=? THEN friend_id ELSE user_id END
        FROM friends WHERE (user_id=? OR friend_id=?) AND status='accepted'
      )
    )
    ORDER BY p.created_at DESC LIMIT ? OFFSET ?
  `, [req.user.id, req.user.id, req.user.id, req.user.id, limit, offset]);
  res.json(await withMeta(posts, req.user.id));
});

// GET /api/posts/user/:id
router.get('/user/:id', auth, async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit) || 20, 50);
  const offset = parseInt(req.query.offset) || 0;
  const posts = await all(`
    SELECT p.*, u.username, u.display_name, u.avatar
    FROM posts p JOIN users u ON u.id = p.user_id
    WHERE p.user_id = ? AND p.group_id IS NULL
    ORDER BY p.created_at DESC LIMIT ? OFFSET ?
  `, [req.params.id, limit, offset]);
  res.json(await withMeta(posts, req.user.id));
});

// POST /api/posts
router.post('/', auth, upload.single('image'), async (req, res) => {
  const { content, group_id } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Пост не может быть пустым' });
  const image_url = req.file ? '/uploads/posts/' + req.file.filename : null;

  if (group_id) {
    const member = await get('SELECT 1 FROM group_members WHERE group_id=? AND user_id=?', [group_id, req.user.id]);
    if (!member) return res.status(403).json({ error: 'Ты не состоишь в этой группе' });
  }

  const { lastID } = await run(
    'INSERT INTO posts (user_id, content, image_url, group_id) VALUES (?,?,?,?)',
    [req.user.id, content.trim(), image_url, group_id || null]
  );
  const post = await get(`
    SELECT p.*, u.username, u.display_name, u.avatar
    FROM posts p JOIN users u ON u.id=p.user_id WHERE p.id=?
  `, [lastID]);
  res.status(201).json({ ...post, likes: 0, comments: 0, liked: false });
});

// DELETE /api/posts/:id  (owner or admin)
router.delete('/:id', auth, async (req, res) => {
  const post = await get('SELECT * FROM posts WHERE id=?', [req.params.id]);
  if (!post) return res.status(404).json({ error: 'Пост не найден' });
  if (post.user_id !== req.user.id && !req.user.is_admin)
    return res.status(403).json({ error: 'Нет прав' });
  await run('DELETE FROM posts WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// POST /api/posts/:id/like
router.post('/:id/like', auth, async (req, res) => {
  const post = await get('SELECT id, user_id FROM posts WHERE id=?', [req.params.id]);
  if (!post) return res.status(404).json({ error: 'Пост не найден' });
  const existing = await get('SELECT id FROM likes WHERE post_id=? AND user_id=?', [post.id, req.user.id]);
  if (existing) {
    await run('DELETE FROM likes WHERE post_id=? AND user_id=?', [post.id, req.user.id]);
    return res.json({ liked: false });
  }
  await run('INSERT INTO likes (post_id, user_id) VALUES (?,?)', [post.id, req.user.id]);
  if (post.user_id !== req.user.id) {
    await run('INSERT INTO notifications (user_id, type, from_id, ref_id, ref_type, text) VALUES (?,?,?,?,?,?)',
      [post.user_id, 'like', req.user.id, post.id, 'post', `${req.user.display_name} лайкнул твой пост`]);
  }
  res.json({ liked: true });
});

// GET /api/posts/:id/comments
router.get('/:id/comments', auth, async (req, res) => {
  const comments = await all(`
    SELECT c.*, u.username, u.display_name, u.avatar
    FROM comments c JOIN users u ON u.id=c.user_id
    WHERE c.post_id=? ORDER BY c.created_at ASC
  `, [req.params.id]);
  res.json(comments);
});

// POST /api/posts/:id/comments
router.post('/:id/comments', auth, async (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Комментарий пуст' });
  const post = await get('SELECT id, user_id FROM posts WHERE id=?', [req.params.id]);
  if (!post) return res.status(404).json({ error: 'Пост не найден' });
  const { lastID } = await run('INSERT INTO comments (post_id, user_id, content) VALUES (?,?,?)',
    [post.id, req.user.id, content.trim()]);
  if (post.user_id !== req.user.id) {
    await run('INSERT INTO notifications (user_id, type, from_id, ref_id, ref_type, text) VALUES (?,?,?,?,?,?)',
      [post.user_id, 'comment', req.user.id, post.id, 'post', `${req.user.display_name} прокомментировал твой пост`]);
  }
  const comment = await get('SELECT c.*, u.username, u.display_name, u.avatar FROM comments c JOIN users u ON u.id=c.user_id WHERE c.id=?', [lastID]);
  res.status(201).json(comment);
});

// DELETE /api/posts/:id/comments/:cid  (owner or admin)
router.delete('/:id/comments/:cid', auth, async (req, res) => {
  const c = await get('SELECT * FROM comments WHERE id=?', [req.params.cid]);
  if (!c) return res.status(404).json({ error: 'Комментарий не найден' });
  if (c.user_id !== req.user.id && !req.user.is_admin)
    return res.status(403).json({ error: 'Нет прав' });
  await run('DELETE FROM comments WHERE id=?', [c.id]);
  res.json({ ok: true });
});

module.exports = router;
