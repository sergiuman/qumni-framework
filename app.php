<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#F8F5F0">
  <title>Momentum — QUMNI · Human Action Frameworks</title>
  <meta name="description" content="QUMNI Momentum: Daily voice log, WSO agency diagnostics, goal gap scanners, and habit tracking.">
  <link rel="canonical" href="https://qumni.com/app.php">
  <link rel="manifest" href="manifest.json">
  <link rel="apple-touch-icon" href="assets/icon-192.png">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="QUMNI Momentum">
  
  <!-- Favicon -->
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' fill='%230C0C0C'/><text x='5' y='24' font-family='sans-serif' font-size='22' font-weight='900' fill='%23C8960C'>Q</text></svg>">
  
  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=Instrument+Serif:ital@0;1&family=IBM+Plex+Mono:wght@300;400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="styles.css?v=8.0">
</head>
<body class="app-body">
  <div class="app-shell">
    <!-- Top Editorial Header & Navigation Bar -->
    <header class="app-header">
      <div class="header-inner">
        <!-- Brand / Logo -->
        <div class="header-brand">
          <a href="index.html" class="app-logo" title="Back to QUMNI Frameworks">
            <span class="logo-mark">QUMNI</span>
            <span class="logo-badge">MOMENTUM</span>
          </a>
        </div>

        <!-- Desktop Navigation Tabs -->
        <nav class="app-tabs" id="appTabs" aria-label="Main Navigation">
          <button class="tab-btn active" data-view="dashboard">
            <span class="tab-tag">01</span>
            <span class="tab-text">Today</span>
          </button>
          <button class="tab-btn" data-view="log">
            <span class="tab-tag">02</span>
            <span class="tab-text">Daily Log</span>
          </button>
          <button class="tab-btn" data-view="diagnostic">
            <span class="tab-tag">03</span>
            <span class="tab-text">Diagnostic</span>
          </button>
          <button class="tab-btn" data-view="scanner">
            <span class="tab-tag">04</span>
            <span class="tab-text">Scanner</span>
          </button>
          <button class="tab-btn" data-view="history">
            <span class="tab-tag">05</span>
            <span class="tab-text">History</span>
          </button>
          <button class="tab-btn" data-view="settings">
            <span class="tab-tag">06</span>
            <span class="tab-text">Settings</span>
          </button>
        </nav>

        <!-- Right Side: Focus Timer Instrument & Library Link -->
        <div class="header-actions">
          <!-- Swiss Focus Timer Instrument -->
          <div class="focus-instrument" id="focusInstrument">
            <div class="instrument-meta">
              <span class="instrument-status-dot" id="timerPulse"></span>
              <select id="timerSelect" class="instrument-select" title="Focus Session Type">
                <option value="Focus">Focus</option>
                <option value="Deep Work">Deep Work</option>
                <option value="Analysis">Analysis</option>
                <option value="Synthesis">Synthesis</option>
                <option value="Planning">Planning</option>
                <option value="Rest">Rest</option>
              </select>
            </div>
            <div class="instrument-clock">
              <span id="timerLabel" class="sr-only">Focus</span>
              <span id="timerDisplay" class="instrument-digits">00:00</span>
            </div>
            <div class="instrument-controls">
              <button id="timerPlay" class="instrument-btn play-btn" title="Start/Pause Timer" aria-label="Start or pause focus session">▶</button>
              <button id="timerReset" class="instrument-btn reset-btn" title="Reset Timer" aria-label="Reset focus session">↺</button>
            </div>
          </div>

          <a href="index.html" class="nav-cta" title="Return to Core Frameworks Library">Library →</a>
        </div>
      </div>

      <!-- Mobile Sub-nav Strip -->
      <div class="mobile-tabs-strip">
        <button class="m-tab active" data-view="dashboard">Today</button>
        <button class="m-tab" data-view="log">Log</button>
        <button class="m-tab" data-view="diagnostic">Diagnostic</button>
        <button class="m-tab" data-view="scanner">Scanner</button>
        <button class="m-tab" data-view="history">History</button>
        <button class="m-tab" data-view="settings">Settings</button>
      </div>
    </header>

    <!-- Main Workspace -->
    <main class="app-main">
      <!-- 01 DASHBOARD VIEW -->
      <section id="dashboard" class="view active" aria-labelledby="greeting">
        <!-- Dashboard Hero -->
        <div class="dash-hero">
          <div class="dash-hero-meta">
            <div class="sec-tag">System 01 · Daily Agency Overview</div>
            <div id="streakBadge" class="streak-pill" style="display:none"></div>
          </div>
          <div class="dash-header-row">
            <div>
              <h1 id="greeting" class="dash-greeting">Welcome</h1>
              <p id="dateText" class="dash-date">—</p>
            </div>
          </div>
        </div>

        <!-- 4-Quadrant Metric Matrix -->
        <div class="stats-matrix">
          <div class="stat-cell">
            <div class="stat-header">
              <span class="stat-glyph">☾</span>
              <span class="stat-label">Sleep Score</span>
            </div>
            <div class="stat-body">
              <span id="sSleep" class="stat-value">—</span>
              <span class="stat-unit">/10</span>
            </div>
            <div class="stat-footnote">Nightly recovery indicator</div>
          </div>

          <div class="stat-cell">
            <div class="stat-header">
              <span class="stat-glyph">⚡</span>
              <span class="stat-label">Energy Capacity</span>
            </div>
            <div class="stat-body">
              <span id="sEnergy" class="stat-value">—</span>
              <span class="stat-unit">/10</span>
            </div>
            <div class="stat-footnote">Biochemical drive level</div>
          </div>

          <div class="stat-cell">
            <div class="stat-header">
              <span class="stat-glyph">✓</span>
              <span class="stat-label">Habits Executed</span>
            </div>
            <div class="stat-body">
              <span id="sHabits" class="stat-value">0</span>
              <span class="stat-unit">done</span>
            </div>
            <div class="stat-footnote">Systemic behavioral votes</div>
          </div>

          <div class="stat-cell">
            <div class="stat-header">
              <span id="sMoodIcon" class="stat-glyph">◎</span>
              <span class="stat-label">Emotional Valence</span>
            </div>
            <div class="stat-body">
              <span id="sMood" class="stat-value stat-mood-text">—</span>
            </div>
            <div class="stat-footnote">Cognitive state baseline</div>
          </div>
        </div>

        <!-- WSO Agency Profile Card (Conditional via JS) -->
        <div id="wsoProfileCard" class="card card-agency" style="display:none"></div>

        <!-- Grid: Focus Cadence & Week Sparkline -->
        <div class="dash-dual-grid">
          <!-- Focus & Planned Habits -->
          <div id="focusCard" class="card" style="display:none">
            <div class="card-eyebrow">Execution Priority</div>
            <h3 class="card-title">Today's Focus & Habit Cadence</h3>
            <div id="focusList" class="focus-checklist"></div>
          </div>

          <!-- Week Cadence Tracker -->
          <div class="card">
            <div class="card-eyebrow">Consistency Cadence</div>
            <h3 class="card-title">7-Day Agency Record</h3>
            <div id="weekGrid" class="week-grid"></div>
          </div>
        </div>

        <!-- WSO Objectives & Goals -->
        <div class="card card-goals">
          <div class="card-eyebrow">Directional Alignment</div>
          <h3 class="card-title">Active WSO Objectives</h3>
          <p class="card-subtitle">Anchor your high-leverage milestones across Will, Skill, and Opportunity.</p>
          <div id="dashboardGoals" class="goals-list"></div>
          <div class="goal-input-bar">
            <input id="dashGoalIn" type="text" placeholder="Formulate an objective (e.g. Master financial modeling; Submit pitch deck)..." autocomplete="off">
            <button id="addGoalBtn" class="btn btn-dark" type="button">+ Add Objective</button>
          </div>
        </div>

        <!-- Wisdom Card -->
        <div class="card card-wisdom">
          <p class="wisdom-quote">"You do not rise to the level of your goals. You fall to the level of your systems."</p>
          <span class="wisdom-author">— James Clear, Atomic Habits</span>
        </div>
      </section>

      <!-- 02 DAILY LOG VIEW -->
      <section id="log" class="view" aria-labelledby="logHeading">
        <div class="view-header">
          <div class="sec-tag">Reflection · System 02</div>
          <h2 id="logHeading" class="view-title">Daily Voice Log & Audit</h2>
          <p class="view-subtitle">Record a 3–5 minute audio reflection of your day, mental roadblocks, and tomorrow's trajectory.</p>
        </div>

        <!-- Audiophile Voice Recorder Module -->
        <div class="card recorder-card">
          <div id="voiceRecorder" class="voice-module">
            <div class="rec-button-wrapper">
              <button id="micBtn" class="mic-button" aria-label="Start recording reflection" title="Click to begin speaking">
                <span class="mic-icon">🎙</span>
              </button>
            </div>
            <div class="rec-info">
              <p id="recStatus" class="rec-status-text">Standby · Tap microphone to record daily reflection</p>
              <div id="recTimer" class="rec-timer-badge" style="display:none">00:00</div>
            </div>
          </div>

          <!-- AI Analyzing State -->
          <div id="aiProcessing" class="ai-processing-state" style="display:none">
            <div class="editorial-spinner"></div>
            <p class="processing-title">Synthesizing Voice Reflection...</p>
            <p class="processing-desc">Extracting WSO dimensions, energy metrics, emotional tone, and planned actions.</p>
          </div>

          <!-- AI Result Review State -->
          <div id="aiResult" class="ai-result-panel" style="display:none">
            <div class="card-eyebrow">Speech-to-Data Synthesis</div>
            <h3 class="panel-heading">Transcribed Reflection</h3>
            <blockquote id="transcriptText" class="transcript-quote"></blockquote>

            <h3 class="panel-heading" style="margin-top: 1.5rem;">Extracted System Data</h3>
            <div id="extractedDataPre" class="extracted-metrics-grid"></div>

            <div class="ai-actions">
              <button id="saveAiData" class="btn btn-dark" type="button">Confirm & Apply to Log →</button>
              <button id="discardAiData" class="btn btn-outline" type="button">Discard Analysis</button>
            </div>
          </div>

          <p id="trackNote" class="track-notification"></p>
        </div>

        <!-- Manual Adjustments Section -->
        <div class="section-divider">
          <span>Manual Cognitive Log</span>
        </div>

        <!-- 3 Reflection In-Depth Cards -->
        <div class="reflection-grid">
          <div class="card reflect-card">
            <div class="card-eyebrow">Dimension 01</div>
            <h3 class="reflect-title"><span class="reflect-glyph">🎯</span> Practical Summary</h3>
            <p class="reflect-hint">What concrete actions, output, and progress did you execute today?</p>
            <textarea id="rPractical" rows="3" placeholder="Outline your key outputs and operational actions..."></textarea>
          </div>

          <div class="card reflect-card">
            <div class="card-eyebrow">Dimension 02</div>
            <h3 class="reflect-title"><span class="reflect-glyph">💜</span> Emotional State</h3>
            <p class="reflect-hint">What psychological tensions, calm, or mental friction were present?</p>
            <textarea id="rEmotional" rows="3" placeholder="Describe internal feelings, stressors, or flow states..."></textarea>
          </div>

          <div class="card reflect-card">
            <div class="card-eyebrow">Dimension 03</div>
            <h3 class="reflect-title"><span class="reflect-glyph">🪞</span> Identity Calibration</h3>
            <p class="reflect-hint">Did today's decisions reflect the standard of your desired future self?</p>
            <textarea id="rIdentity" rows="3" placeholder="Evaluate alignment with your core principles and standard..."></textarea>
          </div>
        </div>

        <!-- 3-Column Daily Captures -->
        <div class="captures-grid">
          <div class="capture-cell">
            <label for="rWins"><span class="capture-glyph">🏆</span> Today's Decisive Win</label>
            <input type="text" id="rWins" placeholder="Small or large victory achieved...">
          </div>
          <div class="capture-cell">
            <label for="rChallenges"><span class="capture-glyph">🌊</span> Primary Friction Point</label>
            <input type="text" id="rChallenges" placeholder="Obstacle or cognitive hurdle...">
          </div>
          <div class="capture-cell">
            <label for="rGratitude"><span class="capture-glyph">✦</span> Grounding Gratitude</label>
            <input type="text" id="rGratitude" placeholder="Person, asset, or condition appreciated...">
          </div>
        </div>

        <!-- WSO Pillar Check-in -->
        <div class="card pillar-checkin-card">
          <div class="card-eyebrow">Agency Diagnostics · Daily Lever</div>
          <h3 class="card-title">WSO Pillar Audit</h3>
          <p class="card-subtitle">Calibrate the three fundamental conditions of action for your primary goal today (1–10).</p>

          <div class="pillar-sliders-row">
            <div class="slider-box slider-w">
              <div class="slider-top">
                <span class="slider-name">Will</span>
                <span id="jwV" class="slider-readout">5</span>
              </div>
              <input type="range" min="1" max="10" value="5" id="sliderW" aria-label="Will rating">
              <div class="slider-desc">Internal desire, commitment, intrinsic meaning</div>
            </div>

            <div class="slider-box slider-s">
              <div class="slider-top">
                <span class="slider-name">Skill</span>
                <span id="jsV" class="slider-readout">5</span>
              </div>
              <input type="range" min="1" max="10" value="5" id="sliderS" aria-label="Skill rating">
              <div class="slider-desc">Capability, knowledge, tactical execution tools</div>
            </div>

            <div class="slider-box slider-o">
              <div class="slider-top">
                <span class="slider-name">Opportunity</span>
                <span id="joV" class="slider-readout">5</span>
              </div>
              <input type="range" min="1" max="10" value="5" id="sliderO" aria-label="Opportunity rating">
              <div class="slider-desc">External access, open doors, available time & capital</div>
            </div>
          </div>
        </div>

        <!-- Plan Tomorrow -->
        <div class="card plan-card">
          <div class="card-eyebrow">Behavioral Pre-commitment</div>
          <h3 class="card-title">Tomorrow's Habit Architecture</h3>
          <p class="card-subtitle">Select the foundational routines to lock into your calendar for tomorrow.</p>

          <div id="planCategories" class="plan-categories"></div>

          <div class="plan-summary-bar">
            <div class="summary-left">
              <span class="summary-label">Committed Habits (<span id="planCount">0</span>):</span>
              <div id="selectedList" class="summary-tags"></div>
            </div>
          </div>
        </div>

        <!-- Save Button -->
        <div class="action-dock">
          <button id="saveReflect" class="btn btn-dark btn-large" type="button">Save Daily Log & Commit Plan →</button>
        </div>
      </section>

      <!-- 03 DIAGNOSTIC VIEW -->
      <section id="diagnostic" class="view" aria-labelledby="diagHeading">
        <div class="view-header">
          <div class="sec-tag">Assessment · System 03</div>
          <h2 id="diagHeading" class="view-title">WSO Agency Diagnostic</h2>
          <p class="view-subtitle">Pinpoint your active archetype and isolate the missing pillar that causes action paralysis.</p>
        </div>

        <div id="quizContent" class="quiz-container">
          <!-- Dynamically populated via JS -->
        </div>
      </section>

      <!-- 04 SCANNER VIEW -->
      <section id="scanner" class="view" aria-labelledby="scanHeading">
        <div class="view-header">
          <div class="sec-tag">Calibration · System 04</div>
          <h2 id="scanHeading" class="view-title">Scanner & Calibration Engine</h2>
          <p class="view-subtitle">Diagnose WSO bottlenecks across any life domain, or calibrate your PCF cognitive lenses.</p>
        </div>

        <!-- Sub-tabs Switcher -->
        <div class="engine-subtabs">
          <button id="btnScanGoal" class="subtab-btn active" type="button" onclick="switchScannerView('WSO')">
            <span class="subtab-num">01</span>
            <span>WSO Goals Gap Scanner</span>
          </button>
          <button id="btnScanLens" class="subtab-btn" type="button" onclick="switchScannerView('PCF')">
            <span class="subtab-num">02</span>
            <span>PCF Cognitive Lens Calibration</span>
          </button>
        </div>

        <div id="scannerContent" class="scanner-container">
          <!-- Dynamically populated via JS -->
        </div>
      </section>

      <!-- 05 HISTORY VIEW -->
      <section id="history" class="view" aria-labelledby="histHeading">
        <div class="view-header">
          <div class="sec-tag">Archive · System 05</div>
          <h2 id="histHeading" class="view-title">Your Agency Journey</h2>
          <p id="entryCount" class="view-subtitle">0 reflections logged</p>
        </div>

        <div id="historyList" class="history-timeline">
          <!-- Populated via JS -->
        </div>
      </section>

      <!-- 06 SETTINGS VIEW -->
      <section id="settings" class="view" aria-labelledby="setHeading">
        <div class="view-header">
          <div class="sec-tag">Account & Preferences · System 06</div>
          <h2 id="setHeading" class="view-title">System Settings</h2>
          <p class="view-subtitle">Manage profile telemetry, interface theme, and credential security.</p>
        </div>

        <div class="settings-grid">
          <!-- Profile Dossier -->
          <div class="card settings-card">
            <div class="card-eyebrow">Identity Profile</div>
            <h3 class="card-title">Telemetry & Account</h3>
            <div class="settings-table">
              <div class="settings-row">
                <span class="row-label">Username</span>
                <span id="setUser" class="row-value">—</span>
              </div>
              <div class="settings-row">
                <span class="row-label">Member Since</span>
                <span id="setDate" class="row-value">—</span>
              </div>
              <div class="settings-row">
                <span class="row-label">Total Reflections Logged</span>
                <span id="setEntries" class="row-value">0</span>
              </div>
            </div>
          </div>

          <!-- Appearance Options -->
          <div class="card settings-card">
            <div class="card-eyebrow">Aesthetic Mode</div>
            <h3 class="card-title">Interface Visuals</h3>
            <p class="card-subtitle">Choose between classic Swiss Warm Paper or Luxury Editorial Charcoal.</p>
            <div style="margin-top: 1rem;">
              <button id="themeToggle" class="btn btn-outline" type="button">🌙 Switch to Luxury Dark Mode</button>
            </div>
          </div>

          <!-- Password Security -->
          <div class="card settings-card">
            <div class="card-eyebrow">Security Credentials</div>
            <h3 class="card-title">Update Password</h3>
            
            <div id="passError" class="auth-feedback error" style="display:none"></div>
            <div id="passSuccess" class="auth-feedback success" style="display:none"></div>

            <div class="settings-fields">
              <div class="field-group">
                <label for="curPass">Current Password</label>
                <input type="password" id="curPass" placeholder="Enter current password">
              </div>
              <div class="field-group">
                <label for="newPass">New Password</label>
                <input type="password" id="newPass" placeholder="Min 6 characters">
              </div>
              <div class="field-group">
                <label for="conPass">Confirm New Password</label>
                <input type="password" id="conPass" placeholder="Confirm new password">
              </div>
              <button id="changePass" class="btn btn-dark" type="button" style="margin-top: 8px;">Apply Password Change</button>
            </div>
          </div>

          <!-- Sign Out Action -->
          <div class="card settings-card signout-card">
            <div class="card-eyebrow">Session Management</div>
            <h3 class="card-title">Terminate Active Session</h3>
            <p class="card-subtitle">Log out of Momentum on this browser.</p>
            <div style="margin-top: 1rem;">
              <button id="logout" class="btn btn-outline btn-danger-action" type="button">Sign Out →</button>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- Footer -->
    <footer class="app-footer">
      <div class="footer-inner">
        <div class="footer-left">
          <span class="footer-logo">QUMNI</span>
          <span class="footer-desc">· Frameworks for Human Action & Perception</span>
        </div>
        <div class="footer-right">
          <span class="footer-meta">WSO & PCF Cognitive Systems</span>
          <a href="index.html" class="footer-link">Library Home</a>
        </div>
      </div>
    </footer>
  </div>

  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js');
      });
    }
  </script>
  <script src="app.js?v=8.0"></script>
</body>
</html>
