// Security headers — подключается первым в server.js
module.exports = (req, res, next) => {
  res.set({
    'X-Frame-Options':           'DENY',
    'X-Content-Type-Options':    'nosniff',
    'X-XSS-Protection':          '1; mode=block',
    'Referrer-Policy':            'strict-origin-when-cross-origin',
    'Permissions-Policy':         'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy':
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline'; " +   // inline onclick нужны для SPA
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: blob:; " +
      "media-src 'self' blob:; " +
      "connect-src 'self' ws: wss:; " +
      "frame-ancestors 'none';",
  });
  // API — не кешировать
  if (req.path.startsWith('/api')) {
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
  }
  next();
};
