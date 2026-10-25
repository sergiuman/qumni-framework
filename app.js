// ==========================================================================
// QUMNI · MOMENTUM CORE ENGINE (app.js)
// State Management, Voice Journal, WSO Diagnostics & Scanner
// ==========================================================================

const state = { 
  user: null, 
  entries: [], 
  today: null, 
  planned: [], 
  timer: 0, 
  timerOn: false, 
  timerInt: null, 
  editingDate: null,
  goals: [],
  wsoQuizHistory: [],
  quizIndex: 0,
  quizAnswers: [],
  scanDomain: null,
  scanW: 5,
  scanS: 5,
  scanO: 5,
  scanResult: null,
  scannerMode: 'WSO',
  scanP: 5,
  scanA: 5,
  scanR: 5,
  pcfScanResult: null,
  tempAiData: null
};

// Color Tokens & Constants
const W_C = '#E8321A', S_C = '#0066FF', O_C = '#00C65E', G_C = '#C8960C';
const P_C = '#9B59B6', A_C = '#E67E22', R_C = '#1ABC9C';

// WSO Diagnostic Assessment Bank
const QS = [
  { q: "When you contemplate your most critical unfinished objective — what is the most ruthless reason you have not acted?", opts: ["I have lost intrinsic drive or it stopped feeling meaningful", "I lack the technical competence or execution toolset required", "I genuinely lack access, capital, network, or structural time", "I want it deeply, but psychological hesitation or fear halts me"], dims: ["w", "s", "o", "w"] },
  { q: "An unscheduled Saturday unexpectedly clears. What do you naturally gravitate toward?", opts: ["Activities directly advancing your primary vision — you feel fully alive", "Deliberate practice, studying technical material, acquiring methods", "Cultivating relationships, scouting openings, and finding access doors", "Passive consumption, avoidance, or aimless drift"], dims: ["w", "s", "o", "w"] },
  { q: "How would you objectively appraise your competence in the exact domain you wish to conquer?", opts: ["High — among the most proficient practitioners in my orbit", "Moderate — firm conceptual foundation with specific tactical gaps", "Novice — genuinely at the beginning of the learning curve", "Uncalibrated — never rigorously tested under real-world conditions"], dims: ["s", "s", "s", "s"] },
  { q: "If all external constraints were dissolved right now, what would unfold?", opts: ["I would execute immediately — I know the surgical next step", "I would hesitate — my tools and systems are not yet developed", "I would charge in boldly and acquire skill in real time", "I am uncertain whether I genuinely desire the end state anymore"], dims: ["o", "s", "o", "w"] },
  { q: "The last time you abandoned an important project — what actually transpired?", opts: ["Lost commitment or was seduced by a newer distraction", "Encountered an impenetrable skill ceiling and stalled out", "An external structural barrier blocked all viable forward paths", "A tangled ambiguity of all three conditions simultaneously"], dims: ["w", "s", "o", "w"] },
  { q: "How frequently do you formulate the internal thought: 'I would, but circumstances prevent me'?", opts: ["Rarely — I locate or construct alternative leverage vectors", "Frequently — real-world systemic barriers impede forward momentum", "Occasionally — but usually it is simply a gap in technical know-how", "More accurately: 'I possess full capacity, but choose not to commit'"], dims: ["o", "o", "s", "w"] },
  { q: "Five years hence, having failed to realize your primary vision — what is the post-mortem?", opts: ["I surrendered to comfort and pursued lower-friction paths", "Critical capability deficiencies that I never systematically closed", "Structural and environmental obstacles proved insurmountable", "I attempted the climb but never possessed unwavering internal conviction"], dims: ["w", "s", "o", "w"] },
  { q: "When confronting a steep technical hurdle, what is your standard behavioral pattern?", opts: ["I dive in with obsessive energy — difficulty is intrinsically stimulating", "I persist systematically, though friction occasionally slows velocity", "I lack access to the mentorship, environments, or resources to learn", "I disengage — the capability gulf feels overwhelmingly prohibitive"], dims: ["w", "s", "o", "s"] },
  { q: "How intimately connected are you to the foundational 'Why' behind your ambition?", opts: ["Deeply visceral — it is inseparable from my core identity", "Intellectually clear, but emotionally lukewarm or distant", "Faint — I recognize its value, but feel minimal urgent resonance", "The conviction has evaporated entirely"], dims: ["w", "w", "w", "w"] },
  { q: "Ruthlessly appraised: which formulation reflects your operational state right now?", opts: ["Intense conviction and high skill, but locked out by external conditions", "High conviction and boundless opportunity, but severely lacking tactical tools", "Elite competence and open doors, but lacking the internal fire to act", "All three pillars are partially activated without decisive dominance"], dims: ["o", "s", "w", "w"] }
];

// Archetype Definitions
const ARCH = {
  w: {
    name: "The Capable Bystander",
    emoji: "✦",
    color: W_C,
    missing: "Will",
    tag: "The tools are sharp. The door is unlocked. The internal fire is absent.",
    desc: "Your Skill and Opportunity scores are strong. This is not moral failure or laziness — it is an acute systemic signal that a misalignment exists between the stated goal and your genuine values. You are operating from 'should' rather than intrinsic conviction.",
    rx: [
      "Conduct a rigorous Values Audit: what would you pursue if prestige was zero?",
      "Differentiate temporary burnout (protocol: restorative rest) from permanent misalignment (protocol: decisive pivot).",
      "Deconstruct the objective to its smallest intrinsically meaningful micro-action.",
      "Spend 60 minutes with an active practitioner who radiates genuine urgency in this domain."
    ]
  },
  s: {
    name: "The Dreaming Sprinter",
    emoji: "✦",
    color: S_C,
    missing: "Skill",
    tag: "The internal conviction burns. The arena is open. The execution tools are missing.",
    desc: "Will combined with Opportunity creates the supreme environment for accelerated learning. You are in the optimal posture for explosive growth — motivation plus access yields maximum skill acquisition velocity.",
    rx: [
      "Surgically isolate the exact capability deficit (e.g., 'negotiation', 'code architecture').",
      "Establish 24-hour feedback loops: apply one newly learned technique in a live test tomorrow.",
      "Conduct a 30-minute autopsy with an acknowledged master of this specific sub-skill.",
      "Deliberately train at the exact threshold of competence: neither trivial nor impossible."
    ]
  },
  o: {
    name: "The Competent Prisoner",
    emoji: "✦",
    color: O_C,
    missing: "Opportunity",
    tag: "High internal drive. Formidable technical skill. The external gate is locked.",
    desc: "Nothing inside your psychology or capability is broken. The constraint is purely structural — financial, geographic, network-based, or temporal. The solution must be external leverage rather than further internal contemplation.",
    rx: [
      "Classify the specific barrier: financial, social capital, regulatory, or time.",
      "Study three anomalous individuals who bypassed this precise external gate.",
      "Build a bridge relationship with one key gatekeeper in the blocked domain.",
      "Locate the closest parallel arena where your skill set immediately commands leverage."
    ]
  },
  all: {
    name: "The Developing Agent",
    emoji: "✦",
    color: G_C,
    missing: "System Balance",
    tag: "All three pillars are nascent. Broad-spectrum development required.",
    desc: "All three conditions of action are partially active, but none has reached critical mass. You are in the foundational building phase: strengthen all three simultaneously until the limiting factor reveals itself.",
    rx: [
      "Conduct a weekly Sunday self-audit scoring W, S, and O on a 1–10 scale.",
      "Apply the 30-day intervention protocol of your lowest pillar each month.",
      "Build an external accountability framework enforcing daily execution.",
      "Retake the diagnostic assessment every 60 days to track agency migration."
    ]
  }
};

// Life Domains for Scanner
const DOMAINS = [
  { id: "career", icon: "💼", name: "Career & Enterprise", ex: "Promotion, venture launch, equity buyout" },
  { id: "health", icon: "🏃", name: "Physical Vitality", ex: "Strength baseline, metabolic health, sleep architecture" },
  { id: "creative", icon: "🎨", name: "Creative Output", ex: "Manuscript, artistic portfolio, software product" },
  { id: "relationship", icon: "💬", name: "High-Trust Relationships", ex: "Partnership alignment, family grounding, boundaries" },
  { id: "learning", icon: "📚", name: "Cognitive Mastery", ex: "Language acquisition, technical craft, mental models" },
  { id: "financial", icon: "💰", name: "Capital & Sovereign Wealth", ex: "Asset allocation, debt elimination, cash flow engine" },
  { id: "impact", icon: "🌍", name: "Civic & Societal Impact", ex: "Policy intervention, non-profit architecture, institutional reform" },
  { id: "mindset", icon: "🔬", name: "Perceptual Clarity", ex: "Cognitive recalibration, focus discipline, stillness" }
];

// Foundational Habits
const HABITS = [
  { id: 'h1', name: 'Morning Priming & Hydration', cat: 'foundation' },
  { id: 'h2', name: 'Physical Conditioning (45m)', cat: 'energy' },
  { id: 'h3', name: 'Deliberate Reading (20p)', cat: 'growth' },
  { id: 'h4', name: 'Stillness / PCF Calibration', cat: 'mindset' },
  { id: 'h5', name: 'Metabolic Nutrition Protocol', cat: 'energy' },
  { id: 'h6', name: 'Zero Screens (First 60m)', cat: 'focus' },
  { id: 'h7', name: 'Deep Work Sprint (90m)', cat: 'focus' },
  { id: 'h8', name: 'Grounding Gratitude Audit', cat: 'mindset' },
  { id: 'h9', name: 'Outdoor Sunlight & Movement', cat: 'energy' },
  { id: 'h10', name: 'Evening Cognitive Debrief', cat: 'growth' },
  { id: 'h11', name: 'High-Trust Connection Touchpoint', cat: 'connection' },
  { id: 'h12', name: 'Pre-Commit Tomorrow\'s Plan', cat: 'foundation' }
];

const CATS = {
  foundation: 'Foundational Baseline',
  energy: 'Energy & Biological Drive',
  focus: 'Focus & Deep Work',
  growth: 'Skill Acquisition & Growth',
  mindset: 'Cognitive Mindset',
  connection: 'Relational Resonance'
};

const MOODS = [
  { id: 'great', label: 'Flow' },
  { id: 'good', label: 'Grounded' },
  { id: 'neutral', label: 'Equanimous' },
  { id: 'low', label: 'Friction' },
  { id: 'struggling', label: 'Tension' }
];

// Utility Helpers
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);
const escapeHtml = str => {
  if (!str) return '';
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
};

async function api(action, method = 'GET', data = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (data) opts.body = JSON.stringify(data);
  const res = await fetch('api.php?action=' + action, opts);
  return res.json();
}

const getLogicalDate = () => {
  const d = new Date();
  d.setHours(d.getHours() - 4);
  return d.toISOString().split('T')[0];
};

const fmtTime = s => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
};

const fmtDate = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const getGreeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};
const getMoodLabel = m => {
  const found = MOODS.find(x => x.id === m);
  return found ? found.label : (m || 'Equanimous');
};
const scoreColor = s => s >= 7 ? O_C : s >= 5 ? G_C : W_C;

// View Switching Helper
function switchView(viewName) {
  $$('.tab-btn').forEach(x => x.classList.toggle('active', x.dataset.view === viewName));
  $$('.m-tab').forEach(x => x.classList.toggle('active', x.dataset.view === viewName));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === viewName));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.switchView = switchView;

// Initialization
async function init() {
  // Theme init: default is Light (Warm Paper). Dark theme is enabled only if explicit in localStorage.
  if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-theme');
  } else {
    document.body.classList.remove('dark-theme');
  }

  try {
    const auth = await api('me');
    if (!auth.authenticated) {
      window.location.href = 'login.html';
      return;
    }
    state.user = auth.user;
    await loadData();
    setupUI();
    render();
  } catch (err) {
    console.error('Init error:', err);
    window.location.href = 'login.html';
  }
}

async function loadData() {
  state.today = await api('today');
  state.entries = await api('entries');
  state.planned = await api('planned');
  state.wsoQuizHistory = await api('wso-quiz');
  state.goals = await api('goals');
}

function setupUI() {
  // Navigation tabs (desktop and mobile strip)
  $$('.tab-btn, .m-tab').forEach(b => {
    b.onclick = () => {
      if (b.dataset.view) {
        switchView(b.dataset.view);
      }
    };
  });

  // Focus Timer Instrument
  const timerPlayBtn = $('timerPlay');
  const timerResetBtn = $('timerReset');
  const timerSelect = $('timerSelect');
  const timerDisplay = $('timerDisplay');
  const timerPulse = $('timerPulse');

  if (timerPlayBtn) {
    timerPlayBtn.onclick = () => {
      state.timerOn = !state.timerOn;
      timerPlayBtn.textContent = state.timerOn ? '⏸' : '▶';
      timerPlayBtn.classList.toggle('active', state.timerOn);
      if (timerPulse) timerPulse.classList.toggle('active', state.timerOn);

      if (state.timerOn) {
        state.timerInt = setInterval(() => {
          state.timer++;
          if (timerDisplay) timerDisplay.textContent = fmtTime(state.timer);
        }, 1000);
      } else {
        clearInterval(state.timerInt);
      }
    };
  }

  if (timerResetBtn) {
    timerResetBtn.onclick = () => {
      state.timerOn = false;
      state.timer = 0;
      clearInterval(state.timerInt);
      if (timerPlayBtn) {
        timerPlayBtn.textContent = '▶';
        timerPlayBtn.classList.remove('active');
      }
      if (timerPulse) timerPulse.classList.remove('active');
      if (timerDisplay) timerDisplay.textContent = '00:00';
    };
  }

  if (timerSelect) {
    timerSelect.onchange = e => {
      const val = e.target.value;
      if ($('timerLabel')) $('timerLabel').textContent = val;
    };
  }

  // Voice Recording Module
  let mediaRecorder = null;
  let audioChunks = [];
  let recTimerInt = null;
  let recSeconds = 0;

  const micBtn = $('micBtn');
  if (micBtn) {
    micBtn.onclick = async () => {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = e => {
          if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
          stream.getTracks().forEach(track => track.stop());
          micBtn.classList.remove('recording');
          $('recStatus').textContent = 'Synthesizing voice debrief...';
          clearInterval(recTimerInt);
          $('recTimer').style.display = 'none';
          $('aiProcessing').style.display = 'block';
          $('voiceRecorder').style.display = 'none';

          const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
          const formData = new FormData();
          formData.append('audio', audioBlob, 'journal.webm');

          try {
            const res = await fetch('api.php?action=transcribe', {
              method: 'POST',
              body: formData
            });
            const data = await res.json();
            $('aiProcessing').style.display = 'none';

            if (data.success) {
              $('aiResult').style.display = 'block';
              $('transcriptText').textContent = '"' + data.transcript + '"';
              state.tempAiData = data.extracted;

              let html = `<div><strong>Energy Baseline:</strong> ${data.extracted.energy || 5}/10 &bull; <strong>Emotional Valence:</strong> ${data.extracted.mood || 'Equanimous'}</div>`;
              html += `<div><strong>Sleep Recovery:</strong> ${data.extracted.sleep || 5}/10 &bull; <strong>Nutrition:</strong> ${data.extracted.food || 5}/10</div>`;
              html += `<div style="margin-top:8px"><strong>Operational Summary:</strong> ${escapeHtml(data.extracted.reflection_practical || 'None recorded')}</div>`;
              html += `<div><strong>Decisive Win:</strong> ${escapeHtml(data.extracted.wins || 'None recorded')}</div>`;
              
              if (data.extracted.habits && data.extracted.habits.length > 0) {
                html += `<div style="margin-top:6px"><strong>Habits Recognized:</strong> ${data.extracted.habits.length} executed</div>`;
              }
              if (data.extracted.planned_habits && data.extracted.planned_habits.length > 0) {
                html += `<div><strong>Tomorrow Commitments:</strong> ${data.extracted.planned_habits.length} selected</div>`;
              }
              $('extractedDataPre').innerHTML = html;

            } else {
              alert('Voice synthesis error: ' + (data.error || 'Unknown'));
              $('voiceRecorder').style.display = 'flex';
              $('recStatus').textContent = 'Standby · Tap microphone to record daily reflection';
            }
          } catch (err) {
            $('aiProcessing').style.display = 'none';
            $('voiceRecorder').style.display = 'flex';
            alert('Failed to connect to synthesis endpoint.');
            $('recStatus').textContent = 'Standby · Tap microphone to record daily reflection';
          }
        };

        mediaRecorder.start();
        micBtn.classList.add('recording');
        $('recStatus').textContent = 'Recording reflection... Tap again to conclude';

        recSeconds = 0;
        $('recTimer').style.display = 'block';
        $('recTimer').textContent = '00:00';
        recTimerInt = setInterval(() => {
          recSeconds++;
          $('recTimer').textContent = fmtTime(recSeconds);
          if (recSeconds >= 300) {
            mediaRecorder.stop();
          }
        }, 1000);

      } catch (err) {
        alert('Microphone access denied or unavailable in this browser context.');
      }
    };
  }

  // Confirm AI Synthesis
  if ($('saveAiData')) {
    $('saveAiData').onclick = async () => {
      $('saveAiData').textContent = 'Applying Data...';
      Object.assign(state.today, state.tempAiData);
      
      if (state.tempAiData.habits && Array.isArray(state.tempAiData.habits)) {
        state.today.habits = state.tempAiData.habits;
      }
      
      if (state.tempAiData.planned_habits && Array.isArray(state.tempAiData.planned_habits)) {
        state.planned = state.tempAiData.planned_habits;
        renderPlanSummary();
        $$('#planCategories button').forEach(b => b.classList.toggle('active', state.planned.includes(b.dataset.id)));
      }

      if (state.tempAiData.wso_w) {
        if ($('sliderW')) { $('sliderW').value = state.tempAiData.wso_w; $('jwV').textContent = state.tempAiData.wso_w; }
        state.today.wso_w = state.tempAiData.wso_w;
      }
      if (state.tempAiData.wso_s) {
        if ($('sliderS')) { $('sliderS').value = state.tempAiData.wso_s; $('jsV').textContent = state.tempAiData.wso_s; }
        state.today.wso_s = state.tempAiData.wso_s;
      }
      if (state.tempAiData.wso_o) {
        if ($('sliderO')) { $('sliderO').value = state.tempAiData.wso_o; $('joV').textContent = state.tempAiData.wso_o; }
        state.today.wso_o = state.tempAiData.wso_o;
      }

      await saveLogAndPlan();
      $('saveAiData').textContent = 'Confirm & Apply to Log →';
      $('aiResult').style.display = 'none';
      $('voiceRecorder').style.display = 'flex';
      $('recStatus').textContent = 'Reflection Saved! Tap to record another debrief.';
    };
  }

  if ($('discardAiData')) {
    $('discardAiData').onclick = () => {
      state.tempAiData = null;
      $('aiResult').style.display = 'none';
      $('voiceRecorder').style.display = 'flex';
      $('recStatus').textContent = 'Standby · Tap microphone to record daily reflection';
    };
  }

  // WSO Sliders Manual Inputs
  if ($('sliderW')) {
    $('sliderW').oninput = e => {
      $('jwV').textContent = e.target.value;
      state.today.wso_w = parseInt(e.target.value);
    };
  }
  if ($('sliderS')) {
    $('sliderS').oninput = e => {
      $('jsV').textContent = e.target.value;
      state.today.wso_s = parseInt(e.target.value);
    };
  }
  if ($('sliderO')) {
    $('sliderO').oninput = e => {
      $('joV').textContent = e.target.value;
      state.today.wso_o = parseInt(e.target.value);
    };
  }

  // Goals Manual Add
  if ($('addGoalBtn')) $('addGoalBtn').onclick = window.addGoal;
  if ($('dashGoalIn')) {
    $('dashGoalIn').onkeydown = e => { if (e.key === 'Enter') window.addGoal(); };
  }

  // Reflection Manual Inputs
  if ($('rPractical')) $('rPractical').oninput = e => state.today.reflection_practical = e.target.value;
  if ($('rEmotional')) $('rEmotional').oninput = e => state.today.reflection_emotional = e.target.value;
  if ($('rIdentity')) $('rIdentity').oninput = e => state.today.reflection_identity = e.target.value;
  if ($('rWins')) $('rWins').oninput = e => state.today.wins = e.target.value;
  if ($('rChallenges')) $('rChallenges').oninput = e => state.today.challenges = e.target.value;
  if ($('rGratitude')) $('rGratitude').oninput = e => state.today.gratitude = e.target.value;

  // Plan Categories Population
  const cats = {};
  HABITS.forEach(h => {
    if (!cats[h.cat]) cats[h.cat] = [];
    cats[h.cat].push(h);
  });
  
  if ($('planCategories')) {
    $('planCategories').innerHTML = Object.entries(cats).map(([c, hs]) =>
      '<div class="category"><h4>' + CATS[c] + '</h4><div class="list">' +
      hs.map(h => '<button type="button" data-id="' + h.id + '"><span class="name">' + h.name + '</span><span class="check">✓</span></button>').join('') +
      '</div></div>'
    ).join('');

    $$('#planCategories button').forEach(b => {
      b.onclick = () => {
        const i = state.planned.indexOf(b.dataset.id);
        if (i === -1) state.planned.push(b.dataset.id);
        else state.planned.splice(i, 1);
        b.classList.toggle('active', state.planned.includes(b.dataset.id));
        renderPlanSummary();
      };
    });
  }

  // Save Reflection & Plan Button
  if ($('saveReflect')) $('saveReflect').onclick = saveLogAndPlan;

  // Theme Toggle in Settings
  if ($('themeToggle')) {
    const isDark = document.body.classList.contains('dark-theme');
    $('themeToggle').textContent = isDark ? '☀️ Switch to Warm Paper Mode' : '🌙 Switch to Luxury Dark Mode';

    $('themeToggle').onclick = () => {
      document.body.classList.toggle('dark-theme');
      const nowDark = document.body.classList.contains('dark-theme');
      localStorage.setItem('theme', nowDark ? 'dark' : 'light');
      $('themeToggle').textContent = nowDark ? '☀️ Switch to Warm Paper Mode' : '🌙 Switch to Luxury Dark Mode';
    };
  }

  // Password Security Form
  if ($('changePass')) {
    $('changePass').onclick = async () => {
      $('passError').style.display = 'none';
      $('passSuccess').style.display = 'none';

      const cur = $('curPass').value;
      const nw = $('newPass').value;
      const con = $('conPass').value;

      if (nw !== con) {
        $('passError').textContent = 'Passwords do not match.';
        $('passError').style.display = 'block';
        return;
      }
      if (nw.length < 6) {
        $('passError').textContent = 'New password must be at least 6 characters.';
        $('passError').style.display = 'block';
        return;
      }

      const res = await api('change-password', 'POST', { currentPassword: cur, newPassword: nw });
      if (res.success) {
        $('passSuccess').textContent = 'Password successfully updated.';
        $('passSuccess').style.display = 'block';
        $('curPass').value = $('newPass').value = $('conPass').value = '';
      } else {
        $('passError').textContent = res.error || 'Failed to change password.';
        $('passError').style.display = 'block';
      }
    };
  }

  // Logout
  if ($('logout')) {
    $('logout').onclick = async () => {
      await api('logout', 'POST');
      window.location.href = 'login.html';
    };
  }
}

async function saveLogAndPlan() {
  state.today.completed = true;
  state.today.date = state.editingDate || state.today.date || getLogicalDate();

  const res = await api('save-entry', 'POST', state.today);
  state.today = res;
  state.entries = await api('entries');
  await api('planned', 'POST', { habits: state.planned });

  const auth = await api('me');
  state.user = auth.user;

  renderDashboard();
  renderHistory();
  renderSettings();
  renderLog();

  if ($('trackNote')) {
    $('trackNote').textContent = '✓ Daily Log & Habit Commitment Confirmed';
    setTimeout(() => { if ($('trackNote')) $('trackNote').textContent = ''; }, 3500);
  }
}

function render() {
  renderDashboard();
  renderLog();
  renderDiagnostic();
  renderScanner();
  renderHistory();
  renderSettings();
}

function renderDashboard() {
  if ($('greeting') && state.user) {
    $('greeting').textContent = getGreeting() + ', ' + state.user.username;
  }
  if ($('dateText')) {
    $('dateText').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  if ($('streakBadge') && state.user) {
    if (state.user.streak > 0) {
      $('streakBadge').style.display = 'inline-flex';
      $('streakBadge').textContent = '🔥 ' + state.user.streak + ' Day' + (state.user.streak > 1 ? 's' : '') + ' Consecutive';
    } else {
      $('streakBadge').style.display = 'none';
    }
  }

  const t = state.today || {};
  if ($('sSleep')) $('sSleep').textContent = t.sleep || '—';
  if ($('sEnergy')) $('sEnergy').textContent = t.energy || '—';
  if ($('sHabits')) $('sHabits').textContent = (t.habits || []).length;
  if ($('sMood')) $('sMood').textContent = getMoodLabel(t.mood);

  if ($('focusCard')) {
    if (state.planned.length > 0) {
      $('focusCard').style.display = 'block';
      $('focusList').innerHTML = state.planned.map(id => {
        const h = HABITS.find(x => x.id === id);
        const done = (t.habits || []).includes(id);
        return h ? '<div class="habit ' + (done ? 'done' : '') + '">' +
          '<span>' + h.name + '</span>' +
          (done ? '<span style="font-weight:700">✓ Done</span>' : '<span style="color:var(--muted)">Pending</span>') +
          '</div>' : '';
      }).join('');
    } else {
      $('focusCard').style.display = 'none';
    }
  }

  if ($('weekGrid')) {
    let weekHtml = '';
    const todayStr = getLogicalDate();
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setHours(d.getHours() - 4);
      d.setDate(d.getDate() - (6 - i));
      const ds = d.toISOString().split('T')[0];
      const e = state.entries.find(x => x.date === ds);
      const isToday = ds === todayStr;
      weekHtml += '<div class="day ' + (isToday ? 'today' : '') + ' ' + (e && e.completed ? 'done' : '') + '">' +
        '<span class="name">' + d.toLocaleDateString('en-US', { weekday: 'short' }) + '</span>' +
        '<span class="num">' + d.getDate() + '</span>' +
        (e && e.completed ? '<span class="check">✓</span>' : '<span style="opacity:0.2">—</span>') +
        '</div>';
    }
    $('weekGrid').innerHTML = weekHtml;
  }

  renderWsoProfileCard();
  renderDashboardGoals();
}

function renderWsoProfileCard() {
  const container = $('wsoProfileCard');
  if (!container) return;

  const latestResult = state.wsoQuizHistory[0];
  if (latestResult) {
    const arch = ARCH[latestResult.arch_key] || ARCH.all;
    container.style.display = 'block';
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:1.5rem">
        <div style="flex:1;min-width:280px">
          <div class="card-eyebrow">Diagnosed Agency Archetype</div>
          <h3 class="card-title" style="display:flex;align-items:center;gap:0.5rem;font-size:1.35rem;color:${arch.color}">
            <span>${arch.name}</span>
          </h3>
          <p class="card-subtitle" style="margin-bottom:0.75rem">Missing pillar: <strong style="color:${arch.color};letter-spacing:0.05em">${arch.missing.toUpperCase()}</strong> &bull; "${escapeHtml(arch.tag)}"</p>
          <button class="btn btn-outline" style="font-size:0.62rem;padding:0.45rem 1rem" onclick="switchView('diagnostic')">Review Protocol & Retake →</button>
        </div>
        <div style="display:flex;gap:1.25rem;background:var(--bg);padding:0.85rem 1.25rem;border:1px solid var(--border);border-radius:var(--radius-xs)">
          ${[
            { l: 'WILL', v: latestResult.w_pct, c: W_C },
            { l: 'SKILL', v: latestResult.s_pct, c: S_C },
            { l: 'OPPORTUNITY', v: latestResult.o_pct, c: O_C }
          ].map(b => `
            <div style="text-align:center">
              <div style="font-family:var(--mono);font-size:0.58rem;color:${b.c};font-weight:600;letter-spacing:0.12em">${b.l}</div>
              <div style="font-family:var(--sans);font-weight:800;color:${b.c};font-size:1.5rem;line-height:1.2">${b.v}%</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } else {
    container.style.display = 'none';
  }
}

function renderDashboardGoals() {
  const container = $('dashboardGoals');
  if (!container) return;
  
  if (state.goals.length === 0) {
    container.innerHTML = '<span style="color:var(--muted);font-family:var(--serif);font-style:italic;font-size:0.95rem;display:block;padding:1.25rem 0;">No active objectives defined yet. Establish your highest leverage priority below.</span>';
    return;
  }
  
  container.innerHTML = state.goals.map(g => {
    return `
      <div class="goal-item">
        <div style="display:flex;align-items:center;gap:0.75rem;cursor:pointer;flex:1" onclick="toggleWsoGoal(${g.id}, ${!g.done})">
          <div class="goal-check ${g.done ? 'done' : ''}">${g.done ? '✓' : ''}</div>
          <span class="goal-text ${g.done ? 'done' : ''}">${escapeHtml(g.text)}</span>
        </div>
        <button class="btn btn-outline" style="font-size:0.6rem;padding:0.35rem 0.75rem" onclick="deleteWsoGoal(${g.id})">Delete</button>
      </div>
    `;
  }).join('');
}

window.toggleWsoGoal = async function(id, done) {
  await api('goals', 'PUT', { id, done });
  const g = state.goals.find(x => x.id === id);
  if (g) g.done = done;
  renderDashboardGoals();
};

window.deleteWsoGoal = async function(id) {
  await api('goals', 'DELETE', { id });
  state.goals = state.goals.filter(x => x.id !== id);
  renderDashboardGoals();
};

window.addGoal = async function() {
  const inp = $('dashGoalIn');
  if (!inp || !inp.value.trim()) return;
  const res = await api('goals', 'POST', { text: inp.value.trim() });
  if (res.success) {
    state.goals.push(res.goal);
    inp.value = '';
    renderDashboardGoals();
  }
};

function renderLog() {
  const t = state.today || {};
  if (t.completed) {
    if ($('recStatus')) $('recStatus').textContent = 'Reflection already logged today. Tap microphone to update audio.';
  } else {
    if ($('recStatus')) $('recStatus').textContent = 'Standby · Tap microphone to record daily reflection';
  }

  if ($('rPractical')) $('rPractical').value = t.reflection_practical || '';
  if ($('rEmotional')) $('rEmotional').value = t.reflection_emotional || '';
  if ($('rIdentity')) $('rIdentity').value = t.reflection_identity || '';
  if ($('rWins')) $('rWins').value = t.wins || '';
  if ($('rChallenges')) $('rChallenges').value = t.challenges || '';
  if ($('rGratitude')) $('rGratitude').value = t.gratitude || '';

  const w = t.wso_w || 5;
  const s = t.wso_s || 5;
  const o = t.wso_o || 5;
  if ($('sliderW')) { $('sliderW').value = w; $('jwV').textContent = w; }
  if ($('sliderS')) { $('sliderS').value = s; $('jsV').textContent = s; }
  if ($('sliderO')) { $('sliderO').value = o; $('joV').textContent = o; }

  $$('#planCategories button').forEach(b => b.classList.toggle('active', state.planned.includes(b.dataset.id)));
  renderPlanSummary();
}

function renderPlanSummary() {
  if (!$('planCount') || !$('selectedList')) return;
  $('planCount').textContent = state.planned.length;
  if (state.planned.length === 0) {
    $('selectedList').innerHTML = '<span style="color:var(--muted);font-family:var(--serif);font-style:italic;font-size:0.9rem">Select target habits above to commit your behavioral architecture.</span>';
  } else {
    $('selectedList').innerHTML = state.planned.map(id => {
      const h = HABITS.find(x => x.id === id);
      return h ? '<span class="item">' + h.name + '</span>' : '';
    }).join('');
  }
}

function renderHistory() {
  if (!$('entryCount') || !$('historyList')) return;
  $('entryCount').textContent = state.entries.length + ' reflection' + (state.entries.length === 1 ? '' : 's') + ' logged';

  if (state.entries.length === 0) {
    $('historyList').innerHTML = '<div class="card" style="text-align:center;padding:3rem 1.5rem"><p style="font-family:var(--serif);font-style:italic;font-size:1.15rem;color:var(--muted)">No reflections recorded yet. Your journey begins with today\'s debrief.</p></div>';
    return;
  }

  $('historyList').innerHTML = state.entries.map((e, i) => {
    const avg = ((e.sleep || 0) + (e.energy || 0)) / 2;
    const habits = e.habits || [];
    return `
      <div class="history-card">
        <button class="top" type="button" onclick="toggleHistory(${i})">
          <div class="left">
            <span class="score" style="background:${scoreColor(avg)}">${avg > 0 ? avg.toFixed(1) : '—'}</span>
            <div>
              <div class="date">${fmtDate(e.date)}</div>
              <div class="meta">${habits.length} habits completed &bull; ${getMoodLabel(e.mood)}</div>
            </div>
          </div>
          <span class="arrow">▶</span>
        </button>
        <div id="hd${i}" class="details">
          <div class="row"><span>Sleep Score:</span><span>${e.sleep || '—'}/10</span></div>
          <div class="row"><span>Energy Capacity:</span><span>${e.energy || '—'}/10</span></div>
          <div class="row"><span>Nutrition Baseline:</span><span>${e.food || '—'}/10</span></div>
          ${e.wins ? `<div class="text"><strong>Decisive Win:</strong> ${escapeHtml(e.wins)}</div>` : ''}
          ${e.challenges ? `<div class="text"><strong>Primary Friction:</strong> ${escapeHtml(e.challenges)}</div>` : ''}
          ${e.gratitude ? `<div class="text"><strong>Grounding Gratitude:</strong> ${escapeHtml(e.gratitude)}</div>` : ''}
          ${e.reflection_practical ? `<div class="text"><strong>Practical Outputs:</strong> ${escapeHtml(e.reflection_practical)}</div>` : ''}
          ${habits.length > 0 ? `
            <div class="text">
              <strong>Habits Locked:</strong>
              <div class="habit-list">
                ${habits.map(id => {
                  const h = HABITS.find(x => x.id === id);
                  return h ? `<span class="habit-tag">${h.name}</span>` : '';
                }).join('')}
              </div>
            </div>
          ` : ''}
          <div style="margin-top:1.25rem;text-align:right">
            <button class="btn btn-outline" style="font-size:0.62rem;padding:0.45rem 1rem" onclick="editEntry(${i})">Edit This Entry →</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

window.toggleHistory = function(i) {
  const el = $('hd' + i);
  if (el) el.classList.toggle('open');
};

window.editEntry = function(i) {
  state.today = JSON.parse(JSON.stringify(state.entries[i]));
  state.editingDate = state.today.date;

  if ($('trackNote')) $('trackNote').textContent = 'Editing reflection for ' + fmtDate(state.today.date);
  switchView('log');
  renderLog();
};

function renderSettings() {
  if (state.user) {
    if ($('setUser')) $('setUser').textContent = state.user.username;
    if ($('setDate')) $('setDate').textContent = state.user.created_at ? new Date(state.user.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';
    if ($('setEntries')) $('setEntries').textContent = state.entries.length;
  }
}

// 03 Diagnostic Assessment Render
function renderDiagnostic() {
  const container = $('quizContent');
  if (!container) return;

  if (state.quizIndex < QS.length) {
    const q = QS[state.quizIndex];
    container.innerHTML = `
      <div class="sec-tag">Assessment · Step ${state.quizIndex + 1} of ${QS.length}</div>
      <div class="q-bar"><div class="q-fill" style="width: ${(state.quizIndex / QS.length) * 100}%"></div></div>
      <div class="q-text">${q.q}</div>
      <div style="margin-bottom: 2rem;">
        ${q.opts.map((o, i) => `
          <button type="button" class="q-opt ${state.quizAnswers[state.quizIndex] === i ? 'sel' : ''}" onclick="selectQuizAnswer(${i})">
            <span class="q-opt-key">${'ABCD'[i]}</span>
            <span>${o}</span>
          </button>
        `).join('')}
      </div>
      <div class="q-nav">
        <button class="btn btn-outline" type="button" onclick="prevQuizQuestion()" ${state.quizIndex === 0 ? 'disabled' : ''}>← Previous</button>
        <span style="font-family:var(--mono);font-size:0.65rem;color:var(--muted)">${state.quizAnswers[state.quizIndex] !== undefined ? 'Answer Selected' : 'Choose option to proceed'}</span>
        <button class="btn btn-dark" type="button" onclick="nextQuizQuestion()" ${state.quizAnswers[state.quizIndex] === undefined ? 'disabled' : ''}>${state.quizIndex === QS.length - 1 ? 'Analyze Archetype →' : 'Next Step →'}</button>
      </div>
    `;
    return;
  }

  const latestResult = state.wsoQuizHistory[0];
  if (!latestResult) {
    container.innerHTML = `
      <div class="card" style="text-align:center;padding:4rem 2rem">
        <div class="sec-tag" style="justify-content:center">Diagnostic Engine</div>
        <h3 class="card-title" style="font-size:1.8rem;margin:0.75rem 0">Calibrate Your Agency Archetype</h3>
        <p class="card-subtitle" style="max-width:520px;margin:0 auto 2rem">Take the 10-question WSO diagnostic to isolate whether your primary bottleneck is Will, Skill, or Opportunity.</p>
        <button class="btn btn-dark btn-large" onclick="startWsoQuiz()">Begin Diagnostic Assessment →</button>
      </div>
    `;
    return;
  }

  const arch = ARCH[latestResult.arch_key] || ARCH.all;
  container.innerHTML = `
    <div class="card" style="text-align:center;padding:3rem 2rem;border-top:3px solid ${arch.color};margin-bottom:1.5rem">
      <div class="card-eyebrow">Diagnosed Agency Archetype</div>
      <h2 style="font-family:var(--sans);font-weight:800;font-size:2.2rem;color:${arch.color};margin-bottom:0.25rem">${arch.name}</h2>
      <div style="font-family:var(--mono);font-size:0.68rem;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:var(--muted);margin-bottom:0.5rem">CRITICAL BOTTLENECK: <strong style="color:${arch.color}">${arch.missing.toUpperCase()}</strong></div>
      <p style="font-family:var(--serif);font-style:italic;font-size:1.15rem;color:var(--ink);max-width:540px;margin:0 auto 1.5rem">"${arch.tag}"</p>
      
      <div class="r-bars">
        ${[
          { l: 'WILL', v: latestResult.w_pct, c: W_C },
          { l: 'SKILL', v: latestResult.s_pct, c: S_C },
          { l: 'OPP.', v: latestResult.o_pct, c: O_C }
        ].map(b => `
          <div class="r-col">
            <div class="r-label" style="color:${b.c}">${b.l}</div>
            <div class="r-track"><div class="r-fill" style="height:${b.v}%;background:${b.c}"></div></div>
            <div class="r-pct" style="color:${b.c}">${b.v}%</div>
          </div>
        `).join('')}
      </div>
      
      <p style="font-family:var(--serif);font-size:1.05rem;line-height:1.7;color:var(--ink);max-width:620px;margin:0 auto;text-align:left">${arch.desc}</p>
    </div>

    <div class="card" style="border-top:3px solid var(--gold)">
      <div class="card-eyebrow">Prescriptive Action Protocol</div>
      <h3 class="card-title">30-Day Precision Interventions</h3>
      <p class="card-subtitle">Deploy these four targeted behavioral levers to eliminate your primary action gap:</p>
      <div style="display:flex;flex-direction:column;gap:0.85rem">
        ${arch.rx.map((r, idx) => `
          <div style="display:flex;gap:0.85rem;align-items:flex-start">
            <span style="font-family:var(--mono);font-size:0.65rem;font-weight:700;color:var(--gold);background:var(--gold-bg);padding:0.2rem 0.5rem;border-radius:var(--radius-xs);flex-shrink:0">0${idx+1}</span>
            <span style="font-family:var(--serif);font-size:1.05rem;line-height:1.55;color:var(--ink)">${r}</span>
          </div>
        `).join('')}
      </div>
    </div>

    <div style="text-align:center;margin:2rem 0">
      <button class="btn btn-dark" onclick="startWsoQuiz()">Retake Diagnostic Assessment →</button>
    </div>

    ${state.wsoQuizHistory.length > 1 ? `
      <div class="card">
        <div class="card-eyebrow">Assessment Telemetry</div>
        <h3 class="card-title">Diagnostic History</h3>
        <div style="margin-top:1rem;border-top:1px solid var(--border)">
          ${state.wsoQuizHistory.slice(1).map(h => {
            const a = ARCH[h.arch_key] || ARCH.all;
            return `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:0.85rem 0;border-bottom:1px solid var(--border);font-family:var(--mono);font-size:0.75rem">
                <span style="color:var(--muted)">${new Date(h.date).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}</span>
                <span style="font-family:var(--sans);font-weight:700;color:${a.color}">${a.name}</span>
                <span style="color:var(--muted)">W:${h.w_pct}% S:${h.s_pct}% O:${h.o_pct}%</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    ` : ''}
  `;
}

window.startWsoQuiz = function() {
  state.quizIndex = 0;
  state.quizAnswers = [];
  renderDiagnostic();
};

window.selectQuizAnswer = function(i) {
  state.quizAnswers[state.quizIndex] = i;
  renderDiagnostic();
};

window.prevQuizQuestion = function() {
  if (state.quizIndex > 0) {
    state.quizIndex--;
    renderDiagnostic();
  }
};

window.nextQuizQuestion = async function() {
  if (state.quizAnswers[state.quizIndex] === undefined) return;
  
  if (state.quizIndex < QS.length - 1) {
    state.quizIndex++;
    renderDiagnostic();
  } else {
    let sc = { w: 0, s: 0, o: 0 };
    QS.forEach((q, i) => {
      if (state.quizAnswers[i] !== undefined) {
        sc[q.dims[state.quizAnswers[i]]] += 3;
      }
    });
    const tot = sc.w + sc.s + sc.o || 1;
    const pcts = {
      w: Math.round(sc.w / tot * 100),
      s: Math.round(sc.s / tot * 100),
      o: Math.round(sc.o / tot * 100)
    };
    const vals = Object.entries(sc);
    const minK = vals.sort((a, b) => a[1] - b[1])[0][0];
    const range = Math.max(sc.w, sc.s, sc.o) - Math.min(sc.w, sc.s, sc.o);
    const archKey = range < 3 ? 'all' : minK;

    const quizResult = {
      w_pct: pcts.w,
      s_pct: pcts.s,
      o_pct: pcts.o,
      arch_key: archKey
    };

    await api('wso-quiz', 'POST', quizResult);
    state.wsoQuizHistory = await api('wso-quiz');
    state.quizIndex = QS.length;
    
    renderDiagnostic();
    renderDashboard();
  }
};

// 04 Scanner & Calibration Render
function renderScanner() {
  const container = $('scannerContent');
  if (!container) return;

  if (state.scannerMode === 'WSO') {
    if (!state.scanDomain) {
      container.innerHTML = `
        <div class="card-eyebrow">Life Domain Vector</div>
        <h3 class="card-title">Select an Arena to Diagnose:</h3>
        <p class="card-subtitle">Isolate where action paralysis or friction is currently concentrated.</p>
        <div class="domain-grid">
          ${DOMAINS.map(d => `
            <button type="button" class="domain-btn" onclick="selectScanDomain('${d.id}')">
              <span class="domain-icon">${d.icon}</span>
              <div class="domain-name">${d.name}</div>
              <div class="domain-ex">${d.ex}</div>
            </button>
          `).join('')}
        </div>
      `;
      return;
    }

    const dom = DOMAINS.find(d => d.id === state.scanDomain);
    container.innerHTML = `
      <div class="card" style="display:flex;justify-content:space-between;align-items:center;padding:1.5rem 2rem;margin-bottom:1.5rem">
        <div style="display:flex;gap:1rem;align-items:center">
          <span style="font-size:1.8rem">${dom.icon}</span>
          <div>
            <div class="card-eyebrow">Selected Domain</div>
            <h3 class="card-title" style="margin:0">${dom.name}</h3>
          </div>
        </div>
        <button class="btn btn-outline" style="font-size:0.62rem;padding:0.45rem 1rem" onclick="selectScanDomain(null)">← Change Arena</button>
      </div>
      
      <div class="card">
        <div class="card-eyebrow">Tri-Pillar Audit</div>
        <h3 class="card-title">Rate Current Capacity in ${dom.name} (1–10)</h3>
        <p class="card-subtitle">Calibrate Will (desire), Skill (capability), and Opportunity (external access).</p>
        
        <div class="slider-row" style="margin:1.5rem 0">
          <div class="slider-cell">
            <div class="slider-lbl" style="color:${W_C}">Will</div>
            <div class="slider-val" id="swV" style="color:${W_C}">${state.scanW}</div>
            <input type="range" min="1" max="10" value="${state.scanW}" style="accent-color:${W_C};width:90%" oninput="updateScanVal('W', this.value)">
          </div>
          <div class="slider-cell">
            <div class="slider-lbl" style="color:${S_C}">Skill</div>
            <div class="slider-val" id="ssV" style="color:${S_C}">${state.scanS}</div>
            <input type="range" min="1" max="10" value="${state.scanS}" style="accent-color:${S_C};width:90%" oninput="updateScanVal('S', this.value)">
          </div>
          <div class="slider-cell">
            <div class="slider-lbl" style="color:${O_C}">Opportunity</div>
            <div class="slider-val" id="soV" style="color:${O_C}">${state.scanO}</div>
            <input type="range" min="1" max="10" value="${state.scanO}" style="accent-color:${O_C};width:90%" oninput="updateScanVal('O', this.value)">
          </div>
        </div>
        
        <button class="btn btn-dark btn-full" onclick="executeScan()">Diagnose Action Gap →</button>
      </div>
      
      ${state.scanResult ? `
        <div class="card" style="border-top:3px solid ${state.scanResult.color};margin-top:1.5rem">
          <div class="card-eyebrow">Diagnostic Conclusion</div>
          <h3 class="card-title" style="color:${state.scanResult.color}">${state.scanResult.name}</h3>
          <p class="card-subtitle">"${state.scanResult.tag}"</p>
          <p style="font-family:var(--serif);font-size:1.05rem;line-height:1.65;color:var(--ink);margin-bottom:1.5rem">${state.scanResult.desc}</p>
          <div class="card-eyebrow" style="color:var(--gold)">Precision Prescriptions</div>
          <div style="display:flex;flex-direction:column;gap:0.75rem">
            ${state.scanResult.rx.map(r => `
              <div style="display:flex;gap:0.75rem;align-items:flex-start">
                <span style="color:var(--gold);font-weight:700">→</span>
                <span style="font-family:var(--serif);font-size:1rem;color:var(--ink);line-height:1.5">${r}</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;
  } else {
    // PCF Cognitive Lens Mode
    container.innerHTML = `
      <div class="card">
        <div class="card-eyebrow">Cognitive Architecture · PCF Lenses</div>
        <h3 class="card-title">Filter Distortion Calibration (1–10)</h3>
        <p class="card-subtitle">Rate how undistorted your perceptual apparatus is: from 1 (severe bias/delusion) to 10 (perfect calibration to empirical reality).</p>
        
        <div class="slider-row" style="margin:1.5rem 0">
          <div class="slider-cell">
            <div class="slider-lbl" style="color:${P_C}">Perception Clarity</div>
            <div class="slider-val" id="spV" style="color:${P_C}">${state.scanP || 5}</div>
            <input type="range" min="1" max="10" value="${state.scanP || 5}" style="accent-color:${P_C};width:90%" oninput="updatePcfVal('P', this.value)">
          </div>
          <div class="slider-cell">
            <div class="slider-lbl" style="color:${A_C}">Appraisal Accuracy</div>
            <div class="slider-val" id="saV" style="color:${A_C}">${state.scanA || 5}</div>
            <input type="range" min="1" max="10" value="${state.scanA || 5}" style="accent-color:${A_C};width:90%" oninput="updatePcfVal('A', this.value)">
          </div>
          <div class="slider-cell">
            <div class="slider-lbl" style="color:${R_C}">Recalibration Rate</div>
            <div class="slider-val" id="srV" style="color:${R_C}">${state.scanR || 5}</div>
            <input type="range" min="1" max="10" value="${state.scanR || 5}" style="accent-color:${R_C};width:90%" oninput="updatePcfVal('R', this.value)">
          </div>
        </div>
        
        <button class="btn btn-dark btn-full" onclick="executePcfScan()">Calibrate Cognitive Lens →</button>
      </div>
      
      ${state.pcfScanResult ? `
        <div class="card" style="border-top:3px solid ${state.pcfScanResult.color};margin-top:1.5rem">
          <div class="card-eyebrow">Lens Diagnosis</div>
          <h3 class="card-title" style="color:${state.pcfScanResult.color}">${state.pcfScanResult.name}</h3>
          <p class="card-subtitle">"${state.pcfScanResult.insight}"</p>
          <div class="card-eyebrow" style="color:var(--gold);margin-top:1rem">De-biasing Action Protocol</div>
          <div style="display:flex;flex-direction:column;gap:0.75rem;margin-bottom:1.5rem">
            ${state.pcfScanResult.actions.map(r => `
              <div style="display:flex;gap:0.75rem;align-items:flex-start">
                <span style="color:var(--gold);font-weight:700">→</span>
                <span style="font-family:var(--serif);font-size:1rem;color:var(--ink);line-height:1.5">${r}</span>
              </div>
            `).join('')}
          </div>
          <div style="border-top:1px solid var(--border);padding-top:1rem;text-align:right">
            <a href="pcf.html" class="nav-cta" style="display:inline-block">Read Full PCF Framework Paper →</a>
          </div>
        </div>
      ` : ''}
    `;
  }
}

window.switchScannerView = function(mode) {
  state.scannerMode = mode;
  if ($('btnScanGoal')) $('btnScanGoal').classList.toggle('active', mode === 'WSO');
  if ($('btnScanLens')) $('btnScanLens').classList.toggle('active', mode === 'PCF');
  renderScanner();
};

window.selectScanDomain = function(id) {
  state.scanDomain = id;
  state.scanResult = null;
  renderScanner();
};

window.updateScanVal = function(pillar, val) {
  val = parseInt(val);
  if (pillar === 'W') { state.scanW = val; if ($('swV')) $('swV').textContent = val; }
  if (pillar === 'S') { state.scanS = val; if ($('ssV')) $('ssV').textContent = val; }
  if (pillar === 'O') { state.scanO = val; if ($('soV')) $('soV').textContent = val; }
};

window.executeScan = function() {
  const w = state.scanW;
  const s = state.scanS;
  const o = state.scanO;
  
  const range = Math.max(w, s, o) - Math.min(w, s, o);
  let archKey = 'all';
  if (range >= 2) {
    if (w <= s && w <= o) archKey = 'w';
    else if (s <= w && s <= o) archKey = 's';
    else archKey = 'o';
  }
  state.scanResult = ARCH[archKey];
  renderScanner();
};

window.updatePcfVal = function(pillar, val) {
  val = parseInt(val);
  if (pillar === 'P') { state.scanP = val; if ($('spV')) $('spV').textContent = val; }
  if (pillar === 'A') { state.scanA = val; if ($('saV')) $('saV').textContent = val; }
  if (pillar === 'R') { state.scanR = val; if ($('srV')) $('srV').textContent = val; }
};

window.executePcfScan = function() {
  const p = state.scanP || 5;
  const a = state.scanA || 5;
  const r = state.scanR || 5;
  
  const range = Math.max(p, a, r) - Math.min(p, a, r);
  let key = 'ALL';
  if (range >= 2) {
    if (p <= a && p <= r) key = 'P';
    else if (a <= p && a <= r) key = 'A';
    else key = 'R';
  }
  
  const ARCHETYPES_PCF = {
    P: {
      name: 'The Blind Operator',
      color: P_C,
      insight: 'Your primary distortion is perceptual. You are operating on a model of the world you are not seeing clearly. Clean the lens upstream before pulling behavioral levers.',
      actions: ['Practice Gibsonian affordance scanning daily', 'Execute a temporal fact vs. belief separation audit', 'Engage in unfamiliar sensory contexts to break perceptual habits']
    },
    A: {
      name: 'The Harsh Judge',
      color: A_C,
      insight: 'Your primary distortion is appraisal. You assign unwarranted threat or existential weights to neutral events, collapsing long horizons into immediate emergencies.',
      actions: ['Separate identity appraisals from event appraisals', 'Reappraisal Protocol: practice challenge frames vs. threat frames', 'Extend temporal horizon of feedback evaluation to 90 days']
    },
    R: {
      name: 'The Rigid Navigator',
      color: R_C,
      insight: 'Your primary distortion is recalibration rate. You are navigating with an outdated map of the terrain, maintaining rigid assumptions despite disconfirming evidence.',
      actions: ['Track explicit daily predictions vs. concrete empirical outcomes', 'Set up short weekly feedback review loops', 'Update Protocol: actively seek one disconfirming fact each week']
    },
    ALL: {
      name: 'The Awakening Observer',
      color: G_C,
      insight: 'Balanced filter alignment. Maintain systemic auditing to notice dynamic environmental shifts before cognitive distortions accumulate.',
      actions: ['Apply WSO diagnostic together with weekly filter check-ins', 'Review cognitive lenses on the first of every month']
    }
  };
  
  state.pcfScanResult = ARCHETYPES_PCF[key];
  renderScanner();
};

// Initialize
init();
