<?php
// server/fetch_games.php - CLI script to fetch Lichess games for users and store them
require_once __DIR__ . '/db.php';
ensureTables();
$pdo = getPDO();

$users = $pdo->query('SELECT username FROM users')->fetchAll(PDO::FETCH_COLUMN);
foreach ($users as $username) {
    $url = 'https://lichess.org/api/games/user/' . rawurlencode($username) . '?max=50&opening=true&moves=false';
    $opts = ['http' => ['method' => 'GET','header' => "Accept: application/x-ndjson\r\nUser-Agent: nti-schackstege-php\r\n", 'timeout'=>10]];
    $context = stream_context_create($opts);
    $text = @file_get_contents($url, false, $context);
    if ($text === false) continue;
    $lines = array_filter(array_map('trim', explode("\n", $text)));
    foreach ($lines as $line) {
        $obj = json_decode($line, true);
        if (!$obj) continue;
        $white = $obj['players']['white']['user']['name'] ?? ($obj['players']['white']['userId'] ?? ($obj['white'] ?? null));
        $black = $obj['players']['black']['user']['name'] ?? ($obj['players']['black']['userId'] ?? ($obj['black'] ?? null));
        $result = null;
        if (isset($obj['winner'])) {
            if ($obj['winner'] === 'white') $result = '1-0';
            elseif ($obj['winner'] === 'black') $result = '0-1';
        } elseif (isset($obj['status']) && $obj['status'] === 'draw') $result = '1/2-1/2';
        elseif (!empty($obj['pgn'])) {
            if (strpos($obj['pgn'], '1-0') !== false) $result = '1-0';
            elseif (strpos($obj['pgn'], '0-1') !== false) $result = '0-1';
            elseif (strpos($obj['pgn'], '1/2-1/2') !== false) $result = '1/2-1/2';
        }
        if (!$result) continue;
        if (!$white || !$black) continue;
        $white = strtolower($white); $black = strtolower($black);
        // only store games between tracked users
        if (!in_array($white, $users) || !in_array($black, $users)) continue;
        $lichess_id = $obj['id'] ?? ($obj['gameId'] ?? null);
        if ($lichess_id) {
            $stmt = $pdo->prepare('SELECT 1 FROM games WHERE lichess_id = ?');
            $stmt->execute([$lichess_id]);
            if ($stmt->fetch()) continue;
        }
        $ins = $pdo->prepare('INSERT INTO games (white, black, result, date, lichess_id, raw_json) VALUES (?, ?, ?, ?, ?, ?)');
        $date = isset($obj['createdAt']) ? date('Y-m-d H:i:s', intval($obj['createdAt']/1000)) : null;
        $ins->execute([$white, $black, $result, $date, $lichess_id, json_encode($obj)]);
    }
}

echo "Done.\n";

?>