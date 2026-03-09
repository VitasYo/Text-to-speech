import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, unlink, writeFile } from 'fs/promises';
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

  let tmpFile = null;

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
    tmpFile = join(tmpdir(), `tts_${Date.now()}.mp3`);

    // Сохраняем текст во временный файл (безопаснее чем передавать в команду)
    const textFile = join(tmpdir(), `text_${Date.now()}.txt`);
    await writeFile(textFile, textToSpeak, 'utf-8');

    try {
      // Проверяем наличие edge-tts
      let command;
      try {
        await execAsync('which edge-tts');
        // edge-tts установлен как команда
        command = `edge-tts --file "${textFile}" --voice "${voice}" --rate "${rateStr}" --pitch "${pitchStr}" --write-media "${tmpFile}"`;
      } catch {
        // Используем python -m edge_tts
        command = `python3 -m edge_tts --file "${textFile}" --voice "${voice}" --rate "${rateStr}" --pitch "${pitchStr}" --write-media "${tmpFile}"`;
      }

      const { stdout, stderr } = await execAsync(command, { 
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024
      });

      // Удаляем текстовый файл
      await unlink(textFile);

      // Читаем аудио
      const audioBuffer = await readFile(tmpFile);
      
      if (audioBuffer.length === 0) {
        throw new Error('Generated audio file is empty');
      }

      const base64Audio = audioBuffer.toString('base64');

      // Удаляем временный файл
      await unlink(tmpFile);

      return res.status(200).json({ audio: base64Audio });

    } catch (cmdError) {
      // Удаляем временные файлы при ошибке
      try { await unlink(textFile); } catch {}
      try { await unlink(tmpFile); } catch {}
      
      throw new Error(`edge-tts execution failed: ${cmdError.message}\nStderr: ${cmdError.stderr}\nStdout: ${cmdError.stdout}`);
    }

  } catch (error) {
    console.error('TTS Error:', error);
    
    // Очищаем временные файлы
    if (tmpFile) {
      try { await unlink(tmpFile); } catch {}
    }

    return res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}