const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../models/db');

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, name, student_id, grade, password } = req.body;

  if (!email.endsWith('@kentech.ac.kr')) {
    return res.status(400).json({ error: '@kentech.ac.kr 이메일만 허용됩니다.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.query(
      'INSERT INTO users (email, name, student_id, grade, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, name, role',
      [email, name, student_id, grade, hashedPassword]
    );
    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Register Error:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: '이미 가입된 이메일입니다.' });
    }
    res.status(500).json({ error: '서버 오류' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email.endsWith('@kentech.ac.kr')) {
    return res.status(400).json({ error: '@kentech.ac.kr 이메일만 허용됩니다.' });
  }

  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rowCount === 0) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, grade: user.grade, role: user.role } });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ error: '서버 오류' });
  }
});

module.exports = router;
