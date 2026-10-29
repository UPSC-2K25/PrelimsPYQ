/**
 * UPSC CSE GS Prelims Mock Test Engine
 * Modernized with topbar filter controls, standard timer, and unified palette/scorecard
 */

const MARKS_PER_CORRECT = 2.0;
const NEGATIVE_MARK = 0.66;
const KNOWN_YEAR_RANGE = [2011, 2027];

const state = {
  isReviewMode: false,
  currentIndex: 0,
  rawQuestions: [],
  activeQuestions: [],
  userAnswers: {},       // { [qIndex]: 'A' | 'B' | 'C' | 'D' }
  detectedYears: [],
  subjectManifest: [],
  
  // Timer state
  timerSecondsRemaining: 0,
  timerInterval: null,
  isTimerRunning: false,
  allocatedSeconds: 0
};

// DOM Elements Reference
const el = {
  modeBadge: document.getElementById('mode-badge'),
  badgeTotalPool: document.getElementById('badge-total-pool'),
  filterMode: document.getElementById('filter-mode'),
  filterYearGroup: document.getElementById('filter-year-group'),
  filterYear: document.getElementById('filter-year'),
  filterSubjectGroup: document.getElementById('filter-subject-group'),
  filterSubject: document.getElementById('filter-subject'),
  filterCount: document.getElementById('filter-count'),
  btnRestart: document.getElementById('btn-restart'),

  timerBox: document.getElementById('timer-box'),
  timerDisplay: document.getElementById('timer-display'),
  btnTimerToggle: document.getElementById('btn-timer-toggle'),
  btnTimerReset: document.getElementById('btn-timer-reset'),
  btnSubmitExam: document.getElementById('btn-submit-exam'),
  btnRetakeExam: document.getElementById('btn-retake-exam'),

  badgeQno: document.getElementById('badge-qno'),
  badgeSubject: document.getElementById('badge-subject'),
  badgeYear: document.getElementById('badge-year'),
  badgeOrigQno: document.getElementById('badge-orig-qno'),

  questionText: document.getElementById('question-text'),
  optionsContainer: document.getElementById('options-container'),
  reviewExplanationBox: document.getElementById('review-explanation-box'),
  userStatusText: document.getElementById('user-status-text'),
  correctAnswerText: document.getElementById('correct-answer-text'),
  explanationText: document.getElementById('explanation-text'),

  btnPrev: document.getElementById('btn-prev'),
  btnNext: document.getElementById('btn-next'),
  btnClear: document.getElementById('btn-clear'),

  paletteGrid: document.getElementById('palette-grid'),
  paletteStats: document.getElementById('palette-stats'),
  legendBox: document.getElementById('legend-box'),

  scorecardModal: document.getElementById('scorecard-modal'),
  btnCloseScorecard: document.getElementById('btn-close-scorecard'),
  btnReviewAnswers: document.getElementById('btn-review-answers'),
  resTotalMarks: document.getElementById('res-total-marks'),
  resAccuracy: document.getElementById('res-accuracy'),
  resRawScore: document.getElementById('res-raw-score'),
  resTotalQ: document.getElementById('res-total-q'),
  resAttempted: document.getElementById('res-attempted'),
  resCorrect: document.getElementById('res-correct'),
  resIncorrect: document.getElementById('res-incorrect'),
  resUnattempted: document.getElementById('res-unattempted')
};

// In-memory cache for fetched JSON datasets
const dataCache = {
  years: {},
  subjects: {}
};

// ==========================================
// 1. DISCOVERY & INITIALIZATION
// ==========================================
async function initEngine() {
  await Promise.all([
    detectAvailableYears(),
    loadSubjectManifest()
  ]);

  syncFilterUI();
  await loadFilterPool();
}

async function detectAvailableYears() {
  const probeYears = [];
  for (let yr = KNOWN_YEAR_RANGE[1]; yr >= KNOWN_YEAR_RANGE[0]; yr--) {
    probeYears.push(yr);
  }

  const checks = probeYears.map(async (yr) => {
    try {
      const res = await fetch(`questions/gsp_${yr}.json`, { method: 'HEAD' });
      if (res.ok) return yr;
    } catch (_) {}
    return null;
  });

  const results = await Promise.all(checks);
  state.detectedYears = results.filter(Boolean).sort((a, b) => b - a);

  el.filterYear.innerHTML = '';
  if (state.detectedYears.length > 0) {
    state.detectedYears.forEach(yr => {
      const opt = document.createElement('option');
      opt.value = yr;
      opt.textContent = yr;
      el.filterYear.appendChild(opt);
    });
  } else {
    el.filterYear.innerHTML = '<option value="">No year files found</option>';
  }
}

async function loadSubjectManifest() {
  try {
    const res = await fetch('subjects/manifest.json?_=' + Date.now());
    if (res.ok) {
      const data = await res.json();
      state.subjectManifest = data.subjects || [];
      populateSubjectDropdown();
    }
  } catch (err) {
    console.warn('subjects/manifest.json not found:', err);
    el.filterSubject.innerHTML = '<option value="">No subjects found</option>';
  }
}

function populateSubjectDropdown() {
  el.filterSubject.innerHTML = '';
  if (!state.subjectManifest || state.subjectManifest.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No subjects available';
    el.filterSubject.appendChild(opt);
    return;
  }

  state.subjectManifest.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.filename;
    opt.textContent = `${s.name} (${s.count})`;
    el.filterSubject.appendChild(opt);
  });
}

// ==========================================
// 2. DATA FETCHING
// ==========================================
async function fetchQuestionsByYear(yr) {
  if (dataCache.years[yr]) return dataCache.years[yr];
  try {
    const res = await fetch(`questions/gsp_${yr}.json?_=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      data.forEach((q, idx) => {
        if (!q.year) q.year = String(yr);
        if (!q.qno) q.qno = String(idx + 1);
      });
      dataCache.years[yr] = data;
      return data;
    }
  } catch (err) {
    console.error(`Failed to fetch questions/gsp_${yr}.json:`, err);
  }
  return [];
}

async function fetchQuestionsBySubject(filename) {
  if (dataCache.subjects[filename]) return dataCache.subjects[filename];
  try {
    const res = await fetch(`subjects/${filename}?_=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      dataCache.subjects[filename] = data;
      return data;
    }
  } catch (err) {
    console.error(`Failed to fetch subjects/${filename}:`, err);
  }
  return [];
}

async function fetchAllQuestions() {
  const promises = state.detectedYears.map(yr => fetchQuestionsByYear(yr));
  const results = await Promise.all(promises);
  return results.flat();
}

// ==========================================
// 3. FILTERING & SESSION LAUNCH
// ==========================================
function syncFilterUI() {
  const mode = el.filterMode.value;
  if (mode === 'year') {
    el.filterYearGroup.style.display = 'flex';
    el.filterSubjectGroup.style.display = 'none';
  } else if (mode === 'subject') {
    el.filterYearGroup.style.display = 'none';
    el.filterSubjectGroup.style.display = 'flex';
  } else {
    el.filterYearGroup.style.display = 'none';
    el.filterSubjectGroup.style.display = 'none';
  }
}

async function loadFilterPool() {
  const mode = el.filterMode.value;
  let pool = [];

  if (mode === 'year') {
    const yr = el.filterYear.value;
    if (yr) pool = await fetchQuestionsByYear(yr);
  } else if (mode === 'subject') {
    const filename = el.filterSubject.value;
    if (filename) pool = await fetchQuestionsBySubject(filename);
  } else {
    pool = await fetchAllQuestions();
  }

  state.rawQuestions = pool;
  const poolCount = pool.length;
  el.badgeTotalPool.textContent = poolCount;

  if (poolCount === 0) {
    el.filterCount.min = 0;
    el.filterCount.max = 0;
    el.filterCount.value = 0;
    el.filterCount.disabled = true;
  } else {
    el.filterCount.disabled = false;
    el.filterCount.min = 1;
    el.filterCount.max = poolCount;

    let countVal = parseInt(el.filterCount.value, 10);
    if (isNaN(countVal) || countVal < 1 || countVal > poolCount) {
      el.filterCount.value = Math.min(poolCount, 100);
    }
  }

  startMockTest();
}

function shuffleArray(array) {
  const cloned = array.slice();
  for (let i = cloned.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = cloned[i];
    cloned[i] = cloned[j];
    cloned[j] = temp;
  }
  return cloned;
}

function startMockTest() {
  const reqCount = parseInt(el.filterCount.value, 10) || state.rawQuestions.length;
  const shuffled = shuffleArray(state.rawQuestions);
  state.activeQuestions = shuffled.slice(0, Math.min(reqCount, shuffled.length));

  state.currentIndex = 0;
  state.userAnswers = {};
  state.isReviewMode = false;

  el.modeBadge.textContent = 'MOCK MODE';
  el.modeBadge.className = 'badge badge-accent';
  el.reviewExplanationBox.classList.add('hidden');
  el.btnSubmitExam.classList.remove('hidden');
  el.btnRetakeExam.classList.add('hidden');
  el.btnClear.classList.remove('hidden');

  setupInitialTimer();
  renderLegend();
  renderPalette();
  renderQuestion(state.currentIndex);
}

function enterReviewMode() {
  state.isReviewMode = true;
  pauseTimer();

  el.modeBadge.textContent = 'REVIEW MODE';
  el.modeBadge.className = 'badge badge-review';
  el.btnSubmitExam.classList.add('hidden');
  el.btnRetakeExam.classList.remove('hidden');
  el.btnClear.classList.add('hidden');

  renderLegend();
  renderPalette();
  renderQuestion(0);
}

// ==========================================
// 4. STANDARD TIMER ENGINE
// ==========================================
function setupInitialTimer() {
  clearInterval(state.timerInterval);
  state.isTimerRunning = false;

  // Standard 72 seconds per question (UPSC Prelims duration)
  state.allocatedSeconds = Math.max(state.activeQuestions.length * 72, 120);
  state.timerSecondsRemaining = state.allocatedSeconds;

  updateTimerUI();
  el.btnTimerToggle.textContent = '▶ Start';
}

function updateTimerUI() {
  const m = Math.floor(state.timerSecondsRemaining / 60);
  const s = state.timerSecondsRemaining % 60;
  el.timerDisplay.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function startTimer() {
  if (state.isTimerRunning || state.isReviewMode) return;
  state.isTimerRunning = true;
  el.btnTimerToggle.textContent = '⏸ Pause';

  state.timerInterval = setInterval(() => {
    state.timerSecondsRemaining--;
    updateTimerUI();
    if (state.timerSecondsRemaining <= 0) {
      clearInterval(state.timerInterval);
      state.isTimerRunning = false;
      alert('Time is up! Your test is being submitted.');
      handleExamSubmit();
    }
  }, 1000);
}

function pauseTimer() {
  state.isTimerRunning = false;
  clearInterval(state.timerInterval);
  el.btnTimerToggle.textContent = '▶ Resume';
}

// ==========================================
// 5. QUESTION & PALETTE RENDERING
// ==========================================
function renderQuestion(index) {
  if (state.activeQuestions.length === 0) {
    el.questionText.textContent = 'No questions available for the chosen filters.';
    el.optionsContainer.innerHTML = '';
    return;
  }

  state.currentIndex = index;
  const q = state.activeQuestions[index];

  el.badgeQno.textContent = `Q ${index + 1} of ${state.activeQuestions.length}`;
  el.badgeSubject.textContent = q.subject || q.topic || 'General Studies';
  el.badgeYear.textContent = q.year || 'PYQ';
  el.badgeOrigQno.textContent = `Ref #${q.qno || (index + 1)}`;

  el.questionText.textContent = q.question;
  el.optionsContainer.innerHTML = '';

  const letters = ['A', 'B', 'C', 'D'];
  const userSelected = state.userAnswers[index];

  q.options.forEach((optText, optIdx) => {
    const letter = letters[optIdx];
    const card = document.createElement('div');
    card.className = 'option-card';

    if (userSelected === letter) {
      card.classList.add('selected');
    }

    if (state.isReviewMode) {
      if (letter === q.answer) {
        card.classList.add('correct');
      } else if (userSelected === letter) {
        card.classList.add('incorrect');
      }
    }

    const prefixSpan = document.createElement('span');
    prefixSpan.className = 'opt-prefix';
    prefixSpan.textContent = `(${letter})`;

    const textSpan = document.createElement('span');
    textSpan.textContent = optText;

    card.appendChild(prefixSpan);
    card.appendChild(textSpan);

    card.addEventListener('click', () => {
      if (state.isReviewMode) return;
      if (!state.isTimerRunning) {
        startTimer();
      }
      state.userAnswers[index] = letter;
      renderQuestion(index);
    });

    el.optionsContainer.appendChild(card);
  });

  // Review mode details
  if (state.isReviewMode) {
    el.reviewExplanationBox.classList.remove('hidden');
    const isAnswered = userSelected !== undefined;
    const isCorrect = userSelected === q.answer;

    el.userStatusText.textContent = `Your Answer: ${isAnswered ? `(${userSelected})` : 'Unattempted'}`;
    el.userStatusText.style.color = isCorrect ? 'var(--success)' : (isAnswered ? 'var(--danger)' : 'var(--text-muted)');

    el.correctAnswerText.textContent = `Official Answer: (${q.answer})`;
    el.correctAnswerText.style.color = 'var(--success)';

    el.explanationText.textContent = q.explanation || 'No explanation provided.';
  } else {
    el.reviewExplanationBox.classList.add('hidden');
  }

  el.btnPrev.disabled = (index === 0);
  el.btnNext.disabled = (index === state.activeQuestions.length - 1);

  renderPalette();
}

function renderLegend() {
  el.legendBox.innerHTML = '';
  if (!state.isReviewMode) {
    el.legendBox.innerHTML = `
      <div class="legend-item"><span class="bullet bullet-green"></span> Attempted</div>
      <div class="legend-item"><span class="bullet bullet-white"></span> Unattempted</div>
    `;
  } else {
    el.legendBox.innerHTML = `
      <div class="legend-item"><span class="bullet bullet-green"></span> Correct</div>
      <div class="legend-item"><span class="bullet bullet-red"></span> Wrong</div>
      <div class="legend-item" style="grid-column: span 2;"><span class="bullet bullet-white"></span> Unattempted (No color)</div>
    `;
  }
}

function renderPalette() {
  el.paletteGrid.innerHTML = '';
  let attemptedCount = 0;

  state.activeQuestions.forEach((q, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'q-btn';
    btn.textContent = idx + 1;

    if (idx === state.currentIndex) {
      btn.classList.add('current');
    }

    const userChoice = state.userAnswers[idx];
    const isAttempted = userChoice !== undefined;
    if (isAttempted) attemptedCount++;

    if (!state.isReviewMode) {
      if (isAttempted) {
        btn.classList.add('state-green');
      } else {
        btn.classList.add('state-unattempted');
      }
    } else {
      if (!isAttempted) {
        btn.classList.add('state-unattempted');
      } else if (userChoice === q.answer) {
        btn.classList.add('state-green');
      } else {
        btn.classList.add('state-red');
      }
    }

    btn.addEventListener('click', () => {
      renderQuestion(idx);
    });

    el.paletteGrid.appendChild(btn);
  });

  el.paletteStats.textContent = `${attemptedCount}/${state.activeQuestions.length}`;
}

// ==========================================
// 6. SCORING & MODAL
// ==========================================
function handleExamSubmit() {
  pauseTimer();

  let correct = 0;
  let wrong = 0;

  state.activeQuestions.forEach((q, idx) => {
    const choice = state.userAnswers[idx];
    if (choice !== undefined) {
      if (choice === q.answer) correct++;
      else wrong++;
    }
  });

  const total = state.activeQuestions.length;
  const attempted = correct + wrong;
  const unattempted = total - attempted;
  const rawScore = (correct * MARKS_PER_CORRECT) - (wrong * NEGATIVE_MARK);
  const accuracy = attempted > 0 ? ((correct / attempted) * 100).toFixed(1) : '0';

  const scaledScore = total > 0
    ? ((rawScore / (total * MARKS_PER_CORRECT)) * 200).toFixed(2)
    : '0.00';

  el.resTotalMarks.textContent = scaledScore;
  el.resRawScore.textContent = rawScore.toFixed(2);
  el.resAccuracy.textContent = accuracy + '%';
  el.resTotalQ.textContent = total;
  el.resAttempted.textContent = attempted;
  el.resCorrect.textContent = correct;
  el.resIncorrect.textContent = wrong;
  el.resUnattempted.textContent = unattempted;

  el.scorecardModal.classList.remove('hidden');
}

// ==========================================
// 7. EVENT LISTENERS
// ==========================================
function setupEventListeners() {
  // Timer buttons
  el.btnTimerToggle.addEventListener('click', () => {
    if (state.isTimerRunning) pauseTimer();
    else startTimer();
  });

  el.btnTimerReset.addEventListener('click', () => {
    pauseTimer();
    state.timerSecondsRemaining = state.allocatedSeconds;
    updateTimerUI();
    el.btnTimerToggle.textContent = '▶ Start';
  });

  // Submission & Retake
  el.btnSubmitExam.addEventListener('click', () => {
    const attempted = Object.keys(state.userAnswers).length;
    const total = state.activeQuestions.length;
    if (confirm(`You have attempted ${attempted} of ${total} questions. Are you sure you want to submit?`)) {
      handleExamSubmit();
    }
  });

  el.btnRetakeExam.addEventListener('click', startMockTest);

  // Scorecard modal
  el.btnCloseScorecard.addEventListener('click', () => {
    el.scorecardModal.classList.add('hidden');
  });

  el.btnReviewAnswers.addEventListener('click', () => {
    el.scorecardModal.classList.add('hidden');
    enterReviewMode();
  });

  // Navigation & clear
  el.btnClear.addEventListener('click', () => {
    if (state.isReviewMode) return;
    delete state.userAnswers[state.currentIndex];
    renderQuestion(state.currentIndex);
  });

  el.btnPrev.addEventListener('click', () => {
    if (state.currentIndex > 0) renderQuestion(state.currentIndex - 1);
  });

  el.btnNext.addEventListener('click', () => {
    if (state.currentIndex < state.activeQuestions.length - 1) {
      renderQuestion(state.currentIndex + 1);
    }
  });

  // Filter UI changes
  el.filterMode.addEventListener('change', () => {
    syncFilterUI();
    loadFilterPool();
  });

  el.filterYear.addEventListener('change', loadFilterPool);
  el.filterSubject.addEventListener('change', loadFilterPool);
  el.btnRestart.addEventListener('click', loadFilterPool);

  el.filterCount.addEventListener('change', () => {
    const maxQ = state.rawQuestions.length;
    let val = parseInt(el.filterCount.value, 10);
    if (isNaN(val) || val < 1) val = 1;
    if (val > maxQ && maxQ > 0) val = maxQ;
    el.filterCount.value = val;
  });
}

// Initial launch
window.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  initEngine();
});