<?php
// ── QUMNI · Subscription handler — Gmail SMTP ─────────────────────────────────
//
// SETUP (one-time):
//  1. Go to myaccount.google.com → Security → App Passwords
//  2. Create an App Password called "QUMNI" — you get a 16-char code
//  3. Put that code (no spaces) in config.php as 'GMAIL_APP_PASSWORD'
//     (see config.example.php — config.php is gitignored)
//
$config             = file_exists(__DIR__ . '/config.php') ? require __DIR__ . '/config.php' : [];
$gmail_app_password = $config['GMAIL_APP_PASSWORD'] ?? '';
$notify_email       = $config['NOTIFY_EMAIL'] ?? 'mansergiui@gmail.com';
$subscribers_file   = __DIR__ . '/subscribers.txt';

// ── HTTP boilerplate ──────────────────────────────────────────────────────────
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// ── Validate email ────────────────────────────────────────────────────────────
$raw   = file_get_contents('php://input');
$input = json_decode($raw, true);
$email_raw = isset($input['email']) ? $input['email'] : (isset($_POST['email']) ? $_POST['email'] : '');
$email     = filter_var(trim($email_raw), FILTER_VALIDATE_EMAIL);
if (!$email) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid email address']);
    exit;
}

// ── Save to file (always runs, regardless of email success) ──────────────────
$timestamp = date('Y-m-d H:i:s');
file_put_contents($subscribers_file, $timestamp . ' | ' . $email . "\n", FILE_APPEND | LOCK_EX);

// ── Send via Gmail SMTP ───────────────────────────────────────────────────────
function send_gmail($to, $subject, $body, $gmail_user, $gmail_pass) {
    $smtp = @fsockopen('ssl://smtp.gmail.com', 465, $errno, $errstr, 15);
    if (!$smtp) return false;

    $read = function() use ($smtp) {
        $out = '';
        while (!feof($smtp)) {
            $line = fgets($smtp, 512);
            $out .= $line;
            if (isset($line[3]) && $line[3] === ' ') break;
        }
        return $out;
    };

    $read(); // 220 greeting
    fputs($smtp, "EHLO localhost\r\n");        $read();
    fputs($smtp, "AUTH LOGIN\r\n");            $read();
    fputs($smtp, base64_encode($gmail_user) . "\r\n"); $read();
    fputs($smtp, base64_encode($gmail_pass) . "\r\n");
    $auth = $read();

    if (strpos($auth, '235') === false) { fclose($smtp); return false; }

    fputs($smtp, "MAIL FROM:<{$gmail_user}>\r\n");  $read();
    fputs($smtp, "RCPT TO:<{$to}>\r\n");             $read();
    fputs($smtp, "DATA\r\n");                         $read();

    $msg  = "From: QUMNI <{$gmail_user}>\r\n";
    $msg .= "To: {$to}\r\n";
    $msg .= "Subject: {$subject}\r\n";
    $msg .= "MIME-Version: 1.0\r\n";
    $msg .= "Content-Type: text/plain; charset=UTF-8\r\n\r\n";
    $msg .= $body . "\r\n.\r\n";
    fputs($smtp, $msg); $read();

    fputs($smtp, "QUIT\r\n");
    fclose($smtp);
    return true;
}

$subject = 'New QUMNI Subscriber';
$body    = "New subscriber: {$email}\nDate: {$timestamp}\n\nThis email was collected from qumni.com.\nCheck subscribers.txt on the server for the full list.";

send_gmail($notify_email, $subject, $body, $notify_email, $gmail_app_password);

// Always return success — email is already saved to subscribers.txt
echo json_encode(['success' => true]);
