import subprocess
import tempfile
import os

with tempfile.NamedTemporaryFile(delete=False, suffix='.mp3') as tmp:
    tmp_path = tmp.name

# Используем python -m edge_tts вместо команды edge-tts
result = subprocess.run([
    'python', '-m', 'edge_tts',
    '--text', 'Привет мир',
    '--voice', 'ru-RU-SvetlanaNeural',
    '--write-media', tmp_path
], capture_output=True, text=True)

print("Return code:", result.returncode)
print("Stdout:", result.stdout)
print("Stderr:", result.stderr)
print("File exists:", os.path.exists(tmp_path))

if os.path.exists(tmp_path):
    print("File size:", os.path.getsize(tmp_path), "bytes")