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
        
        // Quota 차감 (Redis)
        if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
          const today = new Date().toISOString().split('T')[0];
          const quotaKey = `youtube:quota:${today}`;
          
          // 현재 사용량 확인
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
          
          if (usedCount >= 99) {
            console.log('YouTube quota 초과');
            throw new Error('YouTube API quota 초과');
          }
          
          // Quota 증가
          await fetch(
            `${process.env.UPSTASH_REDIS_REST_URL}/incr/${quotaKey}`,
            {
              headers: {
                Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`
              }
            }
          );
          
          // 만료 시간 설정 (24시간)
          await fetch(
            `${process.env.UPSTASH_REDIS_REST_URL}/expire/${quotaKey}/86400`,
            {
              headers: {
                Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`
              }
            }
          );
        }

        // YouTube 영상 검색
        const youtubeResponse = await fetch(
          `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(claim)}&type=video&maxResults=20&order=relevance&key=${process.env.YOUTUBE_API_KEY}`
        );

        if (youtubeResponse.ok) {
          const youtubeData = await youtubeResponse.json();
          console.log('YouTube 검색 결과:', youtubeData.items?.length || 0, '건');
          
          if (youtubeData.items && youtubeData.items.length > 0) {
            // 채널 ID 수집
            const channelIds = [...new Set(youtubeData.items.map(item => item.snippet.channelId))];
            
            // 채널 상세 정보 조회 (구독자 수 포함)
            const channelResponse = await fetch(
              `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${channelIds.join(',')}&key=${process.env.YOUTUBE_API_KEY}`
            );
            
            const channelData = await channelResponse.json();
            const channelMap = {};
            
            if (channelData.items) {
              channelData.items.forEach(channel => {
                channelMap[channel.id] = {
                  subscriberCount: parseInt(channel.statistics.subscriberCount || 0),
                  title: channel.snippet.title,
                  description: channel.snippet.description
                };
              });
            }
            
            // 구독자 10k+ 필터링
            const filteredVideos = youtubeData.items.filter(item => {
              const channelInfo = channelMap[item.snippet.channelId];
              return channelInfo && channelInfo.subscriberCount >= 10000;
            });
            
            console.log('구독자 10k+ 필터링 후:', filteredVideos.length, '건');
            
            if (filteredVideos.length > 0) {
              youtubeResults = filteredVideos.slice(0, 10).map((item, idx) => {
                const snippet = item.snippet;
                const channelInfo = channelMap[item.snippet.channelId];
                const subscribers = channelInfo.subscriberCount;
                const subscribersFormatted = subscribers >= 1000000 
                  ? `${(subscribers / 1000000).toFixed(1)}M`
                  : `${(subscribers / 1000).toFixed(0)}K`;
                
                return `[유튜브 ${idx + 1}]
채널: ${snippet.channelTitle} (구독자 ${subscribersFormatted})
채널 설명: ${channelInfo.description.substring(0, 200)}
영상 제목: ${snippet.title}
영상 설명: ${snippet.description}
업로드: ${snippet.publishedAt}
URL: https://www.youtube.com/watch?v=${item.id.videoId}
---`;
              }).join('\n\n');
            }
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
      youtubeResults ? `\n\n=== YouTube 검색 결과 (구독자 10k 이상) ===\n\n${youtubeResults}` : ''
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
      "title": "실제 기사/영상 제목",
      "url": "https://실제URL",
      "date": "2024-10-10",
      "outlet": "조선일보",
      "credibility": "높음",
      "type": "주요언론",
      "reliability": 85,
      "bias": "보수",
      "channelName": "채널명 (유튜브인 경우)",
      "channelBias": "극진보|진보|중도진보|중립|중도보수|보수|극보수",
      "channelType": "뉴스채널|정치평론|개인방송|시사토크",
      "channelCharacteristics": "채널의 특성 한 문장 설명",
      "isRisky": true 또는 false,
      "riskReason": "위험한 경우 그 이유"
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
      "platform": "실제 채널명 또는 플랫폼명",
      "description": "어떤 거짓정보가 퍼졌는지",
      "bias": "극우" 또는 "극좌" 또는 "중립"
    }
  ],
  "reasoning": "판단 근거",
  "recommendations": "추가 확인 필요사항"
}

필수 규칙:

1. outlet은 검색 결과에서 실제 언론사/채널 이름 정확히 추출

2. type은 반드시 다음 중 하나:
   - "주요언론": KBS, MBC, SBS, 연합뉴스, 조선일보, 중앙일보, 동아일보, 한겨레, 경향신문
   - "온라인매체": 오마이뉴스, 프레시안, 미디어오늘
   - "정부기관": 청와대, 국회, 법무부 등 공식 발표
   - "연구소": 한국정치학회, 여론조사기관
   - "유튜브": YouTube 채널
   - "SNS": 트위터, 페이스북, 커뮤니티

3. bias (정치적 성향) - 7단계 세분화:
   - "극진보" / "진보" / "중도진보" / "중립" / "중도보수" / "보수" / "극보수"

4. 유튜브 채널 상세 분석 (매우 중요!):
   
   a) channelBias (7단계 정치 성향):
      - 극진보: 민중의소리TV, 참세상TV 등
      - 진보: 오마이TV, 프레시안TV 등
      - 중도진보: 한겨레TV, 경향신문TV 등
      - 중립: KBS 뉴스, 연합뉴스TV 등
      - 중도보수: JTBC 뉴스, 중앙일보TV 등
      - 보수: 조선일보, 동아일보TV 등
      - 극보수: 특정 개인 정치 유튜버, 극단적 보수 채널
   
   b) channelType (채널 유형):
      - "뉴스채널": 언론사 공식 채널
      - "정치평론": 전문 정치 평론가
      - "개인방송": 개인이 운영하는 정치 채널
      - "시사토크": 토크쇼 형식
   
   c) channelCharacteristics (채널 특성 한 문장):
      예: "정부 정책 비판 중심의 진보 성향 시사 채널"
      예: "야당 중심 논조의 정치 평론 채널"
      예: "여당 옹호 경향의 보수 시사 방송"
   
   d) isRisky (위험 채널 판단):
      다음 경우 true:
      - 극진보 또는 극보수 성향 (양극단)
      - 근거 없는 의혹 제기가 주된 콘텐츠
      - 선동적이고 감정적인 논조 중심
      - 팩트 없이 주장만 반복
      - 특정 정치인/정당에 대한 맹목적 지지/비난
   
   e) riskReason (위험 이유):
      isRisky가 true일 경우 구체적 이유 명시
      예: "근거 없는 의혹 제기 중심, 극단적 보수 성향"
      예: "선동적 논조, 팩트 체크 없는 주장 반복"

5. timeline은 최소 2개 이상의 이벤트 포함
6. date는 YYYY-MM-DD 형식
7. misinformationSources의 platform에는 실제 채널명 사용

YouTube 채널 분석 예시:
{
  "channelName": "가로세로연구소",
  "channelBias": "진보",
  "channelType": "시사토크",
  "channelCharacteristics": "야당 중심 논조의 정치 토크쇼, 정부 비판적 시각",
  "isRisky": false,
  "riskReason": ""
}

{
  "channelName": "신의한수",
  "channelBias": "보수",
  "channelType": "정치평론",
  "channelCharacteristics": "여당 옹호 경향의 보수 정치 평론",
  "isRisky": false,
  "riskReason": ""
}

{
  "channelName": "정치한스푼",
  "channelBias": "극보수",
  "channelType": "개인방송",
  "channelCharacteristics": "극단적 보수 성향, 야당 비판 중심 개인 방송",
  "isRisky": true,
  "riskReason": "근거 없는 의혹 제기 중심, 선동적 논조"
}`
          },
          {
            role: "user",
            content: `검증할 주장: ${claim}

${includeYouTube ? '네이버 뉴스 + YouTube 통합 검색 결과 (구독자 10k 이상):' : '네이버 뉴스 검색 결과:'}
${combinedResults}

위 검색 결과를 분석하여:

1. 각 기사/영상의 언론사/채널 이름을 정확히 추출

2. 유튜브 채널의 경우 반드시 다음을 모두 분석:
   - channelName: 실제 채널명
   - channelBias: 7단계 정치 성향 (극진보~극보수)
   - channelType: 채널 유형 (뉴스채널/정치평론/개인방송/시사토크)
   - channelCharacteristics: 채널 특성 한 문장 설명
   - isRisky: 위험 채널 여부 판단 (극단 성향, 의혹 제기 중심 등)
   - riskReason: 위험한 경우 구체적 이유

3. 각 출처의 정치적 성향(bias) 7단계로 정확히 평가

4. 시간순으로 사건을 정리 (최소 2개)

5. 각 출처의 신뢰도 평가

6. misinformationSources에 실제 채널명 표시

7. 반드시 JSON 형식으로만 응답`
          }
        ],
        temperature: 0.2,
        max_tokens: 5000,
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
