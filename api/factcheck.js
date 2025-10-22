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
    }
  ],
  "misinformationSources": [
    {
      "platform": "특정 플랫폼명",
      "description": "어떤 거짓정보가 퍼졌는지"
    }
  ],
  "reasoning": "판단 근거"
}`
          },
          {
            role: "user",
            content: `검증할 주장: ${claim}

네이버 뉴스 검색 결과 (${newsData.items.length}건):
${searchResults}

위 검색 결과를 분석하여 JSON 형식으로 응답하세요.`
          }
        ],
        temperature: 0.2,
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

네이버 뉴스 검색 결과 (${newsData.items.length}건):
${searchResults}

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
  "reasoning": "판단 근거"
}`
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4000
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
          verdict: geminiResult.verdict,
          confidence: geminiResult.confidence
        },
        agreement: openaiResult.verdict === geminiResult.verdict,
        finalVerdict: openaiResult.verdict === geminiResult.verdict 
          ? openaiResult.verdict 
          : "추가 검증 필요",
        finalConfidence: openaiResult.verdict === geminiResult.verdict
          ? Math.round((openaiResult.confidence + geminiResult.confidence) / 2)
          : Math.min(openaiResult.confidence, geminiResult.confidence) - 20,
        analysis: openaiResult.verdict === geminiResult.verdict
          ? "두 AI 모델이 일치하는 판정을 내렸습니다."
          : `OpenAI는 "${openaiResult.verdict}", Gemini는 "${geminiResult.verdict}"로 판정하여 불일치합니다. 추가 검증이 필요합니다.`
      }
    };

    // 불일치 시 최종 판정 업데이트
    if (!crossVerificationResult.crossVerification.agreement) {
      crossVerificationResult.verdict = "추가 검증 필요";
      crossVerificationResult.confidence = crossVerificationResult.crossVerification.finalConfidence;
      crossVerificationResult.summary = `[교차검증 불일치] ${openaiResult.summary}`;
      crossVerificationResult.details = `⚠️ AI 모델 간 판정 불일치\n\nOpenAI 판정: ${openaiResult.verdict} (신뢰도: ${openaiResult.confidence}%)\n${openaiResult.details}\n\n---\n\nGemini 판정: ${geminiResult.verdict} (신뢰도: ${geminiResult.confidence}%)\n${geminiResult.details}`;
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
