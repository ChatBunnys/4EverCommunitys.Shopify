const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const tmpStore = path.join(__dirname, 'tmp-store.json');
process.env.DATA_FILE = tmpStore;
process.env.SESSION_TTL_MS = '50';

const { startServer } = require('../server');

let server;
let baseUrl;
let ageCookie = '';
let authToken = '';

function resetStore() {
  fs.writeFileSync(tmpStore, JSON.stringify({ users: [], subscriptions: [], purchases: [], auditEvents: [] }, null, 2));
  fs.writeFileSync(tmpStore, JSON.stringify({ users: [], subscriptions: [], purchases: [] }, null, 2));
}

async function jfetch(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

test.before(async () => {
  resetStore();
  server = startServer(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
  if (fs.existsSync(tmpStore)) fs.unlinkSync(tmpStore);
});

test('age verify + register + login + me works', async () => {
  resetStore();

  const age = await jfetch(`${baseUrl}/api/age-verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isAdult: true })
  });

  assert.equal(age.response.status, 200);
  ageCookie = age.response.headers.get('set-cookie').split(';')[0];

  const register = await jfetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: ageCookie },
    body: JSON.stringify({ email: 'test@example.com', password: 'password123' })
  });

  assert.equal(register.response.status, 201);

  const login = await jfetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: ageCookie },
    body: JSON.stringify({ email: 'test@example.com', password: 'password123' })
  });

  assert.equal(login.response.status, 200);
  authToken = login.data.token;

  const me = await jfetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: ageCookie, Authorization: `Bearer ${authToken}` }
  });

  assert.equal(me.response.status, 200);
  assert.equal(me.data.email, 'test@example.com');
});

test('subscription and playback entitlement checks work', async () => {
  const denied = await jfetch(`${baseUrl}/api/streams/s1/playback`, {
    headers: { Cookie: ageCookie, Authorization: `Bearer ${authToken}` }
  });
  assert.equal(denied.response.status, 403);

  const activate = await jfetch(`${baseUrl}/api/subscriptions/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: ageCookie, Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ planId: 'basic' })
  });
  assert.equal(activate.response.status, 200);

  const allowed = await jfetch(`${baseUrl}/api/streams/s1/playback`, {
    headers: { Cookie: ageCookie, Authorization: `Bearer ${authToken}` }
  });
  assert.equal(allowed.response.status, 200);
  assert.equal(allowed.data.id, 's1');
});

test('session expiry is enforced', async () => {
  await new Promise((r) => setTimeout(r, 70));

  const meExpired = await jfetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: ageCookie, Authorization: `Bearer ${authToken}` }
  });

  assert.equal(meExpired.response.status, 401);
  assert.equal(meExpired.data.error, 'Session expired.');
});


test('audit log endpoint returns user events', async () => {
  const eventsRes = await jfetch(`${baseUrl}/api/audit/me`, {
    headers: { Cookie: ageCookie, Authorization: `Bearer ${authToken}` }
  });

  assert.equal(eventsRes.response.status, 200);
  assert.equal(Array.isArray(eventsRes.data), true);
});
