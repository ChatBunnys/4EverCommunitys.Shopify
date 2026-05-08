const ageGate = document.getElementById('ageGate');
const enterBtn = document.getElementById('enterBtn');
const exitBtn = document.getElementById('exitBtn');
const gateError = document.getElementById('gateError');
const streamList = document.getElementById('streamList');
const playerTitle = document.getElementById('playerTitle');
const videoPlayer = document.getElementById('videoPlayer');
const plansNode = document.getElementById('plans');
const assumptionsNode = document.getElementById('assumptions');
const accountPanel = document.getElementById('accountPanel');

let authToken = localStorage.getItem('authToken');

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `Request failed: ${response.status}`);
  return data;
}

function renderAuthForm() {
  accountPanel.innerHTML = `
    <div class="auth-grid">
      <input id="email" placeholder="Email" />
      <input id="password" type="password" placeholder="Password (8+ chars)" />
      <button id="registerBtn" class="btn">Register</button>
      <button id="loginBtn" class="btn primary">Login</button>
      <p id="authMsg" class="meta"></p>
    </div>
  `;

  const authMsg = document.getElementById('authMsg');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  document.getElementById('registerBtn').addEventListener('click', async () => {
    try {
      await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: emailInput.value, password: passwordInput.value }) });
      authMsg.textContent = 'Registered. You can now login.';
    } catch (error) {
      authMsg.textContent = error.message;
    }
  });

  document.getElementById('loginBtn').addEventListener('click', async () => {
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: emailInput.value, password: passwordInput.value }) });
      authToken = data.token;
      localStorage.setItem('authToken', authToken);
      await bootstrapData();
    } catch (error) {
      authMsg.textContent = error.message;
    }
  });
}

function renderAccount(user) {
  accountPanel.innerHTML = `
    <p><strong>${user.email}</strong></p>
    <p class="meta">Subscription: ${user.subscriptionActive ? 'Active' : 'Inactive'}</p>
    <button id="logoutBtn" class="btn">Logout</button>
  `;
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    authToken = null;
    localStorage.removeItem('authToken');
    streamList.innerHTML = '';
    plansNode.innerHTML = '';
    playerTitle.textContent = 'Select a stream';
    videoPlayer.removeAttribute('src');
    renderAuthForm();
  });
}

async function verifyGateStatus() {
  try {
    await api('/api/health');
    return true;
  } catch (_err) {
    return false;
  }
}

enterBtn.addEventListener('click', async () => {
  gateError.textContent = '';
  try {
    await api('/api/age-verify', { method: 'POST', body: JSON.stringify({ isAdult: true }) });
    ageGate.classList.remove('active');
    await bootstrapData();
  } catch (error) {
    gateError.textContent = error.message;
  }
});

exitBtn.addEventListener('click', () => {
  window.location.href = 'https://www.google.com';
});

async function playStream(id) {
  try {
    const data = await api(`/api/streams/${id}/playback`);
    playerTitle.textContent = data.title;
    videoPlayer.src = data.playbackUrl;
    videoPlayer.play().catch(() => {});
  } catch (error) {
    window.alert(error.message);
  }
}

async function purchasePPV(id) {
  try {
    const result = await api('/api/purchase-ppv', { method: 'POST', body: JSON.stringify({ streamId: id }) });
    window.alert(`${result.message} ($${result.amountUsd})`);
  } catch (error) {
    window.alert(error.message);
  }
}

async function subscribe(planId) {
  try {
    await api('/api/subscriptions/activate', { method: 'POST', body: JSON.stringify({ planId }) });
    const me = await api('/api/auth/me');
    renderAccount(me);
    window.alert('Subscription activated.');
  } catch (error) {
    window.alert(error.message);
  }
}

function streamCard(stream) {
  const card = document.createElement('article');
  card.className = 'card';
  const accessLabel = stream.requiresSubscription ? 'Subscribers only' : stream.ppvPriceUsd ? `PPV $${stream.ppvPriceUsd}` : 'Free';
  card.innerHTML = `
    <img src="${stream.thumbnail}" alt="${stream.title}" />
    <div class="card-content">
      <h3>${stream.title}</h3>
      <div class="meta">${stream.isLive ? '<span class="live-badge">LIVE</span>' : ''}<span>${stream.category}</span></div>
      <p class="meta" style="margin-top:6px">${stream.viewers.toLocaleString()} viewers</p>
      <p class="meta" style="margin-top:6px">Access: ${accessLabel}</p>
      <button class="btn primary watch-btn" style="margin-top:8px">Watch Stream</button>
      ${stream.ppvPriceUsd ? '<button class="btn buy-btn" style="margin-top:8px">Buy PPV</button>' : ''}
    </div>
  `;

  card.querySelector('.watch-btn').addEventListener('click', () => playStream(stream.id));
  const buyBtn = card.querySelector('.buy-btn');
  if (buyBtn) buyBtn.addEventListener('click', () => purchasePPV(stream.id));
  return card;
}

async function renderPlans() {
  const plans = await api('/api/subscription-plans');
  plansNode.innerHTML = plans.map((plan) => `<div class="plan-item"><span>${plan.name}</span><span><strong>$${plan.priceUsd}/${plan.interval}</strong> <button class="btn plan-btn" data-id="${plan.id}">Choose</button></span></div>`).join('');
  plansNode.querySelectorAll('.plan-btn').forEach((btn) => btn.addEventListener('click', () => subscribe(btn.dataset.id)));
}

async function renderAssumptions() {
  const config = await api('/api/config');
  assumptionsNode.innerHTML = `<div><strong>Stack:</strong> ${config.preferredStack}</div><div><strong>Monetization:</strong> ${config.monetizationModel}</div><div><strong>Region:</strong> ${config.targetRegion}</div>`;
}

async function bootstrapData() {
  await renderAssumptions();
  try {
    const me = await api('/api/auth/me');
    renderAccount(me);
  } catch (_err) {
    renderAuthForm();
    streamList.innerHTML = '';
    plansNode.innerHTML = '<p class="meta">Log in to view plans.</p>';
    return;
  }

  const streams = await api('/api/streams');
  streamList.innerHTML = '';
  streams.forEach((stream) => streamList.appendChild(streamCard(stream)));
  await renderPlans();
}

(async () => {
  await renderAssumptions();
  const healthOk = await verifyGateStatus();
  if (!healthOk) return;

  try {
    await api('/api/streams');
    ageGate.classList.remove('active');
    await bootstrapData();
  } catch (_err) {
    ageGate.classList.add('active');
  }
})();
