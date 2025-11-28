<?php
// server/db.php - simple PDO connection using .env in project root
function loadEnv($path) {
    $vars = [];
    if (!file_exists($path)) return $vars;
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) continue;
        if (!strpos($line, '=')) continue;
        list($k, $v) = explode('=', $line, 2);
        $vars[trim($k)] = trim($v);
    }
    return $vars;
}

$env = loadEnv(__DIR__ . '/../.env');
$DB_HOST = $env['DB_HOST'] ?? '127.0.0.1';
$DB_NAME = $env['DB_NAME'] ?? 'nti_schackstege';
$DB_USER = $env['DB_USER'] ?? 'root';
$DB_PASS = $env['DB_PASSWORD'] ?? '';
$DB_PORT = $env['DB_PORT'] ?? 3306;

function getPDO() {
    global $DB_HOST, $DB_NAME, $DB_USER, $DB_PASS, $DB_PORT;
    static $pdo = null;
    if ($pdo) return $pdo;
    $dsn = "mysql:host={$DB_HOST};dbname={$DB_NAME};port={$DB_PORT};charset=utf8mb4";
    $opts = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];
    $pdo = new PDO($dsn, $DB_USER, $DB_PASS, $opts);
    return $pdo;
}

// helper to ensure tables exist (safe to call repeatedly)
function ensureTables() {
    $pdo = getPDO();
    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      username VARCHAR(64) NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      rank INT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS games (
      id INT PRIMARY KEY AUTO_INCREMENT,
      white VARCHAR(64) NOT NULL,
      black VARCHAR(64) NOT NULL,
      result VARCHAR(16),
      date DATETIME,
      lichess_id VARCHAR(64),
      raw_json TEXT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

?>