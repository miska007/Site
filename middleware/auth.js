const jwt = require('jsonwebtoken');
const { get } = require('../db/index');

module.exports = async (req, res, next) => {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Нет токена авторизации' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await get(
      'SELECT id, username, email, display_name, avatar, bio, is_admin FROM users WHERE id = ?',
      [payload.id]
    );
    if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Токен недействителен' });
  }
};
