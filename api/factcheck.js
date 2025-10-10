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
    console.log('팩트체크 시작:', claim);
    
    if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
      throw new Error('네이버 API 키가 설정되지 않았습니다.');
    }
    
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API 키가 설정되지 않았습니다.');
    }

    // 네이버 뉴스 검색
    console.log('네이버 검색 시작...');
    const newsResponse = await fetch(
      `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(claim)}&display=20&sort=date`,
      {
        headers: {
          'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
          'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET
        }
      }
    );

    if (!newsResponse.ok) {
      throw new Error(`네이버 검색 API 오류: ${newsResponse.status}`);
    }

    const newsData = await newsResponse.json();
    console.log('네이버 검색 결과:', newsData.total, '건');
    
    if (!newsData.items || newsData.items.length === 0) {
      return res.status(200).json({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              verdict: "확인 불가",
              confidence: 0,
              summary: "관련 뉴스를 찾을 수 없습니다.",
              details: "검색 결과가 없어 팩트체크를 진행할 수 없습니다.",
              politicalBias: 5,
              biasExplanation: "데이터 부족으로 분석 불가",
              credibilityScore: {
                fact: 0,
                misinformation: 0,
                partialTruth: 0,
                unverified: 100
              },
              sources: [],
              timeline: [],
              misinformationSources: [],
              reasoning: "검색 결과 없음"
            })
          }
        ]
      });
    }
    
    // 검색 결과 정리
    const searchResults = newsData.items.map((item, idx) => {
      const title = item.title.replace(/<[^>]*>/g, '');
      const description = item.description.replace(/<[^>]*>/g, '');
      
      return `[출처 ${idx + 1}]
제목: ${title}
설명: ${description}
URL: ${item.originallink || item.link}
발행일: ${item.pubDate}
---`;
    }).join('\n\n');

    console.log('OpenAI 분석 시작... (모델: gpt-4o-mini)');

    // OpenAI 분석 - gpt-4o-mini 사용
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",  // 모델 변경!
        messages: [
          {
            role: "system",
            content: `당신은 한국 정치 뉴스 전문 팩트체커입니다.

중요: 반드시 아래 형식을 정확히 따라주세요. 모든 필드를 실제 값으로 채워야 합니다.

응답 형식 (JSON만 출력):
{
  "verdict": "사실" 또는 "거짓" 또는 "부분적 사실" 또는 "확인 불가",
  "confidence": 85,
  "summary": "한 문장으로 핵심 요약",
  "details": "상세한 분석 내용",
  "politicalBias": 5,
  "biasExplanation": "정치적 편향성 설명",
  "credibilityScore": {
    "fact": 70,
    "misinformation": 10,
    "partialTruth": 15,
    "unverified": 5
  },
  "sources": [
    {
      "title": "실제 기사 제목",
      "url": "https://실제URL",
      "date": "2024-10-10",
      "outlet": "조선일보",
      "credibility": "높음",
      "type": "주요언론",
      "reliability": 85
    }
  ],
  "timeline": [
    {
      "date": "2024-10-01",
      "event": "구체적인 사건 내용",
      "source": "출처명"
    },
    {
      "date": "2024-10-05",
      "event": "다음 사건",
      "source": "출처명"
    }
  ],
  "misinformationSources": [
    {
      "platform": "특정 플랫폼명",
      "description": "어떤 거짓정보가 퍼졌는지"
    }
  ],
  "reasoning": "판단 근거",
  "recommendations": "추가 확인 필요사항"
}

필수 규칙:
1. outlet은 검색 결과에서 실제 언론사 이름 추출 (예: 조선일보, KBS, 연합뉴스, YTN, SBS)
2. timeline은 최소 2개 이상의 이벤트 포함
3. date는 YYYY-MM-DD 형식
4. reliability는 0-100 사이 실제 숫자
5. 모든 배열은 최소 1개 이상 포함
6. credibility는 반드시 "높음", "중간", "낮음" 중 하나
7. type은 "주요언론", "온라인매체", "정부기관", "연구소", "SNS" 중 하나`
          },
          {
            role: "user",
            content: `검증할 주장: ${claim}

네이버 뉴스 검색 결과 (${newsData.items.length}건):
${searchResults}

위 검색 결과를 분석하여:
1. 각 기사의 언론사 이름을 정확히 추출하세요
2. 시간순으로 사건을 정리하세요 (최소 2개)
3. 각 출처의 신뢰도를 평가하세요
4. 반드시 JSON 형식으로만 응답하세요`
          }
        ],
        temperature: 0.2,
        max_tokens: 4000,
        response_format: { type: "json_object" }
      })
    });

    if (!aiResponse.ok) {
      const error = await aiResponse.json();
      console.error('OpenAI API 에러:', error);
      throw new Error(error.error?.message || 'OpenAI API 오류');
    }

    const aiData = await aiResponse.json();
    console.log('분석 완료');
    
    res.status(200).json({
      content: [
        {
          type: "text",
          text: aiData.choices[0].message.content
        }
      ]
    });

  } catch (error) {
    console.error('팩트체크 오류:', error);
    res.status(500).json({ 
      error: error.message,
      details: error.toString()
    });
  }
}
