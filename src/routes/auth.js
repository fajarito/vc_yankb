const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../middleware/auth');

const router = express.Router();

function getExpiresIn() {
  return process.env.JWT_EXPIRES_IN || '8h';
}

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

function credentialsMatch(username, password) {
  const expectedUser = process.env.AUTH_USERNAME;
  const expectedPass = process.env.AUTH_PASSWORD;
  if (!expectedUser || !expectedPass) {
    return false;
  }
  const userOk = safeEqual(username, expectedUser);
  const passOk = safeEqual(password, expectedPass);
  return userOk && passOk;
}

router.post('/login', (req, res) => {
  const username = req.body?.username;
  const password = req.body?.password;

  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const secret = getJwtSecret();
  if (!secret) {
    console.error('[auth] JWT_SECRET is not configured');
    return res.status(500).json({ error: 'Auth is not configured' });
  }

  if (!process.env.AUTH_USERNAME || !process.env.AUTH_PASSWORD) {
    console.error('[auth] AUTH_USERNAME / AUTH_PASSWORD are not configured');
    return res.status(500).json({ error: 'Auth is not configured' });
  }

  if (!credentialsMatch(username, password)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const expiresIn = getExpiresIn();
  const accessToken = jwt.sign(
    { sub: username, username },
    secret,
    { algorithm: 'HS256', expiresIn }
  );

  return res.json({ accessToken, expiresIn });
});

module.exports = router;
