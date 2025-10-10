export default async function handler(req, res) {
  try {
    const hasKey = !!process.env.OPENAI_API_KEY;
    const keyLength = process.env.OPENAI_API_KEY?.length || 0;
    const keyPreview = process.env.OPENAI_API_KEY ? 
      `${process.env.OPENAI_API_KEY.substring(0, 7)}...` : 'undefined';

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ 
        error: 'OpenAI API 키가 설정되지 않았습니다.',
        hasKey: false,
        keyLength: 0,
        keyPreview: 'undefined'
      });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4-turbo-preview",
        messages: [
          { role: "user", content: "Say 'API works!'" }
        ],
        max_tokens: 10
      })
    });

    if (!response.ok) {
      const error = await response.json();
      return res.status(response.status).json({ 
        success: false,
        error: error.error?.message || 'OpenAI API 오류',
        hasKey,
        keyLength,
        keyPreview,
        statusCode: response.status
      });
    }

    const data = await response.json();
    
    res.status(200).json({
      success: true,
      message: '✅ OpenAI API 정상 작동!',
      response: data.choices[0].message.content,
      hasKey,
      keyLength,
      keyPreview
    });

  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message
    });
  }
}
