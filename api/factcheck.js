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

  const { claim, includeYouTube } = req.body;

  if (!claim) {
    return res.status(400).json({ error: 'Claim is required' });
  }

  try {
    console.log('팩트체크 시작:', claim);
    console.log('YouTube 검색:', includeYouTube ? '포함' : '미포함');
    
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
    
    let searchResults = '';
    let youtubeResults = '';
    
    // 네이버 뉴스 결과 포맷팅
    if (newsData.items && newsData.items.length > 0) {
      searchResults = newsData.items.map((item, idx) => {
        const title = item.title.replace(/<[^>]*>/g, '');
        const description = item.description.replace(/<[^>]*>/g, '');
        
        return `[뉴스 출처 ${idx + 1}]
제목: ${title}
설명: ${description}
URL: ${item.originallink || item.link}
발행일: ${item.pubDate}
---`;
      }).join('\n\n');
    }

    // YouTube 검색 (옵션)
    if (includeYouTube && process.env.YOUTUBE_API_KEY) {
      try {
        console.log('YouTube 검색 시작...');
        const youtubeResponse = await fetch(
          `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(claim)}&type=video&maxResults=10&order=relevance&key=${process.env.YOUTUBE_API_KEY}`
        );

        if (youtubeResponse.ok) {
          const youtubeData = await youtubeResponse.json();
          console.log('YouTube 검색 결과:', youtubeData.items?.length || 0, '건');
          
          if (youtubeData.items && youtubeData.items.length > 0) {
            youtubeResults = youtubeData.items.map((item, idx) => {
              const snippet = item.snippet;
              return `[유튜브 ${idx + 1}]
채널: ${snippet.channelTitle}
제목: ${snippet.title}
설명: ${snippet.description}
업로드: ${snippet.publishedAt}
URL: https://www.youtube.com/watch?v=${item.id.videoId}
---`;
            }).join('\n\n');
          }
        } else {
          console.error('YouTube API 오류:', youtubeResponse.status);
        }
      } catch (ytError) {
        console.error('YouTube 검색 오류:', ytError);
        // YouTube 오류는 무시하고 계속 진행
      }
    }

    // 검색 결과 통합
    const combinedResults = [
      searchResults,
      youtubeResults ? `\n\n=== YouTube 검색 결과 ===\n\n${youtubeResults}` : ''
    ].filter(Boolean).join('');

    if (!combinedResults) {
      return res.status(200).json({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              verdict: "확인 불가",
              confidence: 0,
              summary: "관련 정보를 찾을 수 없습니다.",
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

    console.log('OpenAI 분석 시작... (모델: gpt-4o-mini)');

    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
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
      "reliability": 85,
      "bias": "보수",
      "channelName": "채널명"
    }
  ],
  "timeline": [
    {
      "date": "2024-10-01",
      "event": "구체적인 사건 내용",
      "source": "출처명"
    }
  ],
  "misinformationSources": [
    {
      "platform": "특정 플랫폼명 또는 채널명",
      "description": "어떤 거짓정보가 퍼졌는지",
      "bias": "극우" 또는 "극좌" 또는 "중립"
    }
  ],
  "reasoning": "판단 근거",
  "recommendations": "추가 확인 필요사항"
}

필수 규칙:
1. outlet은 검색 결과에서 실제 언론사/채널 이름 추출
2. type은 반드시: "주요언론", "온라인매체", "정부기관", "연구소", "유튜브", "SNS" 중 하나
3. bias (정치적 성향): "극진보", "진보", "중도진보", "중립", "중도보수", "보수", "극보수"
4. 유튜브의 경우 channelName 필수 포함
5. timeline은 최소 2개 이상의 이벤트 포함
6. date는 YYYY-MM-DD 형식`
          },
          {
            role: "user",
            content: `검증할 주장: ${claim}

${includeYouTube ? '네이버 뉴스 + YouTube 통합 검색 결과:' : '네이버 뉴스 검색 결과:'}
${combinedResults}

위 검색 결과를 분석하여:
1. 각 기사/영상의 언론사/채널 이름을 정확히 추출
2. 각 출처의 정치적 성향(bias) 평가
3. 유튜브는 채널명(channelName) 반드시 포함
4. 시간순으로 사건을 정리 (최소 2개)
5. 각 출처의 신뢰도 평가
6. 반드시 JSON 형식으로만 응답`
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
