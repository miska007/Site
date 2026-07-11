require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const http    = require('http');
const { Server } = require('socket.io');
const jwt     = require('jsonwebtoken');
const { get, run } = require('./db/index');
const security = require('./middleware/security');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

// Security headers first
app.use(security);
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    // Запретить встраивание в iframe
    res.set('X-Frame-Options', 'DENY');
    // JS/CSS — кешировать, но не на CDN третьих лиц
    if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.set('Cache-Control', 'private, max-age=3600');
    }
  }
}));

app.use('/api/auth',          require('./routes/auth'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/posts',         require('./routes/posts'));
app.use('/api/friends',       require('./routes/friends'));
app.use('/api/groups',        require('./routes/groups'));
app.use('/api/messages',      require('./routes/messages'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/admin',         require('./routes/admin'));

app.get('/api/settings', async (req, res) => {
  try {
    const rows = await require('./db/index').all('SELECT key, value FROM admin_settings');
    const s = {}; rows.forEach(r => { s[r.key] = r.value; }); res.json(s);
  } catch { res.json({}); }
});

// SPA fallback
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads'))
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Socket.IO ────────────────────────────────────────────────────────────────
const onlineUsers = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Нет токена'));
  try { socket.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { next(new Error('Невалидный токен')); }
});

io.on('connection', async (socket) => {
  const uid = socket.user.id;
  onlineUsers.set(uid, socket.id);
  await run("UPDATE users SET last_seen=strftime('%s','now') WHERE id=?", [uid]);
  socket.broadcast.emit('user:online', uid);

  socket.on('message:send', async ({ to, content }) => {
    if (!to || !content?.trim()) return;
    try {
      const { lastID } = await run(
        'INSERT INTO messages (sender_id, receiver_id, content) VALUES (?,?,?)',
        [uid, to, content.trim()]
      );
      const msg = await get(
        'SELECT m.*, u.username, u.display_name, u.avatar FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.id=?',
        [lastID]
      );
      socket.emit('message:new', msg);
      const ts = onlineUsers.get(parseInt(to));
      if (ts) io.to(ts).emit('message:new', msg);
    } catch (e) { console.error('msg error', e); }
  });

  socket.on('disconnect', async () => {
    onlineUsers.delete(uid);
    await run("UPDATE users SET last_seen=strftime('%s','now') WHERE id=?", [uid]);
    socket.broadcast.emit('user:offline', uid);
  });
});

app.set('io', io);
app.set('onlineUsers', onlineUsers);

// ── Плановое удаление аккаунтов (каждый час) ─────────────────────────────────
setInterval(async () => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const due = await require('./db/index').all(
      'SELECT id FROM users WHERE deletion_scheduled_at IS NOT NULL AND deletion_scheduled_at <= ?', [now]
    );
    for (const u of due) {
      await run('DELETE FROM users WHERE id=?', [u.id]);
      console.log(`[deletion] User ${u.id} deleted.`);
    }
  } catch (e) { console.error('[deletion] error:', e.message); }
}, 60 * 60 * 1000);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`\n🚀 SocialNet: http://localhost:${PORT}\n`);
});
