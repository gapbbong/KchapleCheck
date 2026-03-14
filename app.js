/**
 * ✝ 경성전자고 예배 출석 체크 앱
 * app.js — 메인 로직
 */

// ────────────────────────────────────
// 설정 / 상태
// ────────────────────────────────────
const STORAGE_KEY  = 'chapel_settings';
const RECORDS_KEY  = 'chapel_records';  // { 'YYYY-MM-DD': [{id, name, time}, ...] }
const DEFAULT_GAS  = '';               // GAS URL (사용자가 설정에서 입력)
const DEFAULT_THRESHOLD = 3;

let settings = {
  gasUrl:    DEFAULT_GAS,
  threshold: DEFAULT_THRESHOLD
};

let todayRecords = [];   // 오늘 출석 [{id, name, time}]
let allRecords   = {};   // 전체 날짜별 기록
let currentInput = '';
let isSubmitting = false;

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
const gasUrlInput      = document.getElementById('gasUrl');
const thresholdValEl   = document.getElementById('thresholdVal');
const snackThreshLabel = document.getElementById('snackThresholdLabel');

// ────────────────────────────────────
// 초기화
// ────────────────────────────────────
function init() {
  loadSettings();
  loadAllRecords();
  syncTodayRecords();
  renderDateDisplay();
  renderRecentList();
  bindEvents();
}

function loadSettings() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try { settings = { ...settings, ...JSON.parse(saved) }; } catch {}
  }
  gasUrlInput.value      = settings.gasUrl;
  thresholdValEl.textContent = settings.threshold;
  snackThreshLabel.textContent = settings.threshold;
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
    });
  });

  // 지우기
  document.getElementById('clearBtn').addEventListener('click', () => {
    addRipple(document.getElementById('clearBtn'));
    currentInput = currentInput.slice(0, -1);
    updateDisplay();
    resultBadge.textContent = '';
    resultBadge.className   = 'result-badge';
  });

  // 제출
  document.getElementById('submitBtn').addEventListener('click', submitAttendance);

  // 키보드 지원
  document.addEventListener('keydown', e => {
    if (e.key >= '0' && e.key <= '9' && currentInput.length < 8) {
      currentInput += e.key;
      updateDisplay();
    } else if (e.key === 'Backspace') {
      currentInput = currentInput.slice(0, -1);
      updateDisplay();
      resultBadge.textContent = '';
      resultBadge.className   = 'result-badge';
    } else if (e.key === 'Enter') {
      submitAttendance();
    }
  });

  // 화면 전환
  document.getElementById('statsBtn').addEventListener('click',    () => showScreen('stats'));
  document.getElementById('settingsBtn').addEventListener('click', () => showScreen('settings'));
  document.getElementById('statsBack').addEventListener('click',   () => showScreen('main'));
  document.getElementById('settingsBack').addEventListener('click',() => showScreen('main'));
  document.getElementById('refreshStats').addEventListener('click', renderStatsScreen);

  // 설정 저장
  document.getElementById('saveSettings').addEventListener('click', () => {
    const url = gasUrlInput.value.trim();
    if (!url) { alert('GAS URL을 입력해주세요.'); return; }
    settings.gasUrl = url;
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
    renderRecentList();
    showToast('오늘 기록이 초기화되었습니다');
  });

  // 오버레이 클릭으로 닫기
  overlay.addEventListener('click', closeOverlay);
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
// 출석 제출
// ────────────────────────────────────
async function submitAttendance() {
  if (isSubmitting || currentInput.length === 0) return;

  if (!settings.gasUrl) {
    showErrorBadge('⚙️ 설정에서 GAS URL을 먼저 입력하세요');
    shakeDisplay();
    return;
  }

  isSubmitting = true;
  setSubmitLoading(true);
  resultBadge.textContent = '';
  resultBadge.className   = 'result-badge';

  const studentId = currentInput;

  try {
    const url = `${settings.gasUrl}?id=${encodeURIComponent(studentId)}`;
    const resp = await fetch(url);
    const text = (await resp.text()).trim();

    if (text === 'NOT_FOUND') {
      showErrorBadge('❌ 등록되지 않은 학번입니다');
      shakeDisplay();
      showOverlay('❌', '학번 없음', `${studentId}는 명단에 없습니다`);
    } else if (text.startsWith('ERROR')) {
      showErrorBadge('⚠️ 서버 오류: ' + text);
      shakeDisplay();
    } else {
      const name = text;

      // 이미 오늘 로컬에 있는지 확인
      const alreadyLocal = todayRecords.find(r => r.id === studentId);

      if (alreadyLocal) {
        // 이전에 출석 처리된 경우 (구글 시트에서 이미 처리됨)
        showDupBadge(`✅ ${name} (이미 출석)`);
        showOverlay('🔄', name, '이미 출석 처리되었습니다');
      } else {
        // 신규 출석
        const now = new Date();
        const timeStr = now.toTimeString().slice(0, 8);
        const record  = { id: studentId, name, time: timeStr };

        todayRecords.push(record);
        const key = getTodayKey();
        allRecords[key] = todayRecords;
        saveAllRecords();

        renderRecentList();
        showSuccessBadge(`🎉 ${name} 출석!`);
        showOverlay('🙌', name, `${studentId} · ${timeStr} 출석 완료`);
      }
    }
  } catch (err) {
    showErrorBadge('🌐 네트워크 오류 - 인터넷 연결 확인');
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
// 최근 출석자 리스트
// ────────────────────────────────────
function renderRecentList() {
  if (todayRecords.length === 0) {
    recentList.innerHTML = '<div class="empty-msg">아직 출석한 학생이 없습니다</div>';
    return;
  }
  // 최신 순
  const reversed = [...todayRecords].reverse();
  recentList.innerHTML = reversed.map((r, i) =>
    `<div class="recent-chip ${i === 0 ? 'new' : ''}">
      <span class="chip-icon">${i === 0 ? '✅' : '👤'}</span>
      ${r.name}
    </div>`
  ).join('');
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
    renderStatsScreen();
  } else if (name === 'settings') {
    settingsScreen.classList.add('active');
  }
}

// ────────────────────────────────────
// 통계 화면
// ────────────────────────────────────
function renderStatsScreen() {
  snackThreshLabel.textContent = settings.threshold;

  // 오늘 출석 수
  document.getElementById('totalToday').textContent = todayRecords.length;
  document.getElementById('targetCount').textContent = settings.threshold;

  // 학생별 누적 횟수 집계
  const countMap = {};  // { id: {name, count} }
  Object.values(allRecords).forEach(dayList => {
    dayList.forEach(r => {
      if (!countMap[r.id]) countMap[r.id] = { name: r.name, count: 0 };
      countMap[r.id].count++;
    });
  });

  const sorted = Object.entries(countMap)
    .map(([id, v]) => ({ id, name: v.name, count: v.count }))
    .sort((a, b) => b.count - a.count);

  // 간식 대상
  const snack = sorted.filter(s => s.count >= settings.threshold);
  document.getElementById('snackCount').textContent = snack.length;

  const snackList = document.getElementById('snackList');
  if (snack.length === 0) {
    snackList.innerHTML = `<div class="empty-msg" style="padding:16px 0">아직 기준에 도달한 학생이 없습니다</div>`;
  } else {
    snackList.innerHTML = snack.map((s, i) =>
      `<div class="snack-item">
        <div class="snack-item-rank">${i + 1}</div>
        <div class="snack-item-info">
          <div class="snack-item-name">${s.name}</div>
          <div class="snack-item-id">${s.id}</div>
        </div>
        <div class="snack-item-count">${s.count}회</div>
      </div>`
    ).join('');
  }

  // 전체 기록 (바 차트)
  const maxCount = sorted.length > 0 ? sorted[0].count : 1;
  const allStatsList = document.getElementById('allStatsList');
  if (sorted.length === 0) {
    allStatsList.innerHTML = `<div class="empty-msg" style="padding:16px 0">출석 기록이 없습니다</div>`;
  } else {
    allStatsList.innerHTML = sorted.map(s => {
      const pct = Math.round((s.count / maxCount) * 100);
      const isSnack = s.count >= settings.threshold;
      return `<div class="all-stats-item">
        <div>
          <div class="all-stats-item-name">${s.name} ${isSnack ? '🍬' : ''}</div>
          <div class="all-stats-item-id">${s.id}</div>
        </div>
        <div class="all-stats-bar-wrap">
          <div class="all-stats-bar-bg">
            <div class="all-stats-bar-fill" style="width:${pct}%"></div>
          </div>
          <div class="all-stats-count">${s.count}</div>
        </div>
      </div>`;
    }).join('');
  }
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
