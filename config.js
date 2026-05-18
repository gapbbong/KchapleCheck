const CONFIG = {
  // 배포 환경(Netlify)인 경우 CORS 문제 해결을 위해 프록시(/supabase-api) 주소를 사용합니다.
  // 로컬 개발 환경인 경우 직접 Supabase 클라우드 주소로 연결합니다.
  SUPABASE_URL: window.location.hostname.includes('netlify.app') 
    ? window.location.origin + '/supabase-api'
    : 'https://oxalbyjhvqbdwnbdrpwv.supabase.co',
  
  // 실제 Supabase JWT Anon Key 적용
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94YWxieWpodnFiZHduYmRycHd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzEzMDIsImV4cCI6MjA5NDY0NzMwMn0.A7KfLmMN_MPZb4gE2gRaGHxT7tkc9rZgMmzIOTjCzxM'
};
