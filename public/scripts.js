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
        <div class="player-name">${escapeHtml(truncateName(data.name, 6))}</div>
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

  // list is the players after the top 3, so ranks start at 4
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const rank = 4 + i;

    const el = document.createElement('div');
    el.className = 'leaderboard-entry';

    const left = document.createElement('div');
    left.className = 'entry-left';

    const rankEl = document.createElement('div');
    rankEl.className = 'entry-rank';
    rankEl.textContent = rank;

    const nameEl = document.createElement('div');
    nameEl.className = 'entry-name';
    nameEl.innerHTML = escapeHtml(shortenName(item.name, 6));

    const statsEl = document.createElement('div');
    statsEl.className = 'entry-stats';
    statsEl.textContent = `Wins: ${item.wins} · Losses: ${item.losses} · Draws: ${item.draws}`;

    left.appendChild(rankEl);
    left.appendChild(nameEl);
    left.appendChild(statsEl);

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

/* sätter ett max antal bokstäver som visas i leaderboarden för användarnamnen */
function shortenName(name) {
  if (!name) return '';
  const s = String(name);
  if (s.length <= 10) return s;
  const visible = Math.max(0, 10);
  return s.slice(0, visible) + '…';
}

refreshData();

// Site-wide color invert toggle (persists choice)
(() => {
  const KEY = 'nti_inverted_v1';
  const btn = document.getElementById('invert-btn');

  function setInverted(enabled) {
    document.documentElement.classList.toggle('inverted', Boolean(enabled));
    if (btn) {
      btn.setAttribute('aria-pressed', String(Boolean(enabled)));
      btn.title = enabled ? 'Mörkt läge' : 'Ljust läge';
    }
    try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch {}
  }

  // initialise from storage
  try {
    const stored = localStorage.getItem(KEY);
    setInverted(stored === '1');
  } catch { setInverted(false); }

  // expose toggle for other code and attach to button if present
  window.toggleInvert = () => setInverted(!document.documentElement.classList.contains('inverted'));
  btn?.addEventListener('click', (e) => { e.preventDefault(); window.toggleInvert(); });
})();