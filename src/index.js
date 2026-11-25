require('dotenv').config();

const express = require('express');
const kbRouter = require('./routes/kb');
const { healthCheck } = require('./db');

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json());

app.get('/health', async (_req, res) => {
  try {
    await healthCheck();
    return res.json({ status: 'ok', db: 'up' });
  } catch (err) {
    console.error('[health]', err.message);
    return res.status(503).json({ status: 'degraded', db: 'down' });
  }
});

app.use('/api/kb', kbRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(port, () => {
  console.log(`vc-yankb listening on :${port}`);
});
