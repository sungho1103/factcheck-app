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

  const { claim, includeYouTube = false } = req.body;

  if (!claim) {
    return res.status(400).json({ error: 'Claim is required' });
  }

  try {
    console.log('팩트체크 시작:', claim);
    console.log('유튜브 검색 포함:', includeYouTube);
    
    if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
      throw new Error('네이버 API 키가 설정되지 않았습니다.');
    }
    
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API 키가 설정되지 않았습니다.');
    }

    if (!process.env.GEMINI_API_KEY) {
      throw new Error('Gemini API 키가 설정되지 않았습니다.');
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
    console.log('네이버 뉴스 검색 결과:', newsData.total, '건');
    
    // 네이버 백과사전 검색 추가
    console.log('네이버 백과사전 검색 시작...');
    const encycResponse = await fetch(
      `https://openapi.naver.com/v1/search/encyc.json?query=${encodeURIComponent(claim)}&display=10`,
      {
        headers: {
          'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
          'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET
        }
      }
    );

    let encycData = { items: [] };
    if (encycResponse.ok) {
      encycData = await encycResponse.json();
      console.log('네이버 백과사전 검색 결과:', encycData.total || 0, '건');
    } else {
      console.log('백과사전 검색 실패 (선택적 기능)');
    }
    
    // 유튜브 검색 (사용자가 체크박스 선택 시)
    let youtubeData = { items: [] };
    let youtubeUsed = false;
    
    if (includeYouTube && process.env.YOUTUBE_API_KEY) {
      console.log('유튜브 검색 시작...');
      
      try {
        // YouTube Data API v3 - 검색
        const youtubeResponse = await fetch(
          `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(claim)}&type=video,channel&maxResults=10&key=${process.env.YOUTUBE_API_KEY}`
        );
        
        if (youtubeResponse.ok) {
          youtubeData = await youtubeResponse.json();
          console.log('유튜브 검색 결과:', youtubeData.items?.length || 0, '건');
          youtubeUsed = true;
          
          // Upstash Redis 카운터 증가
          if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
            const today = new Date().toISOString().split('T')[0];
            const quotaKey = `youtube:quota:${today}`;
            
            try {
              console.log(`📊 Redis INCR 시도: ${quotaKey}`);
              
              const incrResponse = await fetch(
                `${process.env.UPSTASH_REDIS_REST_URL}/incr/${quotaKey}`,
                {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`
                  }
                }
              );
              
              const incrResult = await incrResponse.json();
              console.log(`✅ Redis INCR 성공! 현재 사용량:`, incrResult.result);
              
              // 24시간 후 만료 설정
              await fetch(
                `${process.env.UPSTASH_REDIS_REST_URL}/expire/${quotaKey}/86400`,
                {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`
                  }
                }
              );
              
              console.log('⏰ Redis EXPIRE 설정 완료 (24시간)');
            } catch (redisError) {
              console.error('❌ Redis 카운터 증가 실패:', redisError);
            }
          } else {
            console.log('⚠️ Redis 환경변수 미설정 - quota 카운팅 생략');
          }
        } else {
          console.error('유튜브 검색 실패:', youtubeResponse.status);
        }
      } catch (youtubeError) {
        console.error('유튜브 검색 오류:', youtubeError);
      }
    }
    
    if ((!newsData.items || newsData.items.length === 0) && (!encycData.items || encycData.items.length === 0) && (!youtubeData.items || youtubeData.items.length === 0)) {
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
              reasoning: "검색 결과 없음",
              crossVerification: {
                used: false,
                reason: "검색 결과 없음"
              }
            })
          }
        ]
      });
    }
    
    // 백과사전 검색 결과 정리
    let encycResults = '';
    if (encycData.items && encycData.items.length > 0) {
      encycResults = '\n\n========== 📚 네이버 백과사전 정보 (신뢰도 높음) ==========\n\n';
      encycResults += encycData.items.map((item, idx) => {
        const title = item.title.replace(/<[^>]*>/g, '');
        const description = item.description.replace(/<[^>]*>/g, '');
        
        return `[백과사전 ${idx + 1}]
제목: ${title}
설명: ${description}
URL: ${item.link}
---`;
      }).join('\n\n');
      encycResults += '\n\n⚠️ 백과사전 정보는 뉴스보다 신뢰도가 높습니다. 위치, 날짜, 기본 정보는 백과사전을 우선하세요.\n';
    }
    
    // 뉴스 검색 결과 정리
    let newsResults = '';
    if (newsData.items && newsData.items.length > 0) {
      newsResults = '\n\n========== 📰 네이버 뉴스 검색 결과 ==========\n\n';
      newsResults += newsData.items.map((item, idx) => {
        const title = item.title.replace(/<[^>]*>/g, '');
        const description = item.description.replace(/<[^>]*>/g, '');
        
        return `[뉴스 ${idx + 1}]
제목: ${title}
설명: ${description}
URL: ${item.originallink || item.link}
발행일: ${item.pubDate}
---`;
      }).join('\n\n');
    }
    
    // 유튜브 검색 결과 정리
    let youtubeResults = '';
    if (youtubeData.items && youtubeData.items.length > 0) {
      youtubeResults = '\n\n========== 📺 유튜브 검색 결과 (주의: 신뢰도 낮을 수 있음) ==========\n\n';
      youtubeResults += youtubeData.items.map((item, idx) => {
        const title = item.snippet?.title || '';
        const description = item.snippet?.description || '';
        const channelTitle = item.snippet?.channelTitle || '';
        const publishedAt = item.snippet?.publishedAt || '';
        const videoId = item.id?.videoId;
        const channelId = item.id?.channelId;
        const url = videoId 
          ? `https://www.youtube.com/watch?v=${videoId}`
          : channelId 
            ? `https://www.youtube.com/channel/${channelId}`
            : '';
        
        return `[유튜브 ${idx + 1}]
제목: ${title}
채널: ${channelTitle}
설명: ${description}
URL: ${url}
게시일: ${publishedAt}
---`;
      }).join('\n\n');
      youtubeResults += '\n\n⚠️ 유튜브 콘텐츠는 개인 의견이 많고 신뢰도가 낮을 수 있습니다. 백과사전과 뉴스를 우선하세요.\n';
    }
    
    // 전체 검색 결과 통합
    const searchResults = encycResults + newsResults + youtubeResults;

    console.log('OpenAI 분석 시작... (모델: gpt-4o-mini)');

    // OpenAI 분석
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
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

⚠️ 중요한 원칙:
1. 검색 결과에 명시적으로 나온 정보만 사용하세요
2. 이름이나 간접적 정보만으로 추론하지 마세요
3. 특히 위치, 날짜, 수치 등은 명확한 출처가 있어야 합니다
4. 확신이 없으면 "확인 불가"로 판정하세요
5. 절대 추측하거나 가정하지 마세요

예시: "서울신대"라는 이름에 "서울"이 있다고 해서 서울에 있다고 판단하지 마세요.
검색 결과에 명시적으로 "서울신대는 서울에 위치"라는 문장이 있어야만 사실로 판정하세요.

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
    ⚠️ 중요: sources 배열에는 반드시 검색 결과에서 실제로 참고한 뉴스/백과사전/유튜브의 제목과 URL을 포함하세요!
    각 source는 다음 정보를 포함해야 합니다:
    - title: 검색 결과의 실제 제목 (정확히 복사)
    - url: 검색 결과의 URL (절대 '#'이나 빈 값 금지, 실제 https://로 시작하는 URL만)
    - outlet: 언론사명 또는 채널명
    - date: 발행일
    - type: "주요언론", "백과사전", "유튜브" 등
    
    예시:
    {
      "title": "윤석열 대통령 탄핵안 가결",
      "url": "https://n.news.naver.com/article/001/0014567890",
      "date": "2024-10-10",
      "outlet": "연합뉴스",
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
    }
  ],
  "misinformationSources": [
    {
      "platform": "특정 플랫폼명",
      "description": "어떤 거짓정보가 퍼졌는지"
    }
  ],
  "youtubeAnalysis": {
    "totalChannels": 0,
    "mainstreamMedia": 0,
    "personalChannels": 0,
    "extremeChannels": 0,
    "dominantNarrative": "유튜브에서의 주요 논조",
    "warnings": ["경고사항 배열"]
  },
  "reasoning": "판단 근거"
}

⚠️ 중요: 유튜브 검색 결과가 있을 경우, youtubeAnalysis 필드를 반드시 포함하세요!
- totalChannels: 검색된 총 채널 수
- mainstreamMedia: 주요 언론 유튜브 채널 수
- personalChannels: 개인 채널 수
- extremeChannels: 극단적 성향 채널 수
- dominantNarrative: 유튜브에서 주로 다루는 내용/논조
- warnings: 유튜브 정보 관련 주의사항 배열`
          },
          {
            role: "user",
            content: `검증할 주장: ${claim}

검색 결과 (네이버 백과사전 ${encycData.items?.length || 0}건 + 뉴스 ${newsData.items?.length || 0}건${youtubeUsed ? ' + 유튜브 ' + (youtubeData.items?.length || 0) + '건' : ''}):
${searchResults}

${youtubeUsed ? '⚠️ 유튜브 검색 결과가 포함되어 있습니다. youtubeAnalysis 필드를 반드시 작성하세요!\n\n' : ''}📚 정보 우선순위:
1. 백과사전 정보 > 뉴스 정보
2. 위치, 설립일, 기본 정보는 백과사전이 가장 정확함
3. 백과사전에 명확한 정보가 있으면 그것을 기준으로 판정

위 검색 결과를 분석하여 JSON 형식으로 응답하세요.`
          }
        ],
        temperature: 0.5,  // 적절한 균형: 일관성과 유연성
        max_tokens: 4000,
        response_format: { type: "json_object" }
      })
    });

    if (!openaiResponse.ok) {
      const error = await openaiResponse.json();
      console.error('OpenAI API 에러:', error);
      throw new Error(error.error?.message || 'OpenAI API 오류');
    }

    const openaiData = await openaiResponse.json();
    const openaiResult = JSON.parse(openaiData.choices[0].message.content);
    
    console.log('OpenAI 분석 완료');
    
    // ✅ OpenAI가 sources에 URL을 포함시키지 않았을 경우 원본 검색 결과와 매칭
    if (openaiResult.sources && Array.isArray(openaiResult.sources)) {
      openaiResult.sources = openaiResult.sources.map(source => {
        // 이미 URL이 있으면 그대로 반환
        if (source.url && source.url !== '#' && source.url.startsWith('http')) {
          return source;
        }
        
        // URL이 없으면 제목으로 검색 결과에서 찾기
        const title = source.title || '';
        
        // 네이버 뉴스에서 찾기
        if (newsData.items && newsData.items.length > 0) {
          const matchedNews = newsData.items.find(item => {
            const itemTitle = item.title?.replace(/<[^>]*>/g, '') || '';
            return itemTitle.includes(title) || title.includes(itemTitle);
          });
          
          if (matchedNews) {
            return {
              ...source,
              url: matchedNews.originallink || matchedNews.link,
              outlet: source.outlet || matchedNews.outlet || '출처 미상'
            };
          }
        }
        
        // 백과사전에서 찾기
        if (encycData.items && encycData.items.length > 0) {
          const matchedencyc = encycData.items.find(item => {
            const itemTitle = item.title?.replace(/<[^>]*>/g, '') || '';
            return itemTitle.includes(title) || title.includes(itemTitle);
          });
          
          if (matchedencyc) {
            return {
              ...source,
              url: matchedencyc.link,
              outlet: source.outlet || '네이버 백과사전',
              type: '백과사전'
            };
          }
        }
        
        // 유튜브에서 찾기
        if (youtubeData.items && youtubeData.items.length > 0) {
          const matchedYT = youtubeData.items.find(item => {
            const itemTitle = item.snippet?.title || '';
            return itemTitle.includes(title) || title.includes(itemTitle);
          });
          
          if (matchedYT) {
            const videoId = matchedYT.id?.videoId;
            const channelId = matchedYT.id?.channelId;
            const url = videoId 
              ? `https://www.youtube.com/watch?v=${videoId}`
              : channelId 
                ? `https://www.youtube.com/channel/${channelId}`
                : '#';
            
            return {
              ...source,
              url: url,
              type: '유튜브',
              channelName: matchedYT.snippet?.channelTitle || source.outlet
            };
          }
        }
        
        // 매칭 실패 시 원본 그대로 반환
        return source;
      });
      
      console.log('✅ Sources URL 매칭 완료:', openaiResult.sources.length, '개');
    }

    // Gemini 분석 (교차검증)
    console.log('Gemini 교차검증 시작... (모델: gemini-2.5-flash-preview-05-20)');
    
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `당신은 한국 정치 뉴스 전문 팩트체커입니다.

검증할 주장: ${claim}

검색 결과 (네이버 백과사전 ${encycData.items?.length || 0}건 + 뉴스 ${newsData.items?.length || 0}건${youtubeUsed ? ' + 유튜브 ' + (youtubeData.items?.length || 0) + '건' : ''}):
${searchResults}

${youtubeUsed ? '⚠️ 유튜브 검색 결과가 포함되어 있습니다. youtubeAnalysis 필드를 반드시 작성하세요!\n\n' : ''}⚠️ 중요한 원칙:
1. 백과사전 정보 > 뉴스 정보 (위치, 설립일 등 기본 정보는 백과사전 우선)
2. 검색 결과에 명시적으로 나온 정보만 사용하세요
3. 이름이나 간접적 정보만으로 추론하지 마세요
4. 특히 위치, 날짜, 수치 등은 명확한 출처가 있어야 합니다
5. 확신이 없으면 "확인 불가"로 판정하세요
5. 절대 추측하거나 가정하지 마세요

예시: "서울신대"라는 이름에 "서울"이 있다고 해서 서울에 있다고 판단하지 마세요.
검색 결과에 명시적으로 위치가 언급되어야 합니다.

위 검색 결과를 분석하여 아래 JSON 형식으로만 응답하세요:

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
  "youtubeAnalysis": {
    "totalChannels": 0,
    "mainstreamMedia": 0,
    "personalChannels": 0,
    "extremeChannels": 0,
    "dominantNarrative": "유튜브에서의 주요 논조",
    "warnings": ["경고사항 배열"]
  },
  "reasoning": "판단 근거"
}

⚠️ 중요: 유튜브 검색 결과가 있을 경우, youtubeAnalysis 필드를 반드시 포함하세요!`
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.5,  // 적절한 균형: 일관성과 유연성
            maxOutputTokens: 8192  // Gemini 2.5의 thinking 기능 고려하여 대폭 증가
          }
        })
      }
    );

    if (!geminiResponse.ok) {
      console.error('Gemini API 에러:', await geminiResponse.text());
      // Gemini 실패 시 OpenAI 결과만 반환
      return res.status(200).json({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ...openaiResult,
              crossVerification: {
                used: false,
                reason: "Gemini API 호출 실패",
                openaiOnly: true
              }
            })
          }
        ]
      });
    }

    const geminiData = await geminiResponse.json();
    
    console.log('Gemini 원본 응답:', JSON.stringify(geminiData, null, 2));
    
    const geminiTextRaw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    
    console.log('Gemini 추출된 텍스트:', geminiTextRaw.substring(0, 500));
    
    // Gemini 응답에서 JSON 추출 (마크다운 코드 블록 제거)
    const geminiTextClean = geminiTextRaw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    
    let geminiResult;
    try {
      geminiResult = JSON.parse(geminiTextClean);
      console.log('Gemini JSON 파싱 성공');
    } catch (parseError) {
      console.error('Gemini JSON 파싱 실패:', parseError.message);
      console.error('파싱 시도한 텍스트:', geminiTextClean.substring(0, 500));
      
      // 파싱 실패 시 OpenAI 결과만 반환
      return res.status(200).json({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ...openaiResult,
              crossVerification: {
                used: false,
                reason: "Gemini 응답 파싱 실패",
                error: parseError.message,
                openaiOnly: true
              }
            })
          }
        ]
      });
    }
    
    console.log('Gemini 분석 완료');
    console.log('Gemini 파싱된 결과:', JSON.stringify(geminiResult, null, 2));

    // Gemini 결과 검증 및 기본값 설정
    const geminiVerdict = geminiResult.verdict || geminiResult.판정 || "확인 불가";
    const geminiConfidence = geminiResult.confidence || geminiResult.신뢰도 || 0;
    
    console.log('Gemini verdict:', geminiVerdict);
    console.log('Gemini confidence:', geminiConfidence);

    // 교차검증 결과 통합
    const crossVerificationResult = {
      ...openaiResult,
      crossVerification: {
        used: true,
        openai: {
          verdict: openaiResult.verdict,
          confidence: openaiResult.confidence
        },
        gemini: {
          verdict: geminiVerdict,
          confidence: geminiConfidence
        },
        agreement: openaiResult.verdict === geminiVerdict,
        finalVerdict: openaiResult.verdict === geminiVerdict 
          ? openaiResult.verdict 
          : "추가 검증 필요",
        finalConfidence: openaiResult.verdict === geminiVerdict
          ? Math.round((openaiResult.confidence + geminiConfidence) / 2)
          : Math.min(openaiResult.confidence, geminiConfidence) - 20,
        analysis: openaiResult.verdict === geminiVerdict
          ? "두 AI 모델이 일치하는 판정을 내렸습니다."
          : `OpenAI는 "${openaiResult.verdict}", Gemini는 "${geminiVerdict}"로 판정하여 불일치합니다. 추가 검증이 필요합니다.`
      }
    };

    // 불일치 시 최종 판정 업데이트
    if (!crossVerificationResult.crossVerification.agreement) {
      crossVerificationResult.verdict = "추가 검증 필요";
      crossVerificationResult.confidence = crossVerificationResult.crossVerification.finalConfidence;
      crossVerificationResult.summary = `[교차검증 불일치] ${openaiResult.summary}`;
      crossVerificationResult.details = `⚠️ AI 모델 간 판정 불일치\n\nOpenAI 판정: ${openaiResult.verdict} (신뢰도: ${openaiResult.confidence}%)\n${openaiResult.details}\n\n---\n\nGemini 판정: ${geminiVerdict} (신뢰도: ${geminiConfidence}%)\n${geminiResult.details || '상세 내용 없음'}`;
    }

    res.status(200).json({
      content: [
        {
          type: "text",
          text: JSON.stringify(crossVerificationResult)
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
