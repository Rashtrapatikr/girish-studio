const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'studio.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error opening database " + err.message);
  } else {
    console.log("Connected to the SQLite database.");
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'customer'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      date TEXT NOT NULL,
      service TEXT NOT NULL,
      message TEXT,
      status TEXT DEFAULT 'Pending',
      admin_reply TEXT,
      payment_status TEXT DEFAULT 'Pending',
      payment_id TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS gallery_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      filename TEXT NOT NULL,
      type TEXT DEFAULT 'image',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Create a default admin user if it doesn't exist
    const bcrypt = require('bcrypt');
    db.get("SELECT * FROM users WHERE email = 'admin@girishstudio.com'", (err, row) => {
      if (!row) {
        bcrypt.hash('rash@123', 10, (err, hash) => {
          db.run("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)",
            ['Admin', 'admin@girishstudio.com', hash, 'admin']);
        });
      }
    });
  }
});

module.exports = db;
