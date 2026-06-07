const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'kartы-vyg0dn0-secret-key-2026';

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

const db = new sqlite3.Database('./db.sqlite');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        phone TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT,
        is_admin INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY,
        user_id INTEGER,
        name TEXT,
        rating INTEGER,
        text TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // Создаём админа по умолчанию (логин: +79991234567, пароль: admin123)
    db.get("SELECT * FROM users WHERE phone = '+79991234567'", (err, row) => {
        if (!row) {
            bcrypt.hash('admin123', 10, (err, hash) => {
                db.run("INSERT INTO users (phone, password, name, is_admin) VALUES (?, ?, ?, 1)", 
                    ['+79991234567', hash, 'Владислав']);
                console.log('✅ Админ создан: +79991234567 / admin123');
            });
        }
    });
});

// === ТВОИ СТАРЫЕ РОУТЫ (register, login, reviews) ===
app.post('/api/register', async (req, res) => { /* ... твой код ... */ });
app.post('/api/login', async (req, res) => { /* ... твой код ... */ });
app.get('/api/reviews', (req, res) => { /* ... */ });
app.post('/api/reviews', (req, res) => { /* ... */ });

// Новый роут для проверки текущего пользователя
app.get('/api/me', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({success: false});

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        db.get('SELECT id, name, phone, is_admin FROM users WHERE id = ?', [decoded.id], (err, user) => {
            res.json({ success: true, user });
        });
    } catch (e) {
        res.status(401).json({success: false});
    }
});

// ==================== ADMIN API ====================

const adminMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({error: "Нет токена"});

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!decoded.is_admin) return res.status(403).json({error: "Нет прав администратора"});
        req.user = decoded;
        next();
    } catch (e) {
        res.status(401).json({error: "Неверный токен"});
    }
};

app.get('/api/admin/users', adminMiddleware, (req, res) => {
    db.all('SELECT id, name, phone, created_at FROM users ORDER BY id DESC', (err, rows) => {
        res.json(rows);
    });
});

app.delete('/api/admin/users/:id', adminMiddleware, (req, res) => {
    db.run('DELETE FROM users WHERE id = ?', [req.params.id], () => {
        res.json({success: true});
    });
});

app.get('/api/admin/reviews', adminMiddleware, (req, res) => {
    db.all(`
        SELECT r.*, u.name as user_name 
        FROM reviews r 
        LEFT JOIN users u ON r.user_id = u.id 
        ORDER BY r.id DESC
    `, (err, rows) => res.json(rows));
});

app.delete('/api/admin/reviews/:id', adminMiddleware, (req, res) => {
    db.run('DELETE FROM reviews WHERE id = ?', [req.params.id], () => {
        res.json({success: true});
    });
});

app.listen(PORT, () => {
    console.log(`✅ Сервер запущен: http://localhost:${PORT}`);
});