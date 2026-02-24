const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool   = require('../db/pool');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.use(authenticate, requireAdmin);

// GET /api/clients
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, full_name, email, created_at
       FROM users WHERE role = 'client' ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('[clients/GET]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/clients/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, full_name, email, created_at
       FROM users WHERE id = $1 AND role = 'client'`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Client not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[clients/GET/:id]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/clients
router.post('/', async (req, res) => {
  const { username, password, full_name, email } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (username, password_hash, role, full_name, email)
       VALUES ($1, $2, 'client', $3, $4)
       RETURNING id, username, full_name, email, created_at`,
      [username.trim().toLowerCase(), hash, full_name || null, email || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already exists' });
    console.error('[clients/POST]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/clients/:id
router.put('/:id', async (req, res) => {
  const { full_name, email, password } = req.body;
  try {
    let hash = null;
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
      hash = await bcrypt.hash(password, 12);
    }
    const { rows } = await pool.query(
      `UPDATE users SET
        full_name     = COALESCE($1, full_name),
        email         = COALESCE($2, email),
        password_hash = COALESCE($3, password_hash)
       WHERE id = $4 AND role = 'client'
       RETURNING id, username, full_name, email, created_at`,
      [full_name || null, email || null, hash, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Client not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[clients/PUT]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/clients/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM users WHERE id = $1 AND role = 'client'`, [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Client not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[clients/DELETE]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/clients/me/password — admin changes own password
router.put('/me/password', async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [hash, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[clients/me/password]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
