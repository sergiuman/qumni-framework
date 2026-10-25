<?php
session_start();
header('Content-Type: application/json');

$config = file_exists(__DIR__ . '/config.php') ? require __DIR__ . '/config.php' : [];
$OPENAI_API_KEY = $config['OPENAI_API_KEY'] ?? '';

// Database setup
$dbDir = is_dir(__DIR__ . '/data') ? __DIR__ . '/data' : (is_dir(__DIR__ . '/Data') ? __DIR__ . '/Data' : __DIR__ . '/data');
$dbFile = $dbDir . '/momentum.db';

if (!is_dir($dbDir)) {
    mkdir($dbDir, 0755, true);
}

try {
    $db = new PDO('sqlite:' . $dbFile);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Create tables
    $db->exec("
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            sleep INTEGER DEFAULT 5,
            energy INTEGER DEFAULT 5,
            mood TEXT DEFAULT 'neutral',
            food INTEGER DEFAULT 5,
            movement INTEGER DEFAULT 3,
            decisions INTEGER DEFAULT 2,
            habits TEXT DEFAULT '[]',
            reflection_practical TEXT DEFAULT '',
            reflection_emotional TEXT DEFAULT '',
            reflection_identity TEXT DEFAULT '',
            wins TEXT DEFAULT '',
            challenges TEXT DEFAULT '',
            gratitude TEXT DEFAULT '',
            completed INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, date)
        );
        
        CREATE TABLE IF NOT EXISTS planned_habits (
            user_id INTEGER PRIMARY KEY,
            habits TEXT DEFAULT '[]'
        );

        CREATE TABLE IF NOT EXISTS wso_quiz_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            w_pct INTEGER NOT NULL,
            s_pct INTEGER NOT NULL,
            o_pct INTEGER NOT NULL,
            arch_key TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS user_goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            text TEXT NOT NULL,
            done INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ");

    // Alter table to add WSO columns to entries if they do not exist
    try {
        $db->exec("ALTER TABLE entries ADD COLUMN wso_w INTEGER DEFAULT 5");
    } catch (PDOException $e) {}
    try {
        $db->exec("ALTER TABLE entries ADD COLUMN wso_s INTEGER DEFAULT 5");
    } catch (PDOException $e) {}
    try {
        $db->exec("ALTER TABLE entries ADD COLUMN wso_o INTEGER DEFAULT 5");
    } catch (PDOException $e) {}

} catch (PDOException $e) {
    die(json_encode(['error' => 'Database error: ' . $e->getMessage()]));
}

// Get request data
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$input = json_decode(file_get_contents('php://input'), true) ?? [];

// Helper functions
function response($data) {
    echo json_encode($data);
    exit;
}

function requireAuth() {
    if (!isset($_SESSION['user_id'])) {
        http_response_code(401);
        response(['error' => 'Not authenticated']);
    }
    return $_SESSION['user_id'];
}

function getStreak($db, $userId) {
    $stmt = $db->prepare("SELECT date FROM entries WHERE user_id = ? AND completed = 1 ORDER BY date DESC");
    $stmt->execute([$userId]);
    $entries = $stmt->fetchAll(PDO::FETCH_COLUMN);
    
    if (empty($entries)) return 0;
    
    $streak = 0;
    $checkDate = new DateTime();
    
    for ($i = 0; $i < 365; $i++) {
        $dateStr = $checkDate->format('Y-m-d');
        $found = in_array($dateStr, $entries);
        
        if ($found) {
            $streak++;
        } elseif ($i > 0) {
            break;
        }
        $checkDate->modify('-1 day');
    }
    return $streak;
}

// Route handling
switch ($action) {
    
    // ============ AUTH ============
    
    case 'register':
        if ($method !== 'POST') response(['error' => 'Method not allowed']);
        
        $username = trim($input['username'] ?? '');
        $password = $input['password'] ?? '';
        
        if (strlen($username) < 3) {
            response(['error' => 'Username must be at least 3 characters']);
        }
        if (strlen($password) < 6) {
            response(['error' => 'Password must be at least 6 characters']);
        }
        
        // Check if exists
        $stmt = $db->prepare("SELECT id FROM users WHERE username = ?");
        $stmt->execute([strtolower($username)]);
        if ($stmt->fetch()) {
            response(['error' => 'Username already taken']);
        }
        
        // Create user
        $hash = password_hash($password, PASSWORD_DEFAULT);
        $stmt = $db->prepare("INSERT INTO users (username, password) VALUES (?, ?)");
        $stmt->execute([strtolower($username), $hash]);
        
        $userId = $db->lastInsertId();
        $_SESSION['user_id'] = $userId;
        
        response(['success' => true, 'user' => ['id' => $userId, 'username' => strtolower($username)]]);
        break;
    
    case 'login':
        if ($method !== 'POST') response(['error' => 'Method not allowed']);
        
        $username = trim($input['username'] ?? '');
        $password = $input['password'] ?? '';
        
        $stmt = $db->prepare("SELECT * FROM users WHERE username = ?");
        $stmt->execute([strtolower($username)]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$user || !password_verify($password, $user['password'])) {
            response(['error' => 'Invalid username or password']);
        }
        
        $_SESSION['user_id'] = $user['id'];
        response(['success' => true, 'user' => ['id' => $user['id'], 'username' => $user['username']]]);
        break;
    
    case 'logout':
        session_destroy();
        response(['success' => true]);
        break;
    
    case 'me':
        if (!isset($_SESSION['user_id'])) {
            response(['authenticated' => false]);
        }
        
        $stmt = $db->prepare("SELECT id, username, created_at FROM users WHERE id = ?");
        $stmt->execute([$_SESSION['user_id']]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$user) {
            response(['authenticated' => false]);
        }
        
        $user['streak'] = getStreak($db, $user['id']);
        response(['authenticated' => true, 'user' => $user]);
        break;
    
    case 'change-password':
        $userId = requireAuth();
        
        $currentPassword = $input['currentPassword'] ?? '';
        $newPassword = $input['newPassword'] ?? '';
        
        if (strlen($newPassword) < 6) {
            response(['error' => 'New password must be at least 6 characters']);
        }
        
        $stmt = $db->prepare("SELECT password FROM users WHERE id = ?");
        $stmt->execute([$userId]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!password_verify($currentPassword, $user['password'])) {
            response(['error' => 'Current password is incorrect']);
        }
        
        $newHash = password_hash($newPassword, PASSWORD_DEFAULT);
        $stmt = $db->prepare("UPDATE users SET password = ? WHERE id = ?");
        $stmt->execute([$newHash, $userId]);
        
        response(['success' => true]);
        break;
    
    // ============ ENTRIES ============
    
    case 'entries':
        $userId = requireAuth();
        
        $stmt = $db->prepare("SELECT * FROM entries WHERE user_id = ? ORDER BY date DESC");
        $stmt->execute([$userId]);
        $entries = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Parse habits JSON
        foreach ($entries as &$entry) {
            $entry['habits'] = json_decode($entry['habits'], true) ?? [];
        }
        
        response($entries);
        break;
    
    case 'today':
        $userId = requireAuth();
        $today = date('Y-m-d', strtotime('-4 hours'));
        
        $stmt = $db->prepare("SELECT * FROM entries WHERE user_id = ? AND date = ?");
        $stmt->execute([$userId, $today]);
        $entry = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$entry) {
            // Create today's entry
            $stmt = $db->prepare("INSERT INTO entries (user_id, date) VALUES (?, ?)");
            $stmt->execute([$userId, $today]);
            
            $stmt = $db->prepare("SELECT * FROM entries WHERE user_id = ? AND date = ?");
            $stmt->execute([$userId, $today]);
            $entry = $stmt->fetch(PDO::FETCH_ASSOC);
        }
        
        $entry['habits'] = json_decode($entry['habits'], true) ?? [];
        response($entry);
        break;
    
    case 'save-entry':
        $userId = requireAuth();
        
        $date = $input['date'] ?? date('Y-m-d', strtotime('-4 hours'));
        $habits = json_encode($input['habits'] ?? []);
        
        // Check if exists
        $stmt = $db->prepare("SELECT id FROM entries WHERE user_id = ? AND date = ?");
        $stmt->execute([$userId, $date]);
        $existing = $stmt->fetch();
        
        if ($existing) {
            $stmt = $db->prepare("UPDATE entries SET 
                sleep = ?, energy = ?, mood = ?, food = ?, movement = ?, decisions = ?,
                habits = ?, reflection_practical = ?, reflection_emotional = ?, reflection_identity = ?,
                wins = ?, challenges = ?, gratitude = ?, completed = ?,
                wso_w = ?, wso_s = ?, wso_o = ?
                WHERE user_id = ? AND date = ?");
            $stmt->execute([
                $input['sleep'] ?? 5,
                $input['energy'] ?? 5,
                $input['mood'] ?? 'neutral',
                $input['food'] ?? 5,
                $input['movement'] ?? 3,
                $input['decisions'] ?? 2,
                $habits,
                $input['reflection_practical'] ?? '',
                $input['reflection_emotional'] ?? '',
                $input['reflection_identity'] ?? '',
                $input['wins'] ?? '',
                $input['challenges'] ?? '',
                $input['gratitude'] ?? '',
                ($input['completed'] ?? false) ? 1 : 0,
                $input['wso_w'] ?? 5,
                $input['wso_s'] ?? 5,
                $input['wso_o'] ?? 5,
                $userId,
                $date
            ]);
        } else {
            $stmt = $db->prepare("INSERT INTO entries 
                (user_id, date, sleep, energy, mood, food, movement, decisions, habits,
                reflection_practical, reflection_emotional, reflection_identity, wins, challenges, gratitude, completed,
                wso_w, wso_s, wso_o)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $userId,
                $date,
                $input['sleep'] ?? 5,
                $input['energy'] ?? 5,
                $input['mood'] ?? 'neutral',
                $input['food'] ?? 5,
                $input['movement'] ?? 3,
                $input['decisions'] ?? 2,
                $habits,
                $input['reflection_practical'] ?? '',
                $input['reflection_emotional'] ?? '',
                $input['reflection_identity'] ?? '',
                $input['wins'] ?? '',
                $input['challenges'] ?? '',
                $input['gratitude'] ?? '',
                ($input['completed'] ?? false) ? 1 : 0,
                $input['wso_w'] ?? 5,
                $input['wso_s'] ?? 5,
                $input['wso_o'] ?? 5
            ]);
        }
        
        // Return updated entry
        $stmt = $db->prepare("SELECT * FROM entries WHERE user_id = ? AND date = ?");
        $stmt->execute([$userId, $date]);
        $entry = $stmt->fetch(PDO::FETCH_ASSOC);
        $entry['habits'] = json_decode($entry['habits'], true) ?? [];
        
        response($entry);
        break;
    
    // ============ AI JOURNALLING ============
    
    case 'transcribe':
        $userId = requireAuth();
        
        if ($method !== 'POST') response(['error' => 'Method not allowed']);
        if (empty($OPENAI_API_KEY) || $OPENAI_API_KEY === 'your-api-key-here') {
            response(['error' => 'Please set OPENAI_API_KEY in config.php']);
        }
        
        if (!isset($_FILES['audio'])) {
            response(['error' => 'No audio file provided']);
        }
        
        $audioPath = $_FILES['audio']['tmp_name'];
        $audioName = $_FILES['audio']['name'] ?: 'audio.webm';
        
        // 1. Transcribe with Whisper
        $cfile = new CURLFile($audioPath, mime_content_type($audioPath), $audioName);
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, 'https://api.openai.com/v1/audio/transcriptions');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Bearer ' . $OPENAI_API_KEY
        ]);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, [
            'file' => $cfile,
            'model' => 'whisper-1'
        ]);
        
        $result = curl_exec($ch);
        curl_close($ch);
        
        $whisperData = json_decode($result, true);
        if (isset($whisperData['error'])) {
            response(['error' => 'Whisper API Error: ' . $whisperData['error']['message']]);
        }
        
        $transcript = $whisperData['text'] ?? '';
        if (empty($transcript)) {
            response(['error' => 'Could not transcribe audio']);
        }
        
        // 2. Extract Data with GPT-4o-mini
        $prompt = "You are an AI data extractor for a daily journaling app. Read the user's transcript of their day.
Analyze the sentiment and context to accurately infer scores even if they don't explicitly say numbers.
Extract the following JSON structure exactly. Do not wrap in markdown tags like ```json.
Fields MUST be present:
- `sleep` (1-10 integer)
- `energy` (1-10 integer)
- `mood` (string exactly one of: 'great', 'good', 'neutral', 'low', 'struggling')
- `food` (1-10 integer)
- `movement` (0-4 integer)
- `decisions` (0-3 integer)
- `habits` (array of strings. Output ONLY IDs matching habits the user mentions COMPLETING TODAY: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'h10', 'h11', 'h12']. Empty array if none)
- `planned_habits` (array of strings. Output ONLY IDs matching habits the user explicitly mentions PLANNING TO DO TOMORROW. Same ID list as above. Empty array if none)
- `wso_w` (1-10 integer. Estimate their motivation/Will regarding their goals today. e.g. unmotivated=2, normal=5, motivated=7, clear focus=9. Default 5)
- `wso_s` (1-10 integer. Estimate their confidence/competence/Skill regarding tasks today. e.g. confused/beginner=2, competent/normal=5, master=8. Default 5)
- `wso_o` (1-10 integer. Estimate their access/time/Opportunity today. e.g. blocked/busy/no time=2, normal/some windows=5, clear open day/unlocked access=8. Default 5)
- `reflection_practical` (string, short summary of what they actually did)
- `reflection_emotional` (string, short summary of how they felt)
- `reflection_identity` (string, short note on who they were today)
- `wins` (string, their best achievement, or empty)
- `challenges` (string, any main challenge, or empty)
- `gratitude` (string, what they are grateful for, or empty)

Transcript: \"$transcript\"";

        $ch2 = curl_init();
        curl_setopt($ch2, CURLOPT_URL, 'https://api.openai.com/v1/chat/completions');
        curl_setopt($ch2, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch2, CURLOPT_HTTPHEADER, [
            'Authorization: Bearer ' . $OPENAI_API_KEY,
            'Content-Type: application/json'
        ]);
        curl_setopt($ch2, CURLOPT_POST, true);
        curl_setopt($ch2, CURLOPT_POSTFIELDS, json_encode([
            'model' => 'gpt-4o-mini',
            'messages' => [
                ['role' => 'system', 'content' => $prompt]
            ],
            'response_format' => ['type' => 'json_object']
        ]));
        
        $result2 = curl_exec($ch2);
        curl_close($ch2);
        
        $gptData = json_decode($result2, true);
        if (isset($gptData['error'])) {
            response(['error' => 'GPT API Error: ' . $gptData['error']['message']]);
        }
        
        $extractedJsonStr = $gptData['choices'][0]['message']['content'] ?? '{}';
        $extractedData = json_decode($extractedJsonStr, true);
        
        response([
            'success' => true,
            'transcript' => $transcript,
            'extracted' => $extractedData
        ]);
        break;

    // ============ HABITS ============
    
    case 'planned':
        $userId = requireAuth();
        
        if ($method === 'GET') {
            $stmt = $db->prepare("SELECT habits FROM planned_habits WHERE user_id = ?");
            $stmt->execute([$userId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            response($row ? json_decode($row['habits'], true) : []);
        } else {
            $habits = json_encode($input['habits'] ?? []);
            $stmt = $db->prepare("INSERT INTO planned_habits (user_id, habits) VALUES (?, ?)
                ON CONFLICT(user_id) DO UPDATE SET habits = ?");
            $stmt->execute([$userId, $habits, $habits]);
            response(['success' => true]);
        }
        break;
    
    // ============ WSO QUIZ RESULTS ============
    
    case 'wso-quiz':
        $userId = requireAuth();
        
        if ($method === 'GET') {
            $stmt = $db->prepare("SELECT * FROM wso_quiz_results WHERE user_id = ? ORDER BY date DESC");
            $stmt->execute([$userId]);
            $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
            response($results);
        } else {
            $date = $input['date'] ?? date('Y-m-d H:i:s');
            $w_pct = intval($input['w_pct'] ?? 0);
            $s_pct = intval($input['s_pct'] ?? 0);
            $o_pct = intval($input['o_pct'] ?? 0);
            $arch_key = $input['arch_key'] ?? 'all';
            
            $stmt = $db->prepare("INSERT INTO wso_quiz_results (user_id, date, w_pct, s_pct, o_pct, arch_key) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->execute([$userId, $date, $w_pct, $s_pct, $o_pct, $arch_key]);
            
            response(['success' => true, 'id' => $db->lastInsertId()]);
        }
        break;

    // ============ GOALS ============
    
    case 'goals':
        $userId = requireAuth();
        
        if ($method === 'GET') {
            $stmt = $db->prepare("SELECT * FROM user_goals WHERE user_id = ? ORDER BY created_at ASC");
            $stmt->execute([$userId]);
            $goals = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($goals as &$g) {
                $g['done'] = $g['done'] ? true : false;
            }
            response($goals);
        } elseif ($method === 'POST') {
            $text = trim($input['text'] ?? '');
            if (empty($text)) response(['error' => 'Goal text cannot be empty']);
            
            $stmt = $db->prepare("INSERT INTO user_goals (user_id, text, done) VALUES (?, ?, 0)");
            $stmt->execute([$userId, $text]);
            
            response(['success' => true, 'goal' => [
                'id' => $db->lastInsertId(),
                'user_id' => $userId,
                'text' => $text,
                'done' => false
            ]]);
        } elseif ($method === 'PUT' || $method === 'PATCH') {
            $goalId = intval($input['id'] ?? 0);
            $done = ($input['done'] ?? false) ? 1 : 0;
            
            $stmt = $db->prepare("UPDATE user_goals SET done = ? WHERE id = ? AND user_id = ?");
            $stmt->execute([$done, $goalId, $userId]);
            
            response(['success' => true]);
        } elseif ($method === 'DELETE') {
            $goalId = intval($input['id'] ?? 0);
            
            if ($goalId > 0) {
                $stmt = $db->prepare("DELETE FROM user_goals WHERE id = ? AND user_id = ?");
                $stmt->execute([$goalId, $userId]);
            } else {
                $stmt = $db->prepare("DELETE FROM user_goals WHERE user_id = ?");
                $stmt->execute([$userId]);
            }
            
            response(['success' => true]);
        }
        break;
    
    default:
        response(['error' => 'Unknown action']);
}
