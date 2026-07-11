const auth = require('./auth');

// Must be used AFTER auth middleware
module.exports = [
  auth,
  (req, res, next) => {
    if (!req.user.is_admin) return res.status(403).json({ error: 'Доступ запрещён' });
    next();
  }
];
