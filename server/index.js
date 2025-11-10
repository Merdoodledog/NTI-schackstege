const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 30032;
app.use(express.json());

// serve public client files
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));

// Register a user
app.post('/api/users', async (req, res) => {
  const username = (req.body.username || '').trim().toLowerCase();
  if (!username) return res.status(400).json({ error: 'Missing username' });
  try {
    const conn = await pool.getConnection();
    // Add rank column if not exists
    await conn.query(`CREATE TABLE IF NOT EXISTS users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      username VARCHAR(64) NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      rank INT
    )`);
    // Find current max rank
    const [rows] = await conn.query('SELECT MAX(rank) as maxRank FROM users');
    const maxRank = rows[0].maxRank || 0;
    // Insert user with next rank if not exists
    await conn.query('INSERT IGNORE INTO users (username, rank) VALUES (?, ?)', [username, maxRank + 1]);
    conn.release();
    res.json({ ok: true });
  } catch (e) {
    console.error('Error in /api/users:', e);
    res.status(500).json({ error: 'DB error', details: e.message });
  }
});

// Get leaderboard and podium
app.get('/api/leaderboard', async (req, res) => {
  try {
    const conn = await pool.getConnection();
    await conn.query(`CREATE TABLE IF NOT EXISTS games (
      id INT PRIMARY KEY AUTO_INCREMENT,
      white VARCHAR(64) NOT NULL,
      black VARCHAR(64) NOT NULL,
      result VARCHAR(16),
      date DATETIME,
      lichess_id VARCHAR(32),
      raw_json TEXT
    )`);
    const [userRows] = await conn.query('SELECT username FROM users');
    const users = userRows.map(u => u.username);
    if (users.length === 0) {
      conn.release();
      return res.json({ podium: [], leaderboard: [] });
    }
    // Initialize stats for each user
    const stats = {};
    for (const u of users) stats[u] = { name: u, games: 0, wins: 0, losses: 0, draws: 0, lastGame: null };
    // Get all games and count stats
    const [gameRows] = await conn.query('SELECT white, black, result, date FROM games');
    for (const g of gameRows) {
      const white = (g.white || '').toLowerCase();
      const black = (g.black || '').toLowerCase();
      if (!stats[white] || !stats[black]) continue;
      stats[white].games += 1;
      stats[black].games += 1;
      if (g.date) {
        if (!stats[white].lastGame || g.date > stats[white].lastGame) stats[white].lastGame = g.date;
        if (!stats[black].lastGame || g.date > stats[black].lastGame) stats[black].lastGame = g.date;
      }
      // Count wins/losses/draws
      if (g.result === '1-0') {
        stats[white].wins += 1;
        stats[black].losses += 1;
      } else if (g.result === '0-1') {
        stats[black].wins += 1;
        stats[white].losses += 1;
      } else if (g.result && (g.result === '1/2-1/2' || g.result === 'draw')) {
        stats[white].draws += 1;
        stats[black].draws += 1;
      }
    }
    conn.release();
    const statArr = Object.values(stats);
    // Sort: wins desc, then games desc, then name
    statArr.sort((a, b) => (b.wins - a.wins) || (b.games - a.games) || a.name.localeCompare(b.name));
    const podium = statArr.slice(0, 3);
    const leaderboard = statArr.slice(3);
    res.json({ podium, leaderboard });
  } catch (e) {
    console.error('Error in /api/leaderboard:', e);
    res.status(500).json({ error: 'DB error', details: e.message });
  }
});

// Periodically fetch games for all users from Lichess and store in DB

async function fetchAndStoreGames() {
  try {
    const conn = await pool.getConnection();
    await conn.query(`CREATE TABLE IF NOT EXISTS users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      username VARCHAR(64) NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await conn.query(`CREATE TABLE IF NOT EXISTS games (
      id INT PRIMARY KEY AUTO_INCREMENT,
      white VARCHAR(64) NOT NULL,
      black VARCHAR(64) NOT NULL,
      result VARCHAR(16),
      date DATETIME,
      lichess_id VARCHAR(32),
      raw_json TEXT
    )`);
    const [userRows] = await conn.query('SELECT username FROM users');
    const users = userRows.map(u => u.username);
    for (const username of users) {
      const url = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?max=50&opening=true&moves=false`;
      try {
        const res = await fetch(url, { headers: { Accept: 'application/x-ndjson' } });
        if (!res.ok) continue;
        const text = await res.text();
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
          try {
            const obj = JSON.parse(line);
            const white = (obj.players && obj.players.white && obj.players.white.user && obj.players.white.user.name) || (obj.players && obj.players.white && obj.players.white.userId) || obj.white || null;
            const black = (obj.players && obj.players.black && obj.players.black.user && obj.players.black.user.name) || (obj.players && obj.players.black && obj.players.black.userId) || obj.black || null;
            // Determine result in '1-0', '0-1', or '1/2-1/2' format
            let result = null;
            if (obj.winner === 'white') result = '1-0';
            else if (obj.winner === 'black') result = '0-1';
            else if (obj.status === 'draw' || obj.result === '1/2-1/2') result = '1/2-1/2';
            else if (obj.pgn) {
              if (obj.pgn.includes('1-0')) result = '1-0';
              else if (obj.pgn.includes('0-1')) result = '0-1';
              else if (obj.pgn.includes('1/2-1/2')) result = '1/2-1/2';
            }
            if (!result) continue; // skip if can't determine result
            const date = obj.createdAt || obj.time || null;
            const lichess_id = obj.id || obj.gameId || null;
            if (!white || !black) continue;
            if (!users.includes(white.toLowerCase()) || !users.includes(black.toLowerCase())) continue;
            // Deduplicate by lichess_id
            if (lichess_id) {
              const [existsRows] = await conn.query('SELECT 1 FROM games WHERE lichess_id = ?', [lichess_id]);
              if (existsRows.length > 0) continue;
            }
            await conn.query('INSERT INTO games (white, black, result, date, lichess_id, raw_json) VALUES (?, ?, ?, ?, ?, ?)',
              [white, black, result, date ? new Date(date).toISOString().slice(0, 19).replace('T', ' ') : null, lichess_id, JSON.stringify(obj)]);
          } catch (e) {}
        }
      } catch (e) {}
    }
    conn.release();
  } catch (e) {}
}

// Run fetchAndStoreGames every 5 minutes
setInterval(fetchAndStoreGames, 5 * 1000);
fetchAndStoreGames(); // initial run

app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));