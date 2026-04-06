require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 1. 설정 (config.js 및 .env 내용 기반)
const SUPABASE_URL = 'https://vanquishable-nonzoological-brandi.ngrok-free.dev';
const SERVICE_KEY = process.env.SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('❌ 에러: .env 파일에 SERVICE_ROLE_KEY가 없습니다.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  global: { headers: { 'ngrok-skip-browser-warning': 'true' } }
});

async function runBackup() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const timeStr = now.getHours().toString().padStart(2, '0') + 
                  now.getMinutes().toString().padStart(2, '0') + 
                  now.getSeconds().toString().padStart(2, '0');
  const fileName = `records_${dateStr}_${timeStr}.json`;
  const backupDir = path.join(__dirname, 'backups');
  const filePath = path.join(backupDir, fileName);

  console.log(`🚀 백업 시작: ${fileName}...`);

  try {
    // 2. 데이터 수집
    const tables = [
      'kchaple_students',
      'kchaple_attendance',
      'kchaple_discipleship_logs',
      'kchaple_discipleship_assignments',
      'kchaple_snacks'
    ];

    const backupData = {
      backup_at: now.toISOString(),
      version: '4.1',
      tables: {}
    };

    for (const table of tables) {
      console.log(` - ${table} 읽는 중...`);
      const { data, error } = await supabase.from(table).select('*');
      if (error) throw new Error(`${table} 로드 실패: ${error.message}`);
      backupData.tables[table] = data;
    }

    // 3. 파일 저장
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);
    fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), 'utf8');
    console.log(`✅ 로컬 백업 완료: ${filePath}`);

    // 4. Git 푸시
    try {
      console.log('📦 Git 업로드 중...');

      // GitHub Actions 환경인 경우 Git 사용자 설정 자동화
      if (process.env.GITHUB_ACTIONS) {
        console.log(' - CI 환경 감지: Git 사용자 설정 중...');
        execSync('git config user.name "github-actions[bot]"', { stdio: 'inherit' });
        execSync('git config user.email "41898282+github-actions[bot]@users.noreply.github.com"', { stdio: 'inherit' });
      }

      execSync(`git add backups/${fileName}`, { stdio: 'inherit' });
      execSync(`git commit -m "backup: auto records ${dateStr} ${timeStr}"`, { stdio: 'inherit' });
      
      // GitHub Actions에서는 권한 문제 방지를 위해 push 생략 가능 (workflow에서 별도 처리 권장)
      // 여기서는 명시적으로 수행
      execSync('git push origin main', { stdio: 'inherit' });
      
      console.log('⭐ Git 백업 성공!');
    } catch (gitErr) {
      console.warn('⚠️ Git 푸시 실패 (로컬 백업은 유지됨):', gitErr.message);
    }

  } catch (err) {
    console.error('❌ 백업 중 치명적 오류:', err.message);
    process.exit(1);
  }
}

runBackup();
