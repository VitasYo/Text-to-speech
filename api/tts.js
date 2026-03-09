export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, voice = 'ru-RU-SvetlanaNeural', rate = '1', pitch = '1' } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Используем динамический импорт для edge-tts
    const edgeTTS = await import('edge-tts');
    
    // Ограничиваем длину
    const textToSpeak = text.substring(0, 5000);

    // Преобразуем параметры
    const rateF = parseFloat(rate);
    const rateStr = rateF >= 1 
      ? `+${Math.round((rateF - 1) * 100)}%` 
      : `${Math.round((rateF - 1) * 100)}%`;

    const pitchF = parseFloat(pitch);
    const pitchStr = pitchF >= 1 
      ? `+${Math.round((pitchF - 1) * 10)}Hz` 
      : `${Math.round((pitchF - 1) * 10)}Hz`;

    // Генерируем аудио
    const communicate = new edgeTTS.default.Communicate(textToSpeak, voice, {
      rate: rateStr,
      pitch: pitchStr
    });

    const chunks = [];
    
    for await (const chunk of communicate.stream()) {
      if (chunk.type === 'audio') {
        chunks.push(chunk.data);
      }
    }

    // Объединяем все чанки
    const audioBuffer = Buffer.concat(chunks);
    const base64Audio = audioBuffer.toString('base64');

    return res.status(200).json({ audio: base64Audio });

  } catch (error) {
    console.error('TTS Error:', error);
    return res.status(500).json({ 
      error: error.message,
      details: error.stack 
    });
  }
}