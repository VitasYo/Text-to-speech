from edge_tts import Communicate
import base64
import asyncio

async def handler(request):
    if request.method != 'POST':
        return {'statusCode': 405, 'body': 'Method not allowed'}
    
    data = request.get_json()
    text = data.get('text', '')
    voice = data.get('voice', 'ru-RU-SvetlanaNeural')
    rate = data.get('rate', '1')
    pitch = data.get('pitch', '1')
    
    # Преобразуем параметры
    rate_f = float(rate)
    rate_percent = f"+{int((rate_f - 1) * 100)}%" if rate_f >= 1 else f"{int((rate_f - 1) * 100)}%"
    
    pitch_f = float(pitch)
    pitch_hz = f"+{int((pitch_f - 1) * 10)}Hz" if pitch_f >= 1 else f"{int((pitch_f - 1) * 10)}Hz"
    
    # Генерируем аудио
    communicate = Communicate(text, voice, rate=rate_percent, pitch=pitch_hz)
    audio_data = b''
    
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data += chunk["data"]
    
    # Конвертируем в base64
    base64_audio = base64.b64encode(audio_data).decode('utf-8')
    
    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json'},
        'body': {'audio': base64_audio}
    }