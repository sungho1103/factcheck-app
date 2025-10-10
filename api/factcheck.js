export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { claim } = req.body;

  if (!claim) {
    return res.status(400).json({ error: 'Claim is required' });
  }

  try {
    // 1단계: 네이버 뉴스 검색
    const newsResponse = await fetch(
      `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(claim)}&display=10&sort=date`,
      {
        headers: {
          'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
          'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET
        }
      }
    );

    if (!newsResponse.ok) {
      throw new Error('네이버 검색 API 오류');
    }

    const newsData = await newsResponse.json();
    
    // 검색 결과를 텍스트로 정리
    const searchResults = newsData.items.map((item, idx) => {
      const title = item.title.replace(/<[^>]*>/g, '');
      const description = item.description.replace(/<[^>]*>/g, '');
      
      return `[출처 ${idx + 1}] ${title}
설명: ${description}
언론사: ${item.originallink || item.link}
날짜: ${item.pubDate}`;
    }).join('\n\n');

    // 2단계: OpenAI로 팩트체크 분석
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: `당신은 한국 정치 뉴스 팩트체크 전문가입니다. 
제공된 네이버 뉴스 검색 결과를 바탕으로 주장을 검증하세요.

반드시 다음 JSON 형식으로만 응답하세요:
{
  "verdict": "사실/거짓/부분적 사실/확인 불가",
  "confidence": "높음/중간/낮음",
  "summary": "한 문장 요약",
  "details": "상세 분석 (여러 출처를 비교하여 설명)",
  "sources": [
    {
      "title": "기사 제목",
      "url": "URL",
      "date": "날짜"
    }
  ],
  "reasoning": "판단 근거"
}`
          },
          {
            role: "user",
            content: `검증할 주장: ${claim}

네이버 뉴스 검색 결과:
${searchResults}

위 검색 결과를 바탕으로 이 주장을 팩트체크해주세요.`
          }
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: "json_object" }
      })
    });

    if (!aiResponse.ok) {
      const error = await aiResponse.json();
      throw new Error(error.error?.message || 'OpenAI API 오류');
    }

    const aiData = await aiResponse.json();
    
    res.status(200).json({
      content: [
        {
          type: "text",
          text: aiData.choices[0].message.content
        }
      ]
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}
