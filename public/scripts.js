// public/scripts.js - client-side signup + Lichess integration (uses server proxy at /api/...)

const usernameInput = document.getElementById('username-input');
const signupForm = document.getElementById('signup-form');
const leaderboardEntries = document.getElementById('leaderboard-entries');
const podiumEl = document.getElementById('podium');
const refreshBtn = document.getElementById('refresh-btn');

signupForm.addEventListener('submit', async e => {
  e.preventDefault();
  const name = usernameInput.value.trim();
  if (!name) return;
  await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: name })
  });
  usernameInput.value = '';
  refreshData();
});

refreshBtn.addEventListener('click', () => refreshData());

async function fetchLeaderboard() {
  const res = await fetch('/api/leaderboard');
  if (!res.ok) return { podium: [], leaderboard: [] };
  return await res.json();
}

function winnerFromResult(result) {
  if (!result) return null;
  if (result.includes('1-0')) return 'white';
  if (result.includes('0-1')) return 'black';
  if (result.includes('1/2') || result.includes('1⁄2')) return 'draw';
  return null;
}

async function refreshData() {
  const data = await fetchLeaderboard();
  renderPodium(data.podium);
  renderLeaderboard(data.leaderboard);
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
