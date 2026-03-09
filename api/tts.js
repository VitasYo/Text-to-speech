import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const execAsync = promisify(exec);

export default async function handler(req, res) {
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

    // Временный файл
    const tmpFile = join(tmpdir(), `tts_${Date.now()}.mp3`);

    try {
      // Экранируем текст для команды
      const escapedText = textToSpeak.replace(/"/g, '\\"').replace(/`/g, '\\`');
      
      // Вызываем edge-tts через Python
      const command = `python3 -m edge_tts --text "${escapedText}" --voice "${voice}" --rate "${rateStr}" --pitch "${pitchStr}" --write-media "${tmpFile}"`;
      
      await execAsync(command, { 
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024 // 10MB
      });

      // Читаем файл
      const audioBuffer = await readFile(tmpFile);
      const base64Audio = audioBuffer.toString('base64');

      // Удаляем временный файл
      await unlink(tmpFile);

      return res.status(200).json({ audio: base64Audio });

    } catch (error) {
      // Очищаем временный файл при ошибке
      try {
        await unlink(tmpFile);
      } catch {}
      
      throw error;
    }

  } catch (error) {
    console.error('TTS Error:', error);
    return res.status(500).json({ 
      error: error.message,
      details: error.stderr || error.stdout
    });
  }
}