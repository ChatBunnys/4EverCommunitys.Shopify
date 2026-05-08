const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const AGE_COOKIE_NAME = 'age_verified';
const AGE_COOKIE_VALUE = 'yes';
const COOKIE_SECRET = process.env.COOKIE_SECRET || 'dev_secret_change_me';
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 1000 * 60 * 60 * 24);
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'store.json');

const defaultStreams = [
  { id: 's1', title: 'Late Night Live Session', category: 'Live Show', isLive: true, thumbnail: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200', playbackUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', viewers: 1245, requiresSubscription: true, ppvPriceUsd: null },
  { id: 's2', title: 'Premium Private Stream', category: 'Premium', isLive: true, thumbnail: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1200', playbackUrl: 'https://test-streams.mux.dev/test_001/stream.m3u8', viewers: 689, requiresSubscription: false, ppvPriceUsd: 14.99 },
  { id: 's3', title: 'Weekend Replay', category: 'Replay', isLive: false, thumbnail: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=1200', playbackUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', viewers: 0, requiresSubscription: false, ppvPriceUsd: null }
];

const subscriptionPlans = [
  { id: 'basic', name: 'Basic Monthly', priceUsd: 19.99, interval: 'month' },
  { id: 'vip', name: 'VIP Monthly', priceUsd: 39.99, interval: 'month' }
];

function ensureDataFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({ users: [], subscriptions: [], purchases: [] }, null, 2));
  }
}

function readState(filePath) {
  ensureDataFile(filePath);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeState(filePath, state) {
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return header.split(';').reduce((acc, item) => {
    if (!item.trim()) return acc;
    const [key, ...rest] = item.split('=');
    acc[key.trim()] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
}

function getAgeCookieSignature(value) {
  return crypto.createHmac('sha256', COOKIE_SECRET).update(value).digest('hex');
}

function hasValidAgeCookie(req) {
  const cookies = parseCookies(req);
  const signedValue = cookies[AGE_COOKIE_NAME];
  if (!signedValue || !signedValue.includes('.')) return false;
  const [value, signature] = signedValue.split('.');
  return value === AGE_COOKIE_VALUE && signature === getAgeCookieSignature(value);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, expectedHash] = String(storedHash || '').split(':');
  if (!salt || !expectedHash) return false;
  const computed = crypto.pbkdf2Sync(password, salt, 120000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(expectedHash, 'hex'));
}

function createApp() {
  const app = express();
  const sessions = new Map();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  function requireAgeVerification(req, res, next) {
    if (!hasValidAgeCookie(req)) return res.status(403).json({ error: 'Age verification required (18+).' });
    return next();
  }

  function requireAuth(req, res, next) {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const session = token ? sessions.get(token) : null;

    if (!session) return res.status(401).json({ error: 'Authentication required.' });
    if (session.expiresAt < Date.now()) {
      sessions.delete(token);
      return res.status(401).json({ error: 'Session expired.' });
    }

    const state = readState(DATA_FILE);
    const user = state.users.find((u) => u.id === session.userId);
    if (!user) return res.status(401).json({ error: 'Invalid session.' });

    req.user = user;
    req.token = token;
    return next();
  }

  function hasActiveSubscription(userId) {
    const state = readState(DATA_FILE);
    return state.subscriptions.some((sub) => sub.userId === userId && sub.status === 'active');
  }

  function hasPpvAccess(userId, streamId) {
    const state = readState(DATA_FILE);
    return state.purchases.some((purchase) => purchase.userId === userId && purchase.streamId === streamId && purchase.status === 'paid');
  }

  app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

  app.get('/api/config', (_, res) => {
    res.json({
      preferredStack: 'Express backend + Vanilla JS frontend (MVP starter)',
      monetizationModel: 'Hybrid Subscription + PPV',
      targetRegion: 'United States (baseline compliance assumptions)',
      mvpFeatures: ['Server-verified age gate (18+)', 'User auth and sessions', 'Entitlement-checked playback', 'Subscription + PPV purchase flows', 'Persisted state to JSON storage']
    });
  });

  app.post('/api/age-verify', (req, res) => {
    if (req.body?.isAdult !== true) return res.status(400).json({ error: 'User must explicitly confirm age >= 18.' });
    const cookieValue = `${AGE_COOKIE_VALUE}.${getAgeCookieSignature(AGE_COOKIE_VALUE)}`;
    res.setHeader('Set-Cookie', `${AGE_COOKIE_NAME}=${cookieValue}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax`);
    return res.json({ verified: true });
  });

  app.post('/api/auth/register', requireAgeVerification, (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password || password.length < 8) return res.status(400).json({ error: 'Email and password (8+ chars) are required.' });

    const state = readState(DATA_FILE);
    const exists = state.users.some((u) => u.email.toLowerCase() === String(email).toLowerCase());
    if (exists) return res.status(409).json({ error: 'Email already registered.' });

    const user = { id: `u_${crypto.randomUUID()}`, email: String(email).toLowerCase(), passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
    state.users.push(user);
    writeState(DATA_FILE, state);
    return res.status(201).json({ id: user.id, email: user.email });
  });

  app.post('/api/auth/login', requireAgeVerification, (req, res) => {
    const { email, password } = req.body || {};
    const state = readState(DATA_FILE);
    const user = state.users.find((u) => u.email === String(email).toLowerCase());

    if (!user || !verifyPassword(String(password || ''), user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, { userId: user.id, expiresAt: Date.now() + SESSION_TTL_MS });
    return res.json({ token, user: { id: user.id, email: user.email } });
  });

  app.post('/api/auth/logout', requireAuth, (req, res) => {
    sessions.delete(req.token);
    res.json({ success: true });
  });

  app.get('/api/auth/me', requireAgeVerification, requireAuth, (req, res) => {
    res.json({ id: req.user.id, email: req.user.email, subscriptionActive: hasActiveSubscription(req.user.id) });
  });

  app.get('/api/subscription-plans', requireAgeVerification, requireAuth, (_, res) => res.json(subscriptionPlans));

  app.post('/api/subscriptions/activate', requireAgeVerification, requireAuth, (req, res) => {
    const { planId } = req.body || {};
    const plan = subscriptionPlans.find((item) => item.id === planId);
    if (!plan) return res.status(404).json({ error: 'Plan not found.' });

    const state = readState(DATA_FILE);
    state.subscriptions.forEach((sub) => {
      if (sub.userId === req.user.id) sub.status = 'inactive';
    });

    state.subscriptions.push({ id: `sub_${crypto.randomUUID()}`, userId: req.user.id, planId: plan.id, status: 'active', startedAt: new Date().toISOString() });
    writeState(DATA_FILE, state);

    return res.json({ status: 'active', plan });
  });

  app.get('/api/streams', requireAgeVerification, requireAuth, (_, res) => {
    const publicStreams = defaultStreams.map(({ playbackUrl, ...rest }) => rest);
    res.json(publicStreams);
  });

  app.post('/api/purchase-ppv', requireAgeVerification, requireAuth, (req, res) => {
    const { streamId } = req.body || {};
    const stream = defaultStreams.find((item) => item.id === streamId);
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    if (!stream.ppvPriceUsd) return res.status(400).json({ error: 'This stream is not PPV content.' });

    const state = readState(DATA_FILE);
    state.purchases.push({ id: `ppv_${crypto.randomUUID()}`, userId: req.user.id, streamId, status: 'paid', amountUsd: stream.ppvPriceUsd, paidAt: new Date().toISOString() });
    writeState(DATA_FILE, state);

    return res.json({ status: 'paid', amountUsd: stream.ppvPriceUsd, message: 'PPV purchase completed (mock).' });
  });

  app.get('/api/streams/:id/playback', requireAgeVerification, requireAuth, (req, res) => {
    const stream = defaultStreams.find((item) => item.id === req.params.id);
    if (!stream) return res.status(404).json({ error: 'Stream not found' });

    const entitled = !stream.requiresSubscription || hasActiveSubscription(req.user.id) || hasPpvAccess(req.user.id, stream.id);
    if (!entitled) return res.status(403).json({ error: 'Access denied. Active subscription or PPV purchase required.' });

    return res.json({ id: stream.id, title: stream.title, playbackUrl: stream.playbackUrl });
  });

  app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

  return app;
}

function startServer(port = process.env.PORT || 3000) {
  const app = createApp();
  return app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { createApp, startServer, hashPassword, verifyPassword };
