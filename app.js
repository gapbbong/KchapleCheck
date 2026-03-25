/**
 * ✝ 경성전자고 예배 출석 체크 앱
 * app.js — 메인 로직 (Supabase Migration)
 */

// ────────────────────────────────────
// 설정 / 상태
// ────────────────────────────────────
const STORAGE_KEY  = 'chapel_settings';
const RECORDS_KEY  = 'chapel_records';  // { 'YYYY-MM-DD': [{id, name, time}, ...] }
const DEFAULT_THRESHOLD = 3;

// Supabase Client Initialization
const supabaseClient = window.supabase ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY) : null;

let settings = {
  threshold: DEFAULT_THRESHOLD
};

let todayRecords = [];   // 오늘 출석 [{id, name, time}]
let allRecords   = {};   // 전체 날짜별 기록
let currentInput = '';
let isSubmitting = false;
let currentTab   = 'pending'; // 'pending', 'received', 'all'
let serverStats  = {};        // { id: { name, count, received } }
let dailyStatsData = {};      // 서버에서 받아온 날짜별 통계 보관 (v2.2 추가)

// ────────────────────────────────────
// DOM 요소
// ────────────────────────────────────
const idText       = document.getElementById('idText');
const idDisplay    = document.getElementById('idDisplay');
const resultBadge  = document.getElementById('resultBadge');
const recentList   = document.getElementById('recentList');
const overlay      = document.getElementById('overlay');
const overlayCard  = document.getElementById('overlayCard');
const overlayIcon  = document.getElementById('overlayIcon');
const overlayName  = document.getElementById('overlayName');
const overlaySub   = document.getElementById('overlaySub');
const dateDisplay  = document.getElementById('dateDisplay');

// 화면
const appScreen      = document.getElementById('app');
const statsScreen    = document.getElementById('statsScreen');
const settingsScreen = document.getElementById('settingsScreen');

// 설정 요소
const thresholdValEl   = document.getElementById('thresholdVal');

// ────────────────────────────────────
// 초기화
// ────────────────────────────────────
function init() {
  loadSettings();
  loadAllRecords();
  syncTodayRecords();
  renderDateDisplay();
  bindEvents();
}

function loadSettings() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try { 
      const parsed = JSON.parse(saved);
      settings = { ...settings, ...parsed }; 
    } catch {
      settings = { ...settings };
    }
  }
  thresholdValEl.textContent = settings.threshold;
}

function saveSettingsToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function loadAllRecords() {
  const saved = localStorage.getItem(RECORDS_KEY);
  if (saved) {
    try { allRecords = JSON.parse(saved); } catch { allRecords = {}; }
  }
}

function saveAllRecords() {
  localStorage.setItem(RECORDS_KEY, JSON.stringify(allRecords));
}

function getTodayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function syncTodayRecords() {
  const key = getTodayKey();
  todayRecords = allRecords[key] || [];
}

function renderDateDisplay() {
  const now = new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  dateDisplay.textContent =
    `${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일 (${days[now.getDay()]})`;
}

// ────────────────────────────────────
// 키패드 이벤트
// ────────────────────────────────────
function bindEvents() {
  // 숫자 키
  document.querySelectorAll('.key[data-val]').forEach(btn => {
    btn.addEventListener('click', () => {
      addRipple(btn);
      if (currentInput.length >= 8) return;
      currentInput += btn.dataset.val;
      updateDisplay();
      clearResultBadge();
    });
  });

  // 지우기
  document.getElementById('clearBtn').addEventListener('click', () => {
    addRipple(document.getElementById('clearBtn'));
    currentInput = currentInput.slice(0, -1);
    updateDisplay();
    clearResultBadge();
  });

  // 제출
  document.getElementById('submitBtn').addEventListener('click', submitAttendance);

  // 키보드 지원
  document.addEventListener('keydown', e => {
    if (e.key >= '0' && e.key <= '9' && currentInput.length < 8) {
      currentInput += e.key;
      updateDisplay();
      clearResultBadge();
    } else if (e.key === 'Backspace') {
      currentInput = currentInput.slice(0, -1);
      updateDisplay();
      clearResultBadge();
    } else if (e.key === 'Enter') {
      submitAttendance();
    }
  });

  // 화면 전환
  document.getElementById('statsBtn').addEventListener('click',    () => showScreen('stats'));
  document.getElementById('settingsBtn').addEventListener('click', () => showScreen('settings'));
  document.getElementById('statsBack').addEventListener('click',   () => showScreen('main'));
  document.getElementById('settingsBack').addEventListener('click',() => showScreen('main'));
  document.getElementById('refreshStats').addEventListener('click', fetchServerStats);

  // 날짜별 통계 버튼
  const dailyBtn = document.getElementById('showDailyStats');
  if (dailyBtn) {
    dailyBtn.addEventListener('click', toggleDailyStats);
  }

  // 통계 탭 전환
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      renderStatsScreen();
    });
  });

  // 설정 저장
  document.getElementById('saveSettings').addEventListener('click', () => {
    saveSettingsToStorage();
    showToast('설정이 저장되었습니다 ✅');
  });

  // 간식 횟수 조절
  document.getElementById('decreaseThreshold').addEventListener('click', () => {
    if (settings.threshold > 1) {
      settings.threshold--;
      thresholdValEl.textContent = settings.threshold;
    }
  });
  document.getElementById('increaseThreshold').addEventListener('click', () => {
    settings.threshold++;
    thresholdValEl.textContent = settings.threshold;
  });

  // 로컬 초기화
  document.getElementById('clearTodayLocal').addEventListener('click', () => {
    if (!confirm('오늘 로컬 출석 기록을 초기화할까요?\n(구글 시트 데이터에는 영향 없음)')) return;
    const key = getTodayKey();
    allRecords[key] = [];
    saveAllRecords();
    syncTodayRecords();
    showToast('오늘 기록이 초기화되었습니다');
  });

  // 오버레이 클릭으로 닫기
  overlay.addEventListener('click', closeOverlay);
}

// ────────────────────────────────────
// 날짜별 통계 (v2.2)
// ────────────────────────────────────
function toggleDailyStats() {
  const panel = document.getElementById('dailyStatsPanel');
  panel.classList.toggle('hidden');
  
  if (!panel.classList.contains('hidden')) {
    renderDailyStatsList();
  }
}

function renderDailyStatsList() {
  const listEl = document.getElementById('dailyStatsList');
  const dates = Object.keys(dailyStatsData).sort().reverse();
  
  if (dates.length === 0) {
    listEl.innerHTML = '<div class="empty-msg">데이터가 없습니다</div>';
    return;
  }
  
  listEl.innerHTML = dates.map(date => `
    <div class="daily-item">
      <span>${date}</span>
      <span class="count">${dailyStatsData[date]}명</span>
    </div>
  `).join('');
}


// ────────────────────────────────────
// 서버 데이터 통신 (Supabase)
// ────────────────────────────────────
async function fetchServerStats() {
  if (!supabaseClient) return;
  
  const snackListEl = document.getElementById('snackList');
  snackListEl.innerHTML = '<div class="loading-spinner-wrap"><div class="spinner"></div></div>';

  try {
    // 1. Fetch all students
    const { data: students, error: studentsErr } = await supabaseClient.from('kchaple_students').select('*');
    if (studentsErr) throw studentsErr;

    // 2. Fetch attendance grouped by student, and daily stats
    const { data: attendance, error: attErr } = await supabaseClient.from('kchaple_attendance').select('*');
    if (attErr) throw attErr;

    // 3. Fetch snacks
    const { data: snacks, error: snacksErr } = await supabaseClient.from('kchaple_snacks').select('student_id');
    if (snacksErr) throw snacksErr;

    // Process dailyStatsData { 'YYYY-MM-DD': count }
    dailyStatsData = {};
    attendance.forEach(a => {
      const d = a.date;
      dailyStatsData[d] = (dailyStatsData[d] || 0) + 1;
    });

    // Process serverStats { id: { name, count, received } }
    serverStats = {};
    students.forEach(s => {
      serverStats[s.id] = { name: s.name, count: 0, received: false };
    });
    
    // Fallback for missing students
    attendance.forEach(a => {
      if (!serverStats[a.student_id]) {
        serverStats[a.student_id] = { name: '이름없음', count: 0, received: false };
      }
      serverStats[a.student_id].count++;
    });

    snacks.forEach(s => {
      if (serverStats[s.student_id]) {
        serverStats[s.student_id].received = true;
      }
    });

    renderStatsScreen();
  } catch (err) {
    console.error('서버 통계 로드 실패:', err);
    snackListEl.innerHTML = '<div class="empty-msg">서버 데이터를 불러오지 못했습니다</div>';
  }
}

async function markSnackAsReceived(id, name) {
  if (isSubmitting || !confirm(`${name} 학생에게 간식을 지급했나요?`)) return;

  isSubmitting = true;
  showOverlay('🍬', '지급 중...', `${name} 학생 기록 중`);

  try {
    const { error } = await supabaseClient
      .from('kchaple_snacks')
      .insert([{ student_id: id }]);

    if (error) {
      if (error.code === '23505') { // Unique violation
        showToast('❌ 이미 지급된 학생입니다');
      } else {
        throw error;
      }
    } else {
      showOverlay('🎁', '지급 완료', `${name} 학생 간식 지급 기록됨`);
      fetchServerStats(); // 통계 새로고침
    }
  } catch (err) {
    console.error('간식 지급 기록 실패:', err);
    showToast('❌ 기록 실패');
  } finally {
    isSubmitting = false;
  }
}

// ────────────────────────────────────
// 디스플레이 업데이트
// ────────────────────────────────────
function updateDisplay() {
  if (currentInput.length === 0) {
    idText.textContent  = '학번 입력';
    idText.className    = 'id-placeholder';
    idDisplay.classList.remove('active-input');
  } else {
    idText.textContent  = currentInput;
    idText.className    = '';
    idDisplay.classList.add('active-input');
  }
}

// ────────────────────────────────────
// 출석 제출 (Supabase)
// ────────────────────────────────────
async function submitAttendance() {
  if (isSubmitting || currentInput.length === 0) return;

  if (!supabaseClient || CONFIG.SUPABASE_URL.includes('YOUR_PROJECT_ID')) {
    showErrorBadge('⚙️ config.js에서 Supabase URL과 KEY를 설정하세요');
    shakeDisplay();
    return;
  }

  isSubmitting = true;
  setSubmitLoading(true);
  resultBadge.textContent = '';
  resultBadge.className   = 'result-badge';

  const studentId = currentInput;

  try {
    // 1. Check if student exists
    const { data: student, error: studentErr } = await supabaseClient
      .from('kchaple_students')
      .select('name')
      .eq('id', studentId)
      .maybeSingle();

    if (studentErr || !student) {
      showErrorBadge('❌ 등록되지 않은 학번입니다');
      shakeDisplay();
      showOverlay('❌', '학번 없음', `${studentId}는 명단에 없습니다`);
      return;
    }
    
    const name = student.name;
    const dateStr = getTodayKey();

    // 2. Check duplicate today
    const { data: existing, error: existErr } = await supabaseClient
      .from('kchaple_attendance')
      .select('id')
      .eq('student_id', studentId)
      .eq('date', dateStr)
      .maybeSingle();

    if (existing) {
      // Get count
      const { count } = await supabaseClient
        .from('kchaple_attendance')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', studentId);
        
      showDupBadge(`✅ ${name} (${count || 1}회 출석)`);
      showOverlay('✅', name, `현재 누적 ${count || 1}회 (이미 출석함)`);
    } else {
      // Insert new attendance
      const { error: insertErr } = await supabaseClient
        .from('kchaple_attendance')
        .insert([{ student_id: studentId, date: dateStr }]);
        
      if (insertErr) throw insertErr;

      // Get updated count
      const { count } = await supabaseClient
        .from('kchaple_attendance')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', studentId);

      // Local state update
      const now = new Date();
      const timeStr = now.toTimeString().slice(0, 8);
      const record  = { id: studentId, name, time: timeStr };

      todayRecords.push(record);
      const key = getTodayKey();
      allRecords[key] = todayRecords;
      saveAllRecords();

      showSuccessBadge(`🎉 ${name} (${count || 1}회 출석)`);
      showOverlay('🙌', name, `${studentId} · 출석 완료 (누적 ${count || 1}회)`);
    }
  } catch (err) {
    showErrorBadge('🌐 네트워크 오류 - 인터넷 접속이나 DB를 확인하세요');
    shakeDisplay();
    console.error(err);
  } finally {
    isSubmitting = false;
    setSubmitLoading(false);
    currentInput = '';
    updateDisplay();
  }
}

function setSubmitLoading(on) {
  const btn = document.getElementById('submitBtn');
  if (on) {
    btn.innerHTML = '<span class="material-icons-round" style="animation:spin 0.7s linear infinite">autorenew</span>';
    btn.disabled = true;
  } else {
    btn.innerHTML = '<span class="material-icons-round">check_circle</span>';
    btn.disabled = false;
  }
}

// ────────────────────────────────────
// 결과 배지
// ────────────────────────────────────
// 결과 배지 초기화
function clearResultBadge() {
  resultBadge.textContent = '';
  resultBadge.className   = 'result-badge';
}

function showSuccessBadge(msg) {
  resultBadge.textContent = msg;
  resultBadge.className   = 'result-badge success';
}
function showDupBadge(msg) {
  resultBadge.textContent = msg;
  resultBadge.className   = 'result-badge duplicate';
}
function showErrorBadge(msg) {
  resultBadge.textContent = msg;
  resultBadge.className   = 'result-badge error';
}

function shakeDisplay() {
  idDisplay.classList.add('shake');
  setTimeout(() => idDisplay.classList.remove('shake'), 400);
}



// ────────────────────────────────────
// 오버레이 팝업
// ────────────────────────────────────
let overlayTimer = null;

function showOverlay(icon, name, sub) {
  overlayIcon.textContent = icon;
  overlayName.textContent = name;
  overlaySub.textContent  = sub;
  overlay.classList.remove('hidden');
  overlay.classList.add('show');

  clearTimeout(overlayTimer);
  overlayTimer = setTimeout(closeOverlay, 2200);
}

function closeOverlay() {
  overlay.classList.remove('show');
  overlay.classList.add('hidden');
}

// ────────────────────────────────────
// 화면 전환
// ────────────────────────────────────
function showScreen(name) {
  appScreen.classList.remove('active');
  statsScreen.classList.remove('active');
  settingsScreen.classList.remove('active');

  if (name === 'main') {
    appScreen.classList.add('active');
  } else if (name === 'stats') {
    statsScreen.classList.add('active');
    fetchServerStats();
  } else if (name === 'settings') {
    settingsScreen.classList.add('active');
  }
}

// ────────────────────────────────────
// 통계 화면
// ────────────────────────────────────
function renderStatsScreen() {
  // 1. 기본 정보 업데이트
  document.getElementById('totalToday').textContent = todayRecords.length;
  document.getElementById('targetCount').textContent = settings.threshold;

  // dailyStatsPanel이 열려있다면 갱신
  if (!document.getElementById('dailyStatsPanel').classList.contains('hidden')) {
    renderDailyStatsList();
  }

  const list = Object.entries(serverStats).map(([id, v]) => ({
    id, name: v.name, count: v.count, received: v.received
  })).sort((a, b) => b.count - a.count);

  const pending = list.filter(s => s.count >= settings.threshold && !s.received);
  const received = list.filter(s => s.received);

  document.getElementById('snackCount').textContent = pending.length;
  document.getElementById('pendingCount').textContent = pending.length;
  document.getElementById('receivedCount').textContent = received.length;

  const snackListEl = document.getElementById('snackList');
  let displayList = [];

  if (currentTab === 'pending') {
    displayList = pending;
  } else if (currentTab === 'received') {
    displayList = received;
  } else {
    displayList = list;
  }

  if (displayList.length === 0) {
    snackListEl.innerHTML = '<div class="empty-msg">해당 내역이 없습니다</div>';
    return;
  }

  snackListEl.innerHTML = displayList.map((s, i) => {
    const isTarget = s.count >= settings.threshold;
    const isReceived = s.received;
    
    return `<div class="snack-item ${isTarget && !isReceived ? 'highlight' : ''}">
      <div class="snack-item-rank">${i + 1}</div>
      <div class="snack-item-info">
        <div class="snack-item-name">${s.name} ${isReceived ? '✅' : ''}</div>
        <div class="snack-item-id">${s.id}</div>
      </div>
      <div class="snack-item-count">${s.count}회</div>
      ${isTarget && !isReceived ? 
        `<button class="snack-give-btn" onclick="markSnackAsReceived('${s.id}', '${s.name}')">지급 완료</button>` : 
        (isReceived ? '<div class="received-badge"><span>✓</span>수령함</div>' : '')
      }
    </div>`;
  }).join('');
}

// ────────────────────────────────────
// 유틸
// ────────────────────────────────────
function addRipple(el) {
  el.classList.remove('ripple');
  void el.offsetWidth;
  el.classList.add('ripple');
}

function showToast(msg) {
  // 간단 토스트 (기존 overlay 재활용)
  showOverlay('✅', msg, '');
}

// 시작!
init();
