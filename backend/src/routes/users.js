const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireOwner } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireOwner);

router.get('/', (req, res) => {
  const users = db.prepare('SELECT id, username, name, role, created_at FROM users ORDER BY created_at ASC').all();
  res.json({ users });
});

router.post('/', (req, res) => {
  const { name, username, password, role } = req.body || {};
  if (!name || !username || !password) return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว' });
  const user = {
    id: 'u' + Date.now(),
    username,
    password_hash: bcrypt.hashSync(password, 10),
    name,
    role: role === 'owner' ? 'owner' : 'staff',
    created_at: Date.now(),
  };
  db.prepare('INSERT INTO users (id, username, password_hash, name, role, created_at) VALUES (@id,@username,@password_hash,@name,@role,@created_at)').run(user);
  res.status(201).json({ user: { id: user.id, username: user.username, name: user.name, role: user.role } });
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  const { name, username, password, role } = req.body || {};
  const updated = {
    id: existing.id,
    name: name || existing.name,
    username: username || existing.username,
    role: role === 'owner' ? 'owner' : role === 'staff' ? 'staff' : existing.role,
    password_hash: password ? bcrypt.hashSync(password, 10) : existing.password_hash,
  };
  db.prepare('UPDATE users SET name=@name, username=@username, role=@role, password_hash=@password_hash WHERE id=@id').run(updated);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  res.json({ ok: true });
});

module.exports = router;
