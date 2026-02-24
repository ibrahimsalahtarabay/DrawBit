const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'drawbit_dev_secret_change_in_production';

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  // Also accept ?token= query param for PDF download links opened in new tab
  const raw = (header && header.startsWith('Bearer '))
    ? header.slice(7)
    : (req.query.token || null);

  if (!raw) return res.status(401).json({ error: 'No token provided' });

  try {
    req.user = jwt.verify(raw, SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { authenticate, requireAdmin, SECRET };