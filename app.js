/**
 * ✝ 경성전자고 예배 출석 체크 앱
 * app.js — 메인 로직 (Supabase Migration)
 */

// ────────────────────────────────────
// 설정 / 상태
// ────────────────────────────────────
const STORAGE_KEY  = 'chapel_settings';
const RECORDS_KEY  = 'chapel_records';  // { 'YYYY-MM-DD': [{id, name, time}, ...] }
const DEFAULT_THRESHOLD = 5;

// 2026학년도 범위 설정 (2026.03 ~ 2027.02)
const START_DATE_LIMIT = '2026-03-01';
const END_DATE_LIMIT   = '2027-02-28';

// Supabase Client Initialization (v3.9: ngrok 경고 무시 헤더 추가)
const supabaseClient = window.supabase ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  global: {
    headers: { 'ngrok-skip-browser-warning': 'true' }
  }
}) : null;

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
let allAttendanceRaw = [];    // 전체 출석 로우 데이터 (상세 조회용)
let currentMode = 'chapel';   // 'chapel' (일반예배), '1on1' (제자훈련)

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
  renderMentorList(); // 추가
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
  if (!settings.mentors) settings.mentors = []; // 기저값 설정
  if (!settings.lastMentorName) settings.lastMentorName = ''; // 마지막 양육자
  thresholdValEl.textContent = settings.threshold;
  
  // 양육자 입력창 초기화 (v2.7)
  const mentorMain = document.getElementById('mentorNameMain');
  if (mentorMain) mentorMain.value = settings.lastMentorName;
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
    // 입력 칸에 포커스가 있으면 무시 (v3.3)
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

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
  document.getElementById('statsBtn').addEventListener('click',    () => { showScreen('stats'); fetchServerStats(); });
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

  // 모드 전환 (v2.6)
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentMode = tab.dataset.mode;
      document.querySelector('.mode-tabs').dataset.mode = currentMode;
      
      const mentorBox = document.getElementById('mentorInputMainBox');
      if (currentMode === '1on1') {
        mentorBox.classList.remove('hidden');
      } else {
        mentorBox.classList.add('hidden');
      }

      // 모드 변경 시 UI 초기화
      currentInput = '';
      updateDisplay();
      clearResultBadge();
    });
  });



  // 양육자 이름 수동 저장 (v2.7)
  const mentorMain = document.getElementById('mentorNameMain');
  if (mentorMain) {
    mentorMain.addEventListener('input', () => {
      settings.lastMentorName = mentorMain.value.trim();
      saveSettingsToStorage();
    });
  }
}

function renderMentorList() {
  // 제어권이 메인 화면으로 이동함에 따라 빈 함수로 둠 (v2.8)
}
function deleteMentor(name) {
  if (confirm(`${name} 담당자를 삭제할까요?`)) {
    settings.mentors = settings.mentors.filter(m => m !== name);
    saveSettingsToStorage();
    renderMentorList();
  }
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
  
  listEl.innerHTML = '';
  dates.forEach(date => {
    const d = dailyStatsData[date];
    const item = document.createElement('div');
    item.className = 'daily-item';
    item.style.display = 'flex';
    item.style.justifyContent = 'space-between';
    item.style.cursor = 'pointer';
    item.onclick = () => showDailyDetail(date);
    
    item.innerHTML = `
      <span style="flex: 1.5;">${date}</span>
      <span style="flex: 1; text-align: center; color: var(--accent); font-weight: 800;">${d.discipleship || 0}명</span>
      <span class="count" style="flex: 1; text-align: right;">${d.chapel || 0}명 <span class="material-icons-round" style="font-size:14px;vertical-align:middle">chevron_right</span></span>
    `;
    listEl.appendChild(item);
  });
}

function showDailyDetail(date) {
  const filtered = allAttendanceRaw.filter(a => a.date === date);
  const students = filtered.map(a => {
    const s = serverStats[a.student_id] || { name: '이름없음', count: 0 };
    return { id: a.student_id, name: s.name, count: s.count };
  }).sort((a, b) => a.id.localeCompare(b.id));

  // 통계 계산
  const gradeStats = { 1: 0, 2: 0, 3: 0 };
  const classStats = {}; // "1-1", "1-2" 등
  const freqStats  = {}; // "5회", "4회" 등

  students.forEach(s => {
    // 학년/반 파싱 (학번 규칙: 1101 -> 1학년 1반, 10101 -> 1학년 01반)
    const grade = s.id[0];
    let clsNum = '';
    if (s.id.length === 4) {
      clsNum = s.id[1];
    } else {
      clsNum = s.id.slice(1, 3);
    }
    const clsKey = `${grade}-${parseInt(clsNum)}`;

    if (gradeStats[grade] !== undefined) gradeStats[grade]++;
    classStats[clsKey] = (classStats[clsKey] || 0) + 1;
    
    const fKey = `${s.count}회`;
    freqStats[fKey] = (freqStats[fKey] || 0) + 1;
  });

  // UI 생성
  let html = `
    <div class="detail-view-container">
      <div class="detail-header">
        <button class="detail-close" onclick="closeOverlay()">
          <span class="material-icons-round">close</span>
        </button>
        <div class="detail-date">${date} 상세 통계</div>
      </div>
      
      <div class="detail-body">
        <div class="detail-section">
          <div class="detail-section-title">🎓 학년별 인원</div>
          <div class="detail-grid">
            <div class="grid-item"><span>1학년</span><strong>${gradeStats[1]}명</strong></div>
            <div class="grid-item"><span>2학년</span><strong>${gradeStats[2]}명</strong></div>
            <div class="grid-item"><span>3학년</span><strong>${gradeStats[3]}명</strong></div>
          </div>
        </div>

        <div class="detail-section">
          <div class="detail-section-title">📊 누적 참여도 (올해 총 횟수)</div>
          <div class="detail-flex-wrap">
            ${Object.keys(freqStats).sort((a,b) => parseInt(b)-parseInt(a)).map(f => `
              <div class="flex-item"><span>${f}</span><strong>${freqStats[f]}명</strong></div>
            `).join('')}
          </div>
        </div>

        <div class="detail-section">
          <div class="detail-section-title">🏫 반별 인원 (참석자 기준)</div>
          <div class="detail-grid-small">
            ${Array.from({length:3}, (_,i) => i+1).map(g => 
              Array.from({length:6}, (_,i) => i+1).map(c => {
                const key = `${g}-${c}`;
                return `<div class="grid-item-s ${classStats[key] ? 'active' : ''}">
                  <span class="label">${g}-${c}</span>
                  <span class="val">${classStats[key] || 0}</span>
                </div>`;
              }).join('')
            ).join('')}
          </div>
        </div>

        <div class="detail-section">
          <div class="detail-section-title">📝 전체 명단 (${students.length}명)</div>
          <div class="detail-student-list">
            ${students.map(s => `
              <div class="student-row">
                <span class="s-id">${s.id}</span>
                <span class="s-name">${s.name}</span>
                <span class="s-count">${s.count}회</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  overlayIcon.innerHTML = ''; // 아이콘 제거
  overlayIcon.style.display = 'none';
  overlayName.style.display = 'none';
  overlaySub.style.display = 'none';
  
  // 기존 카드 대신 새로운 컨테이너 주입
  overlayCard.innerHTML = html;
  overlayCard.style.padding = '0';
  overlayCard.style.width = '90%';
  overlayCard.style.maxWidth = '440px';
  overlayCard.style.maxHeight = '85vh';
  overlayCard.style.overflow = 'hidden';
  overlayCard.style.display = 'flex';
  overlayCard.style.flexDirection = 'column';

  overlay.classList.add('show');
  overlay.classList.remove('hidden');
}

// 오버레이 닫을 때 카드 복구 로직 추가 필요 (기존 출석 체크 오버레이와 호환)
function closeOverlay() {
  overlay.classList.add('hidden');
  overlay.classList.remove('show');
  
  // 카드 스타일 초기화 (다음 출석 체크 팝업을 위해)
  setTimeout(() => {
    overlayCard.style = '';
    overlayIcon.style.display = 'block';
    overlayName.style.display = 'block';
    overlaySub.style.display = 'block';
    overlayIcon.innerHTML = ''; 
    overlayCard.innerHTML = `
      <div id="overlayIcon" class="overlay-icon"></div>
      <div id="overlayName" class="overlay-name"></div>
      <div id="overlaySub" class="overlay-sub"></div>
    `;
    // DOM 다시 찾기 (innerHTML로 날아갔으므로)
    window.overlayIcon = document.getElementById('overlayIcon');
    window.overlayName = document.getElementById('overlayName');
    window.overlaySub  = document.getElementById('overlaySub');
  }, 300);
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

    // 2. Fetch attendance and daily stats (Filter by current academic year)
    const { data: attendance, error: attErr } = await supabaseClient
      .from('kchaple_attendance')
      .select('*')
      .gte('date', START_DATE_LIMIT)
      .lte('date', END_DATE_LIMIT);
    if (attErr) throw attErr;

    const { data: discipleship, error: dErr } = await supabaseClient
      .from('kchaple_discipleship_logs')
      .select('date')
      .gte('date', START_DATE_LIMIT)
      .lte('date', END_DATE_LIMIT);
    if (dErr) console.error('제자훈련 로그 로드 실패:', dErr);

    allAttendanceRaw = attendance; // 전역 저장

    // 3. Fetch snacks
    const { data: snacks, error: snacksErr } = await supabaseClient.from('kchaple_snacks').select('student_id');
    if (snacksErr) throw snacksErr;

    // Process dailyStatsData { 'YYYY-MM-DD': { chapel: n, discipleship: m } }
    dailyStatsData = {};
    attendance.forEach(a => {
      const d = a.date;
      if (!dailyStatsData[d]) dailyStatsData[d] = { chapel: 0, discipleship: 0 };
      dailyStatsData[d].chapel++;
    });
    (discipleship || []).forEach(d => {
      const date = d.date;
      if (!dailyStatsData[date]) dailyStatsData[date] = { chapel: 0, discipleship: 0 };
      dailyStatsData[date].discipleship++;
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

    (snacks || []).forEach(s => {
      if (serverStats[s.student_id]) {
        serverStats[s.student_id].received = true;
      }
    });

    renderStatsScreen();
  } catch (err) {
    console.error('서버 통계 로드 실패:', err);
    snackListEl.innerHTML = `<div class="empty-msg">서버 연결에 실패했습니다<br><small style="opacity:0.7">(${err.message})</small></div>`;
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

/**
 * 특정 학생의 모든 데이터 삭제 (v4.0)
 */
async function deleteStudentComplete(id, name) {
  if (isSubmitting) return;
  const confirmed = confirm(`⚠️ [위험] ${name}(${id}) 학생의 모든 데이터를 삭제할까요?\n\n이 학생의 [출석, 제자훈련, 간식수령] 기록이 모두 사라집니다. 다시 복구할 수 없으니 신중히 결정해 주세요.`);
  if (!confirmed) return;

  isSubmitting = true;
  showOverlay('🗑️', '삭제 중...', `${name} 데이터 정리 중`);

  try {
    // 1. Supabase에서 관련 테이블 데이터 연쇄 삭제
    const tables = [
      { name: 'kchaple_snacks', col: 'student_id' },
      { name: 'kchaple_attendance', col: 'student_id' },
      { name: 'kchaple_discipleship_logs', col: 'student_id' },
      { name: 'kchaple_discipleship_assignments', col: 'student_id' },
      { name: 'kchaple_students', col: 'id' }
    ];

    for (const table of tables) {
      const { error } = await supabaseClient
        .from(table.name)
        .delete()
        .eq(table.col, id);
      
      if (error) {
        console.warn(`${table.name} 삭제 중 오류(무시가능):`, error.message);
      }
    }

    // 2. 로컬 기록에서도 제거
    Object.keys(allRecords).forEach(date => {
      allRecords[date] = (allRecords[date] || []).filter(r => r.id !== id);
    });
    saveAllRecords();
    syncTodayRecords();

    showOverlay('✅', '삭제 완료', `${name} 학생의 모든 기록이 제거되었습니다.`);
    
    // 3. 데이터 다시 불러오기 (통계 화면 갱신)
    setTimeout(fetchServerStats, 500);

  } catch (err) {
    console.error('데이터 삭제 실패:', err);
    showToast('❌ 삭제 중 오류가 발생했습니다.');
    } finally {
    isSubmitting = false;
  }
}

/**
 * 롱 프레스 감지 (v4.1)
 */
let pressTimer = null;
function h_start(e, id, name) {
  if (e.target.closest('.snack-give-btn')) return; // 지급 버튼 클릭 시 제외
  
  const el = e.currentTarget;
  el.classList.add('pressing');
  
  pressTimer = setTimeout(() => {
    deleteStudentComplete(id, name);
    h_end();
  }, 850);
}

function h_end() {
  clearTimeout(pressTimer);
  document.querySelectorAll('.snack-item').forEach(el => el.classList.remove('pressing'));
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

  const studentId = currentInput.trim();
  if (studentId.length !== 4) {
    showToast('❌ 학번 4자리를 정확히 입력해 주세요.');
    isSubmitting = false; setSubmitLoading(false); return;
  }

  try {
    // 1. Check if student exists
    const { data: student, error: studentErr } = await supabaseClient
      .from('kchaple_students')
      .select('name')
      .eq('id', studentId)
      .maybeSingle();

    if (studentErr) {
      showErrorBadge('🌐 서버 연결 오류 (네트워크 확인)');
      shakeDisplay();
      showOverlay('🌐', '연결 오류', `서버에 접속할 수 없습니다. (에러: ${studentErr.message})`);
      return;
    }

    if (!student) {
      showErrorBadge('❌ 등록되지 않은 학번입니다');
      shakeDisplay();
      showOverlay('❌', '학번 없음', `${studentId}는 명단에 없습니다`);
      return;
    }
    
    const name = student.name;
    const dateStr = getTodayKey();

    // --- [v2.6 제자훈련 모드 처리] ---
    if (currentMode === '1on1') {
      // 1. 배정 확인 (Supabase에서 멘토 확인)
      const { data: assign, error: assignErr } = await supabaseClient
        .from('kchaple_discipleship_assignments')
        .select('mentor_name')
        .eq('student_id', studentId)
        .maybeSingle();
      
      const mentorMainInput = document.getElementById('mentorNameMain').value.trim();
      let mentorName = mentorMainInput || (assign ? assign.mentor_name : null);

      // 멘토가 없으면 강제 중단 (v2.8 수정)
      if (!mentorName) {
        showToast('❌ 양육자 성함을 먼저 입력해 주세요.');
        isSubmitting = false; setSubmitLoading(false); return;
      }

      // 배정 정보 업데이트 (입력한 이름이 있으면 자동 배정/갱신)
      if (mentorMainInput) {
        await supabaseClient.from('kchaple_discipleship_assignments').upsert({ student_id: studentId, mentor_name: mentorName });
      }

      // 2. 제자훈련 기록
      const { error: discErr } = await supabaseClient
        .from('kchaple_discipleship_logs')
        .insert([{ student_id: studentId, mentor_name: mentorName, date: dateStr }]);

      if (discErr && discErr.code !== '23505') throw discErr;

      // 3. 현재까지 횟수 계산 (4주차 완료 여부 확인용)
      const { count: discCount } = await supabaseClient
        .from('kchaple_discipleship_logs')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', studentId)
        .gte('date', START_DATE_LIMIT)
        .lte('date', END_DATE_LIMIT);

      const statusMsg = discCount >= 4 ? `🎉 수료생(완료) - ${discCount}회차` : `🏃 ${discCount}회차 진행 중`;
      showOverlay('📖', `${name} & ${mentorName}`, statusMsg);
      
      // 4. 일반 출석도 자동 체크 (아래 로직으로 이어짐)
      showToast('✅ 제자훈련 및 일반 예배 동시 체크됨');
    }
    // --- [v2.6 끝] ---

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
        .eq('student_id', studentId)
        .gte('date', START_DATE_LIMIT)
        .lte('date', END_DATE_LIMIT);
        
      if (currentMode === 'chapel' || currentMode === '1on1') {
        showDupBadge(`✅ ${name} (이미 출석함)`);
        showOverlay('✅', name, `이미 출석 완료되었습니다. 오늘 하루도 평안하세요! 😊`);
      }
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
        .eq('student_id', studentId)
        .gte('date', START_DATE_LIMIT)
        .lte('date', END_DATE_LIMIT);

      // Local state update
      const now = new Date();
      const timeStr = now.toTimeString().slice(0, 8);
      const record  = { id: studentId, name, time: timeStr };

      todayRecords.push(record);
      const key = getTodayKey();
      allRecords[key] = todayRecords;
      saveAllRecords();

      if (currentMode === 'chapel') {
        showSuccessBadge(`🎉 ${name} (${count || 1}회 출석)`);
        showOverlay('🙌', name, `${studentId} · 출석 완료 (누적 ${count || 1}회)`);
      }
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
    
    return `<div class="snack-item ${isTarget && !isReceived ? 'highlight' : ''}" 
                 onmousedown="h_start(event, '${s.id}', '${s.name}')" 
                 onmouseup="h_end()" 
                 onmouseleave="h_end()" 
                 ontouchstart="h_start(event, '${s.id}', '${s.name}')" 
                 ontouchend="h_end()" 
                 ontouchmove="h_end()">
      <div class="snack-item-rank">${i + 1}</div>
      <div class="snack-item-info">
        <div class="snack-item-name">${s.name} ${isReceived ? '✅' : ''}</div>
        <div class="snack-item-id">${s.id}</div>
      </div>
      <div class="snack-item-count">${s.count}회</div>
      <div style="display: flex; gap: 6px;">
        ${isTarget && !isReceived ? 
          `<button class="snack-give-btn" onclick="markSnackAsReceived('${s.id}', '${s.name}')">지급 완료</button>` : 
          (isReceived ? '<div class="received-badge"><span>✓</span>수령함</div>' : '')
        }
      </div>
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
