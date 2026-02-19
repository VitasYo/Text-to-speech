from http.server import BaseHTTPRequestHandler
import json
import asyncio
import base64
import sys
import os

# Добавляем путь к модулю edge_tts
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        # Обработка preflight запросов
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def do_POST(self):
        try:
            # Читаем данные запроса
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            text = data.get('text', '')
            voice = data.get('voice', 'ru-RU-SvetlanaNeural')
            rate = data.get('rate', '1')
            pitch = data.get('pitch', '1')
            
            # Ограничиваем длину текста
            if len(text) > 5000:
                text = text[:5000]
            
            # Преобразуем параметры
            rate_f = float(rate)
            rate_percent = f"+{int((rate_f - 1) * 100)}%" if rate_f >= 1 else f"{int((rate_f - 1) * 100)}%"
            
            pitch_f = float(pitch)
            pitch_hz = f"+{int((pitch_f - 1) * 10)}Hz" if pitch_f >= 1 else f"{int((pitch_f - 1) * 10)}Hz"
            
            # Генерируем аудио
            audio_data = asyncio.run(self.generate_audio(text, voice, rate_percent, pitch_hz))
            
            # Конвертируем в base64
            base64_audio = base64.b64encode(audio_data).decode('utf-8')
            
            # Отправляем ответ
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            response = {'audio': base64_audio}
            self.wfile.write(json.dumps(response).encode('utf-8'))
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            error_response = {'error': str(e)}
            self.wfile.write(json.dumps(error_response).encode('utf-8'))
    
    async def generate_audio(self, text, voice, rate, pitch):
        import edge_tts
        
        communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
        
        audio_data = b''
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data += chunk["data"]
        
        return audio_data


edge-tts==6.1.12
aiohttp==3.9.1
certifi==2023.11.17