// public/scripts.js - client-side signup + Lichess integration (uses server proxy at /api/...)
const STORAGE_USERS = 'nti_users_v1';
const STORAGE_TOKEN = 'nti_lichess_token_v1';

const usernameInput = document.getElementById('username-input');
const signupForm = document.getElementById('signup-form');
const leaderboardEntries = document.getElementById('leaderboard-entries');
const podiumEl = document.getElementById('podium');
const tokenInput = document.getElementById('token-input');
const saveTokenBtn = document.getElementById('save-token');
const refreshBtn = document.getElementById('refresh-btn');

let users = new Set();
let token = localStorage.getItem(STORAGE_TOKEN) || '';
if (token) tokenInput.value = token;

function persistUsers() {
  localStorage.setItem(STORAGE_USERS, JSON.stringify([...users]));
}
function loadUsers() {
  try {
    const arr = JSON.parse(localStorage.getItem(STORAGE_USERS) || '[]');
    users = new Set(arr.map(u => u.toLowerCase()));
  } catch (e) {
    users = new Set();
  }
}

signupForm.addEventListener('submit', e => {
  e.preventDefault();
  const name = usernameInput.value.trim();
  if (!name) return;
  users.add(name.toLowerCase());
  persistUsers();
  usernameInput.value = '';
  refreshData();
});

saveTokenBtn.addEventListener('click', () => {
  token = tokenInput.value.trim();
  if (token) localStorage.setItem(STORAGE_TOKEN, token);
  else localStorage.removeItem(STORAGE_TOKEN);
  alert(token ? 'Token saved locally.' : 'Token cleared.');
});

refreshBtn.addEventListener('click', () => refreshData());

// Fetch recent games for a username via server proxy to avoid CORS issues
async function fetchGamesForUser(username, max = 50) {
  const url = `/api/games/user/${encodeURIComponent(username)}?max=${max}&opening=true&moves=false`;
  const headers = { Accept: 'application/x-ndjson' };
  if (token) headers['x-token'] = token; // server proxy will translate
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.warn('Proxy fetch failed for', username, res.status);
      return [];
    }
    const text = await res.text();
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const out = [];
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        const white = (obj.players && obj.players.white && obj.players.white.user && obj.players.white.user.name) || (obj.players && obj.players.white && obj.players.white.userId) || obj.white || null;
        const black = (obj.players && obj.players.black && obj.players.black.user && obj.players.black.user.name) || (obj.players && obj.players.black && obj.players.black.userId) || obj.black || null;
        const result = obj.status || obj.winner || obj.result || (obj.pgn && (obj.pgn.includes('1-0') ? '1-0' : (obj.pgn.includes('0-1') ? '0-1' : '1/2-1/2')));
        const date = obj.createdAt || obj.time || null;
        out.push({ white, black, result, date, raw: obj });
      } catch (err) {
        const headers = {};
        const rx = /\[([^\s]+)\s+"([^"]*)"\]/g;
        let m;
        while ((m = rx.exec(line))) headers[m[1]] = m[2];
        if (Object.keys(headers).length) {
          out.push({
            white: headers.White || headers.white || null,
            black: headers.Black || headers.black || null,
            result: headers.Result || headers.result || null,
            date: headers.Date || headers.date || null,
            raw: headers
          });
        }
      }
    }
    return out;
  } catch (e) {
    console.error('Error fetching games for', username, e);
    return [];
  }
}

function winnerFromResult(result) {
  if (!result) return null;
  if (result.includes('1-0')) return 'white';
  if (result.includes('0-1')) return 'black';
  if (result.includes('1/2') || result.includes('1⁄2')) return 'draw';
  return null;
}

async function refreshData() {
  loadUsers();
  const userArray = [...users];
  if (userArray.length === 0) {
    renderEmpty();
    return;
  }

  const stats = {};
  for (const u of userArray) stats[u] = { name: u, games: 0, wins: 0, losses: 0, draws: 0, lastGame: null };

  const fetchPromises = userArray.map(u => fetchGamesForUser(u, 50).then(g => ({ user: u, games: g })));
  const results = await Promise.all(fetchPromises);

  const seenGames = new Set();

  for (const r of results) {
    const owner = r.user;
    for (const g of r.games) {
      const whiteRaw = (g.white || '').toString();
      const blackRaw = (g.black || '').toString();
      const white = whiteRaw.toLowerCase();
      const black = blackRaw.toLowerCase();
      if (!users.has(white) || !users.has(black)) continue;

      let gameId = null;
      if (g.raw && g.raw.id) gameId = g.raw.id;
      else if (g.raw && g.raw.gameId) gameId = g.raw.gameId;
      else if (g.raw && g.raw.url) gameId = g.raw.url;
      else gameId = [white, black, g.result || '', g.date || ''].join('|');
      if (seenGames.has(gameId)) continue;
      seenGames.add(gameId);

      const res = g.result || (g.raw && g.raw.status) || null;
      const win = winnerFromResult(res);

      stats[white].games += 1;
      stats[black].games += 1;
      const dateVal = g.date || (g.raw && g.raw.createdAt) || null;
      if (dateVal) {
        const d = typeof dateVal === 'number' ? new Date(dateVal) : new Date(dateVal.toString());
        if (!isNaN(d)) {
          if (!stats[white].lastGame || d > new Date(stats[white].lastGame)) stats[white].lastGame = d.toISOString();
          if (!stats[black].lastGame || d > new Date(stats[black].lastGame)) stats[black].lastGame = d.toISOString();
        }
      }

      if (win === 'white') {
        stats[white].wins += 1;
        stats[black].losses += 1;
      } else if (win === 'black') {
        stats[black].wins += 1;
        stats[white].losses += 1;
      } else {
        stats[white].draws += 1;
        stats[black].draws += 1;
      }
    }
  }

  const statArr = Object.values(stats);
  statArr.sort((a, b) => (b.wins - a.wins) || (b.games - a.games) || a.name.localeCompare(b.name));

  const podium = statArr.slice(0, 3);
  const rest = statArr.slice(3);

  renderPodium(podium);
  renderLeaderboard(rest);
}

function renderEmpty() {
  podiumEl.innerHTML = '<p class="muted">No users yet. Add players using the form.</p>';
  leaderboardEntries.innerHTML = '<p class="muted">No players signed up yet.</p>';
}

function renderPodium(podiumArr) {
  if (!podiumArr || podiumArr.length === 0) {
    podiumEl.innerHTML = '<p class="muted">No podium yet</p>';
    return;
  }
  podiumEl.innerHTML = '';
  const places = [1,2,3];
  for (let i=0;i<3;i++){
    const data = podiumArr[i];
    const card = document.createElement('div');
    card.className = 'podium-card';
    if (data) {
      card.innerHTML = `<div class="place-badge">${places[i]}</div><div>
        <div class="player-name">${escapeHtml(data.name)}</div>
        <div class="player-stats">Wins: ${data.wins} · Games: ${data.games}</div>
      </div>`;
    } else {
      card.innerHTML = `<div class="place-badge">${places[i]}</div><div class="player-name muted">—</div>`;
    }
    podiumEl.appendChild(card);
  }
}

function renderLeaderboard(list) {
  if (!list || list.length === 0) {
    leaderboardEntries.innerHTML = '<p class="muted">No more players (top 3 hidden from leaderboard).</p>';
    return;
  }
  leaderboardEntries.innerHTML = '';
  for (const item of list) {
    const el = document.createElement('div');
    el.className = 'leaderboard-entry';
    const left = document.createElement('div');
    left.className = 'entry-left';
    left.innerHTML = `<div class="entry-name">${escapeHtml(item.name)}</div><div class="entry-stats">Wins: ${item.wins} · Losses: ${item.losses} · Draws: ${item.draws}</div>`;
    const right = document.createElement('div');
    right.className = 'entry-right';
    right.innerHTML = `<div class="entry-stats">Games: ${item.games}${item.lastGame ? ' · last: '+(new Date(item.lastGame)).toLocaleString() : ''}</div>`;
    el.appendChild(left);
    el.appendChild(right);
    leaderboardEntries.appendChild(el);
  }
}

function escapeHtml(s){
  if (!s) return '';
  return String(s).replace(/[&<>\"']/g, c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":"&#39;"
  }[c]));
}

// Init
loadUsers();
if ([...users].length === 0) {
  renderEmpty();
} else {
  refreshData();
}

//ändrar mellan light mode och dark mode
(() => {
  const STORAGE_INVERT = 'nti_inverted_v1';
  const btn = document.getElementById('invert-btn');
  if (!btn) return;

  function setInverted(enabled){
    document.documentElement.classList.toggle('inverted', enabled);
    btn.setAttribute('aria-pressed', String(Boolean(enabled)));
    localStorage.setItem(STORAGE_INVERT, enabled ? '1' : '0');
  

    if (enabled) {
      btn.title = 'Mörkt läge';
    }
    else {
      btn.title = 'Ljust läge';
    }
  }


  const stored = localStorage.getItem(STORAGE_INVERT);
  if (stored === '1') setInverted(true);
  else setInverted(false);

  btn.addEventListener('click', () => {
    const active = document.documentElement.classList.contains('inverted');
    setInverted(!active);
  });
})();