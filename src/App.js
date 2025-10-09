import React, { useState } from 'react';
import { Search, AlertTriangle, CheckCircle, XCircle, TrendingUp, Globe, Calendar, Youtube, Newspaper } from 'lucide-react';

export default function FactCheckApp() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const analyzeContent = async () => {
    if (!input.trim()) {
      alert('분석할 내용을 입력해주세요.');
      return;
    }

    setLoading(true);
    
    try {
      const prompt = \`당신은 팩트체크 전문가입니다. 다음 주장을 분석하고 JSON 형식으로 응답하세요.

주장: "\${input}"

분석 기준:
- 신뢰할 수 있는 언론사, 유튜브 채널, SNS 계정 확인
- 정보의 확산 경로 추적
- 정치적 편향성 분석 (1-10 척도)

다음 JSON 형식으로만 응답하세요:

{
  "infoType": "misinformation" 또는 "disinformation" 또는 "malinformation" 또는 "verified",
  "infoTypeKorean": "오정보" 또는 "허위정보" 또는 "악의정보" 또는 "검증된 정보",
  "veracity": 0-100 사이의 숫자,
  "summary": "3줄 이내 핵심 요약",
  "analysis": "상세 분석 (5-10줄)",
  "sources": [
    {
      "name": "출처명",
      "type": "news" 또는 "youtube" 또는 "sns" 또는 "government",
      "url": "실제 URL",
      "reliability": 0-100
    }
  ],
  "primaryMedia": {
    "mainSource": "이 정보가 주로 나타나는 매체",
    "examples": ["매체1", "매체2", "매체3"],
    "distribution": {
      "mainstream": 30,
      "youtube": 50,
      "sns": 20
    }
  },
  "mediaAnalysis": {
    "type": "매체 유형",
    "biasScore": 1-10 사이 숫자,
    "biasLabel": "극좌" 또는 "좌파" 또는 "중도좌파" 또는 "중립" 또는 "중도우파" 또는 "우파" 또는 "극우",
    "reliability": 0-100
  },
  "timeline": {
    "firstAppearance": "최초 출현 시기",
    "spreadPattern": "확산 패턴 설명",
    "peakPeriod": "가장 많이 퍼진 시기",
    "keyEvents": ["주요 확산 계기1", "계기2"]
  },
  "warnings": ["주의사항1", "주의사항2"],
  "recommendations": "독자를 위한 권고사항"
}\`;

      const response = await fetch("/api/factcheck", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt })
      });

      if (!response.ok) {
        throw new Error('API 요청 실패');
      }

      const data = await response.json();
      const responseText = data.content[0].text;
      
      const analysisResult = JSON.parse(responseText);
      setResult(analysisResult);
    } catch (error) {
      console.error('분석 오류:', error);
      alert('분석 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  const getInfoTypeColor = (type) => {
    switch(type) {
      case 'verified': return 'bg-green-100 text-green-800 border-green-300';
      case 'misinformation': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'disinformation': return 'bg-red-100 text-red-800 border-red-300';
      case 'malinformation': return 'bg-orange-100 text-orange-800 border-orange-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getInfoTypeIcon = (type) => {
    switch(type) {
      case 'verified': return <CheckCircle className="w-6 h-6" />;
      case 'misinformation': return <AlertTriangle className="w-6 h-6" />;
      case 'disinformation': return <XCircle className="w-6 h-6" />;
      case 'malinformation': return <AlertTriangle className="w-6 h-6" />;
      default: return <AlertTriangle className="w-6 h-6" />;
    }
  };

  const getVeracityColor = (score) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getSourceIcon = (type) => {
    switch(type) {
      case 'news': return <Newspaper className="w-4 h-4" />;
      case 'youtube': return <Youtube className="w-4 h-4" />;
      case 'sns': return '📱';
      case 'government': return '🏛️';
      default: return <Globe className="w-4 h-4" />;
    }
  };

  const getSourceTypeLabel = (type) => {
    switch(type) {
      case 'news': return '언론';
      case 'youtube': return '유튜브';
      case 'sns': return 'SNS';
      case 'government': return '정부';
      default: return '기타';
    }
  };

  const getBiasColor = (score) => {
    if (score <= 2) return 'bg-blue-600';
    if (score <= 4) return 'bg-blue-400';
    if (score <= 6) return 'bg-gray-400';
    if (score <= 8) return 'bg-red-400';
    return 'bg-red-600';
  };

  const getBiasPosition = (score) => {
    return ((score - 1) / 9) * 100;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Search className="w-8 h-8 text-indigo-600" />
            <h1 className="text-3xl font-bold text-gray-800">AI 팩트체크</h1>
          </div>
          <p className="text-gray-600">뉴스와 주장의 진실을 다각도로 분석합니다</p>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <label className="block text-gray-700 font-semibold mb-2">
            검증할 내용을 입력하세요
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="뉴스 기사, 주장, SNS 게시물, 유튜브 내용 등을 붙여넣으세요..."
            className="w-full h-32 p-4 border-2 border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none resize-none"
          />
          <button
            onClick={analyzeContent}
            disabled={loading}
            className={\`mt-4 w-full py-3 rounded-lg font-semibold text-white transition-colors \${
              loading 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-indigo-600 hover:bg-indigo-700'
            }\`}
          >
            {loading ? '분석 중...' : '팩트체크 시작'}
          </button>
        </div>

        {result && (
          <div className="space-y-6">
            <div className={\`rounded-lg shadow-lg p-6 border-2 \${getInfoTypeColor(result.infoType)}\`}>
              <div className="flex items-center gap-3 mb-4">
                {getInfoTypeIcon(result.infoType)}
                <h2 className="text-2xl font-bold">{result.infoTypeKorean}</h2>
              </div>
              <p className="text-lg">{result.summary}</p>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                사실성 점수
              </h3>
              <div className="flex items-center gap-4">
                <div className="flex-1 bg-gray-200 rounded-full h-8">
                  <div 
                    className={\`h-8 rounded-full flex items-center justify-center text-white font-bold \${
                      result.veracity >= 80 ? 'bg-green-500' :
                      result.veracity >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                    }\`}
                    style={{ width: \`\${result.veracity}%\` }}
                  >
                    {result.veracity}%
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-xl font-bold text-gray-800 mb-4">상세 분석</h3>
              <p className="text-gray-700 leading-relaxed whitespace-pre-line">{result.analysis}</p>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Globe className="w-5 h-5" />
                주요 출처 매체 분석
              </h3>
              
              <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-2">이 정보가 주로 나타나는 곳</p>
                <p className="font-bold text-lg text-gray-800 mb-3">{result.primaryMedia.mainSource}</p>
                <div className="flex flex-wrap gap-2">
                  {result.primaryMedia.examples.map((media, index) => (
                    <span key={index} className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-semibold">
                      {media}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">매체별 분포도</p>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-semibold">주류 언론</span>
                      <span className="text-sm font-bold text-indigo-600">{result.primaryMedia.distribution.mainstream}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div className="bg-indigo-600 h-3 rounded-full" style={{ width: \`\${result.primaryMedia.distribution.mainstream}%\` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-semibold">유튜브</span>
                      <span className="text-sm font-bold text-red-600">{result.primaryMedia.distribution.youtube}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div className="bg-red-600 h-3 rounded-full" style={{ width: \`\${result.primaryMedia.distribution.youtube}%\` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-semibold">SNS</span>
                      <span className="text-sm font-bold text-purple-600">{result.primaryMedia.distribution.sns}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div className="bg-purple-600 h-3 rounded-full" style={{ width: \`\${result.primaryMedia.distribution.sns}%\` }}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-xl font-bold text-gray-800 mb-4">검증 출처</h3>
              <div className="space-y-3">
                {result.sources.map((source, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2 min-w-[80px]">
                      {getSourceIcon(source.type)}
                      <span className="text-xs font-semibold text-gray-600">{getSourceTypeLabel(source.type)}</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-800">{source.name}</p>
                      <p className="text-sm text-gray-600 break-all">{source.url}</p>
                    </div>
                    <div className="text-right min-w-[60px]">
                      <p className="text-xs text-gray-500">신뢰도</p>
                      <p className={\`font-bold \${getVeracityColor(source.reliability)}\`}>
                        {source.reliability}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-xl font-bold text-gray-800 mb-4">매체 성향 분석</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">매체 유형</p>
                  <p className="font-bold text-gray-800">{result.mediaAnalysis.type}</p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">신뢰도</p>
                  <p className={\`font-bold text-xl \${getVeracityColor(result.mediaAnalysis.reliability)}\`}>
                    {result.mediaAnalysis.reliability}%
                  </p>
                </div>
              </div>

              <div className="p-4 bg-gradient-to-r from-blue-50 via-gray-50 to-red-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-2">정치적 편향성</p>
                <div className="relative h-12 mb-2">
                  <div className="absolute w-full h-3 bg-gradient-to-r from-blue-600 via-gray-400 to-red-600 rounded-full top-5"></div>
                  
                  <div className="absolute w-full flex justify-between top-0 px-1">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                      <div key={num} className="flex flex-col items-center">
                        <div className="w-0.5 h-2 bg-gray-400"></div>
                        <span className="text-xs text-gray-500 mt-6">{num}</span>
                      </div>
                    ))}
                  </div>
                  
                  <div 
                    className="absolute top-3 transform -translate-x-1/2 transition-all duration-300"
                    style={{ left: \`\${getBiasPosition(result.mediaAnalysis.biasScore)}%\` }}
                  >
                    <div className={\`w-6 h-6 rounded-full \${getBiasColor(result.mediaAnalysis.biasScore)} border-4 border-white shadow-lg\`}></div>
                    <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
                      <div className="bg-gray-800 text-white px-3 py-1 rounded-lg text-sm font-bold">
                        {result.mediaAnalysis.biasLabel}
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-between mt-8 text-sm font-semibold">
                  <span className="text-blue-700">← 극좌</span>
                  <span className="text-gray-600">중립</span>
                  <span className="text-red-700">극우 →</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                확산 타임라인
              </h3>
              <div className="space-y-4">
                <div className="border-l-4 border-indigo-500 pl-4">
                  <p className="text-sm text-gray-600">최초 출현</p>
                  <p className="font-semibold text-gray-800">{result.timeline.firstAppearance}</p>
                </div>
                <div className="border-l-4 border-purple-500 pl-4">
                  <p className="text-sm text-gray-600">확산 패턴</p>
                  <p className="font-semibold text-gray-800">{result.timeline.spreadPattern}</p>
                </div>
                <div className="border-l-4 border-pink-500 pl-4">
                  <p className="text-sm text-gray-600">정점 시기</p>
                  <p className="font-semibold text-gray-800">{result.timeline.peakPeriod}</p>
                </div>
                {result.timeline.keyEvents && result.timeline.keyEvents.length > 0 && (
                  <div className="border-l-4 border-orange-500 pl-4">
                    <p className="text-sm text-gray-600 mb-2">주요 확산 계기</p>
                    <ul className="space-y-1">
                      {result.timeline.keyEvents.map((event, index) => (
                        <li key={index} className="text-sm text-gray-700">• {event}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {result.warnings && result.warnings.length > 0 && (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-lg shadow-lg p-6">
                <h3 className="text-xl font-bold text-amber-800 mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  주의사항
                </h3>
                <ul className="space-y-2">
                  {result.warnings.map((warning, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="text-amber-600">⚠️</span>
                      <span className="text-amber-900">{warning}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="bg-green-50 border-2 border-green-300 rounded-lg shadow-lg p-6">
              <h3 className="text-xl font-bold text-green-800 mb-4">권고사항</h3>
              <p className="text-green-900 leading-relaxed">{result.recommendations}</p>
            </div>
          </div>
        )}

        {!result && !loading && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">이렇게 사용하세요</h3>
            <ul className="space-y-3 text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-indigo-600 font-bold">1.</span>
                <span>검증하고 싶은 뉴스, 유튜브 내용, SNS 게시물을 붙여넣으세요</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-600 font-bold">2.</span>
                <span>AI가 신뢰할 수 있는 언론사, 유튜브 채널, SNS 계정을 분석합니다</span>
              </li>
              <li className="flex items-start gap-2">
                <span class Name="text-indigo-600 font-bold">3.</span>
                <span>정보가 주로 어느 매체에서 나타나는지 확인하세요</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-600 font-bold">4.</span>
                <span>편향성을 10단계 슬라이더로 시각화하여 보여드립니다</span>
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
