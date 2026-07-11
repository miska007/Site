const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { run, get } = require('../db/index');
const rateLimit = require('../middleware/rateLimit');

const sign = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });

// 10 попыток за 15 мин на IP
router.post('/login', rateLimit('login', 10, 15 * 60_000), async (req, res) => {
  try {
    const { login, password } = req.body;
    if (!login || !password) return res.status(400).json({ error: 'Введи логин и пароль' });

    const user = await get(
      'SELECT * FROM users WHERE username=? OR email=?',
      [login.toLowerCase(), login.toLowerCase()]
    );
    // одинаковая задержка независимо от того, найден ли юзер (против timing attack)
    const ok = user ? await bcrypt.compare(password, user.password) : await bcrypt.compare(password, '$2a$10$fakehashforfaketiming00000000000000000000000000000');
    if (!user || !ok) return res.status(401).json({ error: 'Неверный логин или пароль' });

    await run("UPDATE users SET last_seen=strftime('%s','now') WHERE id=?", [user.id]);
    const { password: _, ...safe } = user;
    res.json({ token: sign(user.id), user: safe });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка сервера' }); }
});

// 5 регистраций за 1 час с одного IP
router.post('/register', rateLimit('register', 5, 60 * 60_000), async (req, res) => {
  try {
    const { username, email, password, display_name } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ error: 'Заполни все поля' });
    if (username.length < 3 || username.length > 32)
      return res.status(400).json({ error: 'Имя пользователя: 3–32 символа' });
    if (!/^[a-zA-Z0-9_]+$/.test(username))
      return res.status(400).json({ error: 'Имя: только латиница, цифры и _' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Пароль: минимум 6 символов' });

    const existing = await get('SELECT id FROM users WHERE username=? OR email=?', [username, email]);
    if (existing) return res.status(409).json({ error: 'Логин или email уже занят' });

    const hash = await bcrypt.hash(password, 10);
    const dname = display_name?.trim() || username;
    const { lastID } = await run(
      'INSERT INTO users (username, email, password, display_name) VALUES (?,?,?,?)',
      [username.toLowerCase(), email.toLowerCase(), hash, dname]
    );
    res.status(201).json({ token: sign(lastID), user: { id: lastID, username, display_name: dname } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка сервера' }); }
});

module.exports = router;
