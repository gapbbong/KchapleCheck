const CONFIG = {
  // 배포 환경(Netlify)인 경우 CORS 문제 해결을 위해 프록시(/supabase-api) 주소를 사용합니다.
  // 로컬 개발 환경인 경우 직접 ngrok 주소로 연결합니다.
  SUPABASE_URL: window.location.hostname.includes('netlify.app') 
    ? window.location.origin + '/supabase-api'
    : 'https://vanquishable-nonzoological-brandi.ngrok-free.dev',
  
  // 실제 Supabase JWT Anon Key 적용
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE'
};
