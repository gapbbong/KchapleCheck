/**
 * ✝ 경성전자고 예배 출석 체크 - 고도화 버전 GAS (2026.03)
 * 
 * 주요 기능:
 * 1. 월요일 기준 주간 단위 시트 자동 생성 및 기록
 * 2. 전체 시트를 스캔하여 개인별 누적 출석 횟수 집계
 * 3. 간식 수령 상태 기록 및 조회 ("간식지급" 시트 활용)
 */

function doGet(e) {
  try {
    var ss = SpreadsheetApp.openById("1m5LhSPP2a8JPO9txoFCCZq3cSc5pBMznXwf_jdLQqz8");
    var action = e.parameter.action || "attendance";

    // 1. 통계 조회 (action=getStats)
    if (action === "getStats") {
      return getStats(ss);
    }

    // 2. 간식 지급 기록 (action=giveSnack)
    if (action === "giveSnack") {
      return giveSnack(ss, e.parameter.id, e.parameter.name);
    }

    // 3. 기본 출석 기록 (action=attendance)
    return recordAttendance(ss, e.parameter.id);

  } catch (err) {
    return ContentService.createTextOutput("ERROR: " + err.message);
  }
}

// ────────── [기능 1: 출석 기록] ──────────
function recordAttendance(ss, studentId) {
  if (!studentId) return ContentService.createTextOutput("ERROR: ID_REQUIRED");

  // 명단 확인
  var dbSheet = ss.getSheetByName("명단");
  var data = dbSheet.getRange(1, 1, dbSheet.getLastRow(), 2).getValues();
  var name = null;
  for (var i = 0; i < data.length; i++) {
    if (data[i][0].toString() === studentId) {
      name = data[i][1];
      break;
    }
  }
  if (!name) return ContentService.createTextOutput("NOT_FOUND");

  // 주간 시트 이름 결정 (해당 주의 월요일 날짜)
  var now = new Date();
  var day = now.getDay(); // 0(일) ~ 6(토)
  var diff = now.getDate() - day + (day == 0 ? -6 : 1); // 월요일로 조정
  var monday = new Date(now.setDate(diff));
  var sheetName = Utilities.formatDate(monday, "Asia/Seoul", "yyyy-MM-dd");

  var logSheet = ss.getSheetByName(sheetName);
  if (!logSheet) {
    logSheet = ss.insertSheet(sheetName);
    logSheet.appendRow(["날짜", "시간", "학번", "이름", "학번+이름"]);
  }

  // 중복 체크
  var logs = logSheet.getDataRange().getValues();
  for (var j = 1; j < logs.length; j++) {
    if (logs[j][2].toString() === studentId) {
      return ContentService.createTextOutput(name); // 이미 출석
    }
  }

  var timeStr = Utilities.formatDate(new Date(), "Asia/Seoul", "HH:mm:ss");
  var dateStr = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd");
  logSheet.appendRow([dateStr, timeStr, studentId, name, studentId + name]);

  return ContentService.createTextOutput(name);
}

// ────────── [기능 2: 누적 통계 조회] ──────────
function getStats(ss) {
  var sheets = ss.getSheets();
  var studentStats = {}; // { id: { name: "", count: 0, received: false } }
  
  // 1. 모든 출석 기록 스캔 (날짜 형식 시트, 2026년 3월 이후)
  var startDate = new Date("2026-03-01");
  sheets.forEach(function(sheet) {
    var name = sheet.getName();
    if (/^\d{4}-\d{2}-\d{2}$/.test(name)) {
      var sheetDate = new Date(name);
      if (sheetDate >= startDate) {
        var data = sheet.getDataRange().getValues();
        for (var i = 1; i < data.length; i++) {
          var id = data[i][2].toString();
          var studentName = data[i][3];
          if (!studentStats[id]) {
            studentStats[id] = { name: studentName, count: 0, received: false };
          }
          studentStats[id].count++;
        }
      }
    }
  });

  // 2. 간식 수령 여부 확인
  var snackSheet = ss.getSheetByName("간식지급");
  if (snackSheet) {
    var snackData = snackSheet.getDataRange().getValues();
    for (var k = 1; k < snackData.length; k++) {
      var sid = snackData[k][2].toString();
      if (studentStats[sid]) {
        studentStats[sid].received = true;
      }
    }
  }

  return ContentService.createTextOutput(JSON.stringify(studentStats))
    .setMimeType(ContentService.MimeType.JSON);
}

// ────────── [기능 3: 간식 지급 기록] ──────────
function giveSnack(ss, studentId, name) {
  var snackSheet = ss.getSheetByName("간식지급");
  if (!snackSheet) {
    snackSheet = ss.insertSheet("간식지급");
    snackSheet.appendRow(["날짜", "시간", "학번", "이름"]);
  }

  var now = new Date();
  var dateStr = Utilities.formatDate(now, "Asia/Seoul", "yyyy-MM-dd");
  var timeStr = Utilities.formatDate(now, "Asia/Seoul", "HH:mm:ss");
  
  snackSheet.appendRow([dateStr, timeStr, studentId, name]);
  return ContentService.createTextOutput("SUCCESS");
}
