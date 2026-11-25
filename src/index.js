require('dotenv').config();

const path = require('path');
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const authRouter = require('./routes/auth');
const kbRouter = require('./routes/kb');
const { requireAuth } = require('./middleware/auth');
const { healthCheck } = require('./db');

const app = express();
const port = Number(process.env.PORT || 3000);
const openapiPath = path.join(__dirname, '..', 'docs', 'openapi.yaml');

if (!process.env.JWT_SECRET) {
  console.warn('[auth] missing env JWT_SECRET');
}
if (!process.env.AUTH_USERNAME || !process.env.AUTH_PASSWORD) {
  console.warn('[auth] missing env AUTH_USERNAME and/or AUTH_PASSWORD');
}

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

app.get('/api/docs/openapi.yaml', (_req, res) => {
  res.type('application/yaml').sendFile(openapiPath);
});

app.use(
  '/api/docs',
  swaggerUi.serve,
  swaggerUi.setup(null, {
    swaggerOptions: { url: '/api/docs/openapi.yaml' },
    customSiteTitle: 'Yan KB API docs',
  })
);

app.use('/api/auth', authRouter);
app.use('/api/kb', requireAuth, kbRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(port, () => {
  console.log(`vc-yankb listening on :${port}`);
});
