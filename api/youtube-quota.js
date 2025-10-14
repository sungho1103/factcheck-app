export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // YouTube API 키 확인
    if (!process.env.YOUTUBE_API_KEY) {
      return res.status(200).json({
        enabled: false,
        remaining: 0
      });
    }

    // YouTube API 키가 있으면 활성화
    // 실제 quota는 Google Cloud Console에서 확인
    // 여기서는 하루 기본 할당량 표시
    return res.status(200).json({
      enabled: true,
      remaining: 100, // YouTube API 하루 약 100회 검색 가능
      daily_limit: 100
    });
    
  } catch (error) {
    console.error('Quota 조회 오류:', error);
    return res.status(500).json({ 
      enabled: false,
      error: error.message 
    });
  }
}
