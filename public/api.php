<?php
// public/api.php - minimal front controller for small project
require_once __DIR__ . '/../server/db.php';
ensureTables();

$method = $_SERVER['REQUEST_METHOD'];
$pathInfo = '';
// PATH_INFO when called as api.php/leaderboard
if (isset($_SERVER['PATH_INFO'])) $pathInfo = $_SERVER['PATH_INFO'];
else {
    // fallback: parse from REQUEST_URI
    $uri = $_SERVER['REQUEST_URI'];
    $script = $_SERVER['SCRIPT_NAME'];
    if (strpos($uri, $script) === 0) {
        $pathInfo = substr($uri, strlen($script));
    }
}
$pathInfo = trim($pathInfo, '/');

header('Content-Type: application/json; charset=utf-8');

try {
    $pdo = getPDO();
    if ($method === 'POST' && $pathInfo === 'users') {
        $data = json_decode(file_get_contents('php://input'), true);
        $username = isset($data['username']) ? strtolower(trim($data['username'])) : '';
        if ($username === '') { http_response_code(400); echo json_encode(['error'=>'Missing username']); exit; }
        // ensure users table has rank column (in case older DB)
        $pdo->exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS rank INT");
        // find max rank
        $stmt = $pdo->query('SELECT MAX(rank) as maxRank FROM users');
        $row = $stmt->fetch();
        $maxRank = ($row && $row['maxRank']) ? (int)$row['maxRank'] : 0;
        // insert if not exists
        $ins = $pdo->prepare('INSERT IGNORE INTO users (username, rank) VALUES (?, ?)');
        $ins->execute([$username, $maxRank + 1]);
        echo json_encode(['ok'=>true]);
        exit;
    }

    if ($method === 'GET' && $pathInfo === 'leaderboard') {
        // build stats
        $users = $pdo->query('SELECT username FROM users')->fetchAll(PDO::FETCH_COLUMN);
        if (!$users) { echo json_encode(['podium'=>[], 'leaderboard'=>[]]); exit; }
        $stats = [];
        foreach ($users as $u) $stats[$u] = ['name'=>$u, 'games'=>0, 'wins'=>0, 'losses'=>0, 'draws'=>0, 'lastGame'=>null];
        $games = $pdo->query('SELECT white, black, result, date FROM games')->fetchAll();
        foreach ($games as $g) {
            $white = strtolower($g['white'] ?? '');
            $black = strtolower($g['black'] ?? '');
            if (!isset($stats[$white]) || !isset($stats[$black])) continue;
            $stats[$white]['games']++;
            $stats[$black]['games']++;
            if ($g['date']) {
                if (!$stats[$white]['lastGame'] || $g['date'] > $stats[$white]['lastGame']) $stats[$white]['lastGame'] = $g['date'];
                if (!$stats[$black]['lastGame'] || $g['date'] > $stats[$black]['lastGame']) $stats[$black]['lastGame'] = $g['date'];
            }
            if ($g['result'] === '1-0') { $stats[$white]['wins']++; $stats[$black]['losses']++; }
            else if ($g['result'] === '0-1') { $stats[$black]['wins']++; $stats[$white]['losses']++; }
            else if ($g['result'] === '1/2-1/2' || $g['result'] === 'draw') { $stats[$white]['draws']++; $stats[$black]['draws']++; }
        }
        $arr = array_values($stats);
        usort($arr, function($a, $b){
            if ($b['wins'] !== $a['wins']) return $b['wins'] - $a['wins'];
            if ($b['games'] !== $a['games']) return $b['games'] - $a['games'];
            return strcmp($a['name'], $b['name']);
        });
        $podium = array_slice($arr, 0, 3);
        $leaderboard = array_slice($arr, 3);
        echo json_encode(['podium'=>$podium, 'leaderboard'=>$leaderboard]);
        exit;
    }

    if ($method === 'POST' && $pathInfo === 'games') {
        $data = json_decode(file_get_contents('php://input'), true);
        $white = $data['white'] ?? '';
        $black = $data['black'] ?? '';
        $result = $data['result'] ?? '';
        if (!$white || !$black || !in_array($result, ['1-0','0-1','1/2-1/2'])) { http_response_code(400); echo json_encode(['error'=>'Invalid']); exit; }
        $ins = $pdo->prepare('INSERT INTO games (white, black, result, date, lichess_id, raw_json) VALUES (?, ?, ?, ?, ?, ?)');
        $ins->execute([$white, $black, $result, date('Y-m-d H:i:s'), $data['lichess_id'] ?? null, json_encode($data)]);
        echo json_encode(['ok'=>true]);
        exit;
    }

    // default
    http_response_code(404);
    echo json_encode(['error'=>'Not found']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error'=>'Server error','details'=>$e->getMessage()]);
}

?>