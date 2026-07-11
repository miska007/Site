const store = new Map();

// cleanup старых записей каждые 5 мин
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store) if (now > v.resetAt) store.delete(k);
}, 300_000);

/**
 * rateLimit(action, max, windowMs)
 * action  — уникальный ключ ('login', 'register', ...)
 * max     — макс. запросов за окно
 * windowMs — размер окна в мс
 */
const rateLimit = (action, max, windowMs) => (req, res, next) => {
  const ip = (req.headers['x-forwarded-for'] || req.ip || 'unknown').split(',')[0].trim();
  const key = `${ip}:${action}`;
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }
  if (entry.count >= max) {
    const retry = Math.ceil((entry.resetAt - now) / 1000);
    res.set('Retry-After', String(retry));
    return res.status(429).json({ error: `Слишком много попыток. Подождите ${retry} с.` });
  }
  entry.count++;
  next();
};

module.exports = rateLimit;
