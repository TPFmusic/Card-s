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

    // Создаём тестового пользователя (по желанию)
    db.get("SELECT * FROM users WHERE phone = '+79991234567'", (err, row) => {
        if (!row) {
            bcrypt.hash('admin123', 10, (err, hash) => {
                db.run("INSERT INTO users (phone, password, name) VALUES (?, ?, ?)", 
                    ['+79991234567', hash, 'Владислав']);
                console.log('✅ Тестовый пользователь создан: +79991234567 / admin123');
            });
        }
    });
});

// === Роуты ===
app.post('/api/register', async (req, res) => {
    const { phone, password, name } = req.body;
    try {
        const hash = await bcrypt.hash(password, 10);
        db.run("INSERT INTO users (phone, password, name) VALUES (?, ?, ?)", 
            [phone, hash, name], function(err) {
            if (err) return res.status(400).json({success: false, error: "Пользователь уже существует"});
            
            const token = jwt.sign({ id: this.lastID, phone }, JWT_SECRET, { expiresIn: '30d' });
            res.json({ success: true, token });
        });
    } catch (e) {
        res.status(500).json({success: false, error: "Ошибка сервера"});
    }
});

app.post('/api/login', async (req, res) => {
    const { phone, password } = req.body;
    db.get("SELECT * FROM users WHERE phone = ?", [phone], async (err, user) => {
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({success: false, error: "Неверный телефон или пароль"});
        }
        const token = jwt.sign({ id: user.id, phone: user.phone }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ success: true, token });
    });
});

app.get('/api/reviews', (req, res) => {
    db.all("SELECT r.*, u.name as user_name FROM reviews r LEFT JOIN users u ON r.user_id = u.id ORDER BY r.created_at DESC", (err, rows) => {
        res.json(rows || []);
    });
});

app.post('/api/reviews', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({success: false, error: "Не авторизован"});

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { rating, text } = req.body;

        db.run("INSERT INTO reviews (user_id, rating, text) VALUES (?, ?, ?)", 
            [decoded.id, rating, text], (err) => {
            if (err) return res.status(500).json({success: false});
            res.json({success: true});
        });
    } catch (e) {
        res.status(401).json({success: false});
    }
});

app.get('/api/me', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({success: false});

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        db.get('SELECT id, name, phone FROM users WHERE id = ?', [decoded.id], (err, user) => {
            res.json({ success: true, user });
        });
    } catch (e) {
        res.status(401).json({success: false});
    }
});

app.listen(PORT, () => {
    console.log(`✅ Сервер запущен: http://localhost:${PORT}`);
});
