const bcrypt = require('./node_modules/bcryptjs');
const sqlite3 = require('./node_modules/sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'db', 'socialnet.db'));
const hash = bcrypt.hashSync('admin123', 10);

db.serialize(() => {
  // Create or update admin user
  db.run(
    `INSERT INTO users (username, email, password, display_name, is_admin)
     VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(username) DO UPDATE SET is_admin=1, password=excluded.password`,
    ['admin', 'admin@local.ru', hash, 'Admin'],
    function(err) {
      if (err) { console.error('ERROR:', err.message); process.exit(1); }
      console.log('OK: admin создан/обновлён, пароль: admin123');
      db.close();
    }
  );
});
