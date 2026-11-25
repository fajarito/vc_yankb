const crypto = require('crypto');

function safeEqual(a, b) {
  const left = Buffer.from(String(a ?? ''), 'utf8');
  const right = Buffer.from(String(b ?? ''), 'utf8');
  if (left.length !== right.length) {
    // Consume comparable work so length mismatch is not a free early return.
    crypto.timingSafeEqual(left, left);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function requireAuth(req, res, next) {
  const expected = process.env.API_KEY;
  if (!expected) {
    console.error('[auth] API_KEY is not configured');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const provided = req.headers['x-api-key'];
  if (typeof provided !== 'string' || !provided) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!safeEqual(provided, expected)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return next();
}

module.exports = { requireAuth };
