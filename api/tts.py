from http.server import BaseHTTPRequestHandler
import json
import subprocess
import base64
import tempfile
import os
import sys

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            text = data.get('text', '')[:5000]
            voice = data.get('voice', 'ru-RU-SvetlanaNeural')
            rate = data.get('rate', '1')
            pitch = data.get('pitch', '1')
            
            # Преобразуем параметры
            rate_f = float(rate)
            rate_str = f"+{int((rate_f - 1) * 100)}%" if rate_f >= 1 else f"{int((rate_f - 1) * 100)}%"
            
            pitch_f = float(pitch)
            pitch_str = f"+{int((pitch_f - 1) * 10)}Hz" if pitch_f >= 1 else f"{int((pitch_f - 1) * 10)}Hz"
            
            # Временный файл
            with tempfile.NamedTemporaryFile(delete=False, suffix='.mp3') as tmp:
                tmp_path = tmp.name
            
            try:
                # ВАЖНО: Используем python -m edge_tts
                result = subprocess.run([
                    sys.executable, '-m', 'edge_tts',
                    '--text', text,
                    '--voice', voice,
                    '--rate', rate_str,
                    '--pitch', pitch_str,
                    '--write-media', tmp_path
                ], capture_output=True, text=True, timeout=30)
                
                if result.returncode != 0:
                    raise Exception(f"edge-tts failed: {result.stderr}")
                
                # Читаем аудио
                with open(tmp_path, 'rb') as f:
                    audio_data = f.read()
                
                if len(audio_data) == 0:
                    raise Exception("Generated audio file is empty")
                
                base64_audio = base64.b64encode(audio_data).decode('utf-8')
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                
                self.wfile.write(json.dumps({'audio': base64_audio}).encode())
                
            finally:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
                    
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())