require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://oxalbyjhvqbdwnbdrpwv.supabase.co';
const SERVICE_KEY = process.env.SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('❌ .env 파일에 SERVICE_ROLE_KEY가 없습니다.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function migrate() {
  const backupFile = path.join(__dirname, 'backups', 'records_2026-05-11_082849.json');
  console.log(`🚀 데이터 복원 시작: ${backupFile}`);

  try {
    const rawData = fs.readFileSync(backupFile, 'utf8');
    const { tables } = JSON.parse(rawData);

    // 1. 학생 명단 복원
    if (tables.kchaple_students && tables.kchaple_students.length > 0) {
      console.log(`- kchaple_students (${tables.kchaple_students.length}명) 복원 중...`);
      const { error } = await supabase.from('kchaple_students').upsert(tables.kchaple_students, { onConflict: 'id' });
      if (error) console.error('❌ 학생 명단 복원 에러:', error.message);
      else console.log('✅ 학생 명단 복원 완료');
    }

    // 2. 멘토 배정 복원
    if (tables.kchaple_discipleship_assignments && tables.kchaple_discipleship_assignments.length > 0) {
      console.log(`- kchaple_discipleship_assignments (${tables.kchaple_discipleship_assignments.length}건) 복원 중...`);
      const { error } = await supabase.from('kchaple_discipleship_assignments').upsert(tables.kchaple_discipleship_assignments, { onConflict: 'student_id' });
      if (error) console.error('❌ 멘토 배정 복원 에러:', error.message);
      else console.log('✅ 멘토 배정 복원 완료');
    }

    // 3. 제자훈련 로그 복원
    if (tables.kchaple_discipleship_logs && tables.kchaple_discipleship_logs.length > 0) {
      console.log(`- kchaple_discipleship_logs (${tables.kchaple_discipleship_logs.length}건) 복원 중...`);
      const cleanLogs = tables.kchaple_discipleship_logs.map(item => ({
        student_id: item.student_id,
        mentor_name: item.mentor_name,
        date: item.date,
        created_at: item.created_at
      }));
      const { error } = await supabase.from('kchaple_discipleship_logs').upsert(cleanLogs, { onConflict: 'student_id,date' });
      if (error) console.error('❌ 제자훈련 로그 복원 에러:', error.message);
      else console.log('✅ 제자훈련 로그 복원 완료');
    }

    // 4. 간식 수령 복원
    if (tables.kchaple_snacks && tables.kchaple_snacks.length > 0) {
      console.log(`- kchaple_snacks (${tables.kchaple_snacks.length}건) 복원 중...`);
      const { error } = await supabase.from('kchaple_snacks').upsert(tables.kchaple_snacks, { onConflict: 'student_id' });
      if (error) console.error('❌ 간식 수령 복원 에러:', error.message);
      else console.log('✅ 간식 수령 복원 완료');
    }

    // 5. 예배 출석 복원 (데이터량이 많을 수 있으므로 500개씩 청크 분할 및 id 속성 제거)
    if (tables.kchaple_attendance && tables.kchaple_attendance.length > 0) {
      console.log(`- kchaple_attendance (${tables.kchaple_attendance.length}건) 복원 중...`);
      const cleanAttendance = tables.kchaple_attendance.map(item => ({
        student_id: item.student_id,
        date: item.date,
        created_at: item.created_at
      }));
      const chunkSize = 500;
      for (let i = 0; i < cleanAttendance.length; i += chunkSize) {
        const chunk = cleanAttendance.slice(i, i + chunkSize);
        const { error } = await supabase.from('kchaple_attendance').upsert(chunk, { onConflict: 'student_id,date' });
        if (error) console.error(`❌ 예배 출석 복원 에러 (청크 ${i}~):`, error.message);
      }
      console.log('✅ 예배 출석 복원 완료');
    }

    console.log('🎉 모든 데이터베이스 마이그레이션이 성공적으로 완료되었습니다!');
  } catch (err) {
    console.error('❌ 마이그레이션 중 오류 발생:', err.message);
  }
}

migrate();
