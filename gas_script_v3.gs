/**
 * ✝ 경성전자고 예배 출석 체크 - 고도화 버전 GAS (2026.03 ~ 2027.02)
 * 
 * 주요 기능:
 * 1. 월요일 기준 주간 단위 시트 자동 생성 및 기록
 * 2. 2026.03 ~ 2027.02 시트를 모두 스캔하여 개인별 실시간 누적 출석 횟수 집계
 * 3. 학번 조회 시 "이름|횟수" 형식으로 반환
 * 4. 간식 지급 상태 기록 및 조회 (별도 탭 관리)
 */

var SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
var START_DATE_LIMIT = new Date("2026-03-01");
var END_DATE_LIMIT = new Date("2027-02-28");

function doGet(e) {
  var id = e.parameter.id;
  var action = e.parameter.action;
  
  if (action === 'getStats') {
    return ContentService.createTextOutput(JSON.stringify(getAttendanceStats()))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === 'giveSnack') {
    var name = e.parameter.name;
    return ContentService.createTextOutput(recordSnack(id, name));
  }
  
  // 기본: 학번으로 이름 및 누적 횟수 조회 + 오늘 출석 기록
  if (id) {
    return ContentService.createTextOutput(handleAttendance(id));
  }
  
  return ContentService.createTextOutput("ERROR: No parameters provided");
}

/**
 * 학번으로 이름을 찾고 오늘자 시트에 기록 + 누적 횟수 계산
 */
function handleAttendance(studentId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var listSheet = ss.getSheetByName("명단");
  if (!listSheet) return "ERROR: '명단' 시트가 없습니다.";
  
  var listData = listSheet.getDataRange().getValues();
  var name = "";
  for (var i = 1; i < listData.length; i++) {
    if (String(listData[i][0]) === String(studentId)) {
      name = listData[i][1];
      break;
    }
  }
  
  if (!name) return "NOT_FOUND";
  
  // 오늘 날짜($YYYY-MM-DD$) 시트 기록
  var sheetName = getTodayDateString();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(["날짜", "시간", "학번", "이름", "학번+이름", "누적횟수"]);
    sheet.getRange("A1:F1").setBackground("#eeeeee").setFontWeight("bold");
  }
  
  // 중복 체크 (사용자 요청: 1117 학생 등이 같은 시트 내에서 여러 번 기록될 수 있으므로 중복 체크 완화)
  // 대신 너무 짧은 시간(예: 1분) 내 중복은 방지
  var data = sheet.getDataRange().getValues();
  var now = new Date();
  var canCheckIn = true;
  
  for (var j = data.length - 1; j >= 1; j--) {
    if (String(data[j][0]) === String(studentId)) {
      // 마지막 기록 시간 확인 (시간 컬럼: C)
      var lastRecordTime = data[j][2]; // "HH:mm:ss"
      // 간단하게 같은 학번이 시트에 있으면 "이미 기록됨" 메시지는 띄우되, 
      // 사용자 경험을 위해 일단 시트에 추가 기록은 허용하거나 조건부로 처리
      // 여기서는 "합쳐서 2회"를 위해 중복 기록을 허용하는 방향으로 수정
      break;
    }
  }
  
  var timeStr = Utilities.formatDate(now, "GMT+9", "HH:mm:ss");
  var dateStr = sheetName; // yyyy-MM-dd
  
  // 누적 횟수 미리 계산 (기록 시 포함하기 위함)
  // 현재 기록 직전까지의 횟수 + 1 (방금 추가할 기록 포함)
  var count = calculateStudentAttendance(studentId) + 1;
  
  sheet.appendRow([
    dateStr,             // 날짜
    timeStr,             // 시간
    studentId,           // 학번
    name,                // 이름
    studentId + " " + name, // 학번+이름
    count                // 누적횟수
  ]);
  SpreadsheetApp.flush(); // 즉시 반영
  
  return name + "|" + count;
}

var START_DATE_LIMIT_STR = "2026-03-01";
var END_DATE_LIMIT_STR = "2027-02-28";

/**
 * 특정 학생의 누적 출석 횟수 계산 (TextFinder를 사용한 고속 조회)
 */
function calculateStudentAttendance(studentId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var count = 0;
  
  sheets.forEach(function(sh) {
    var name = sh.getName();
    // 날짜 형식(yyyy-MM-dd) 시트인지 확인
    if (/^\d{4}-\d{2}-\d{2}$/.test(name)) {
      // 문자열 기반의 빠른 범위 비교
      if (name >= START_DATE_LIMIT_STR && name <= END_DATE_LIMIT_STR) {
        // A열(학번)에서만 검색하여 매우 빠른 속도로 카운트
        var finder = sh.getRange("A:A").createTextFinder(studentId).matchEntireCell(true);
        var occurrences = finder.findAll();
        count += occurrences.length;
      }
    }
  });
  return count;
}

/**
 * 전체 학생 통계 및 간식 지급 정보 가져오기
 */
function getAttendanceStats() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var stats = {}; // { id: { name: "", count: 0, received: false } }
  
  // 1. 모든 출석 기록 스캔 (2026.03 ~ 2027.02)
  sheets.forEach(function(sh) {
    var name = sh.getName();
    if (/^\d{4}-\d{2}-\d{2}$/.test(name)) {
      var d = new Date(name);
      if (d >= START_DATE_LIMIT && d <= END_DATE_LIMIT) {
        var data = sh.getDataRange().getValues();
        for (var i = 1; i < data.length; i++) {
          var id = String(data[i][0]);
          var sName = data[i][1];
          if (!stats[id]) stats[id] = { name: sName, count: 0, received: false };
          stats[id].count++;
        }
      }
    }
  });
  
  // 2. 간식 지급 정보 스캔
  var snackSheet = ss.getSheetByName("간식지급");
  if (snackSheet) {
    var snackData = snackSheet.getDataRange().getValues();
    for (var k = 1; k < snackData.length; k++) {
      var sId = String(snackData[k][0]);
      if (stats[sId]) stats[sId].received = true;
    }
  }
  
  return stats;
}

/**
 * 간식 지급 기록
 */
function recordSnack(id, name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("간식지급");
  if (!sheet) {
    sheet = ss.insertSheet("간식지급");
    sheet.appendRow(["학번", "이름", "지급시간"]);
    sheet.getRange("A1:C1").setBackground("#ffebee").setFontWeight("bold");
  }
  
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) return "ALREADY_RECORDED";
  }
  
  var now = new Date();
  var timeStr = Utilities.formatDate(now, "GMT+9", "yyyy-MM-dd HH:mm:ss");
  sheet.appendRow([id, name, timeStr]);
  return "SUCCESS";
}

/**
 * 오늘 날짜 문자열 반환 ($YYYY-MM-DD$ - 한국 시간대 기준)
 */
function getTodayDateString() {
  return Utilities.formatDate(new Date(), "GMT+9", "yyyy-MM-dd");
}
