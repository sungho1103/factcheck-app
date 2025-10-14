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

    // Upstash Redis 확인
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      // Redis 없으면 기본값 반환
      return res.status(200).json({
        enabled: true,
        remaining: 99,
        daily_limit: 99
      });
    }

    // 오늘 날짜 키
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const quotaKey = `youtube:quota:${today}`;

    // Upstash Redis REST API로 quota 조회
    const getResponse = await fetch(
      `${process.env.UPSTASH_REDIS_REST_URL}/get/${quotaKey}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`
        }
      }
    );

    const getData = await getResponse.json();
    const usedCount = getData.result ? parseInt(getData.result) : 0;
    const remaining = Math.max(0, 99 - usedCount);

    return res.status(200).json({
      enabled: true,
      remaining: remaining,
      daily_limit: 99,
      used: usedCount
    });
    
  } catch (error) {
    console.error('Quota 조회 오류:', error);
    return res.status(200).json({ 
      enabled: true,
      remaining: 99,
      error: error.message 
    });
  }
}
