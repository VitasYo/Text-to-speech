<template>
  <div class="app">
    <header class="header">
      <h1>🔊 Text to Speech</h1>
      <p>Озвучка текста из файлов, картинок и веб-страниц</p>
    </header>

    <main class="main-content">
       <!-- Предупреждение для веб-версии -->
      <div v-if="!isDesktop" class="web-notice">
        ℹ️ Веб-версия использует браузерную озвучку. 
        Для качественной озвучки скачайте 
        <a href="https://github.com/твой-репозиторий/releases" target="_blank">десктопное приложение</a>
      </div>

      <!-- Панель загрузки -->
      <div class="upload-section">
        <button @click="selectFile" class="btn btn-primary">
          📁 Загрузить файл
        </button>
        <input 
          type="file" 
          ref="fileInput" 
          @change="handleFileUpload"
          accept=".txt,.docx,image/*"
          style="display: none"
        >
        <span class="file-info" v-if="fileName">{{ fileName }}</span>
        <span v-if="isProcessing" class="processing">⏳ Обработка...</span>
      </div>

      <!-- Поле для URL веб-страницы -->
      <div class="url-section">
        <input 
          v-model="webUrl"
          type="text"
          placeholder="Вставьте URL веб-страницы"
          class="url-input"
        >
        <button @click="fetchWebPage" class="btn btn-secondary" :disabled="!webUrl || isProcessing">
          🌐 Загрузить
        </button>
      </div>

      <!-- Текстовая область -->
      <div class="text-section">
        <textarea 
          v-model="textContent"
          placeholder="Загрузите файл, картинку, веб-страницу или вставьте текст сюда..."
          class="text-area"
        ></textarea>
      </div>

      <!-- Прогресс-бар озвучки -->
      <div v-if="isSpeaking || isPaused" class="progress-section">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progress + '%' }"></div>
        </div>
        <div class="progress-time">
          {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
        </div>
      </div>

      <!-- Панель управления воспроизведением -->
      <div class="controls-section">
        <button 
          @click="togglePlayPause" 
          class="btn btn-success"
          :disabled="!textContent || isGenerating"
        >
          {{ isPaused ? '▶️ Продолжить' : (isSpeaking ? '⏸️ Пауза' : '▶️ Озвучить') }}
        </button>
        <button 
          @click="stop" 
          class="btn btn-danger"
          :disabled="!isSpeaking && !isPaused"
        >
          ⏹️ Стоп
        </button>
        <button 
          @click="downloadAudio" 
          class="btn btn-info"
          :disabled="!textContent || isGenerating"
        >
          {{ isGenerating ? '⏳ Генерация...' : '💾 Скачать MP3' }}
        </button>
      </div>

      <!-- Настройки голоса -->
      <div class="settings-section">
        <div class="setting">
          <label>Голос:</label>
          <select v-model="edgeVoice" class="select">
            <optgroup label="Русские голоса">
              <option value="ru-RU-DmitryNeural">Дмитрий (мужской)</option>
              <option value="ru-RU-SvetlanaNeural">Светлана (женский)</option>
            </optgroup>
            <optgroup label="Английские голоса">
              <option value="en-US-GuyNeural">Guy (мужской)</option>
              <option value="en-US-JennyNeural">Jenny (женский)</option>
            </optgroup>
          </select>
        </div>

        <div class="setting">
          <label>Скорость: {{ rate }}</label>
          <input 
            type="range" 
            v-model="rate" 
            min="0.5" 
            max="2" 
            step="0.1"
            class="slider"
          >
        </div>

        <div class="setting">
          <label>Высота: {{ pitch }}</label>
          <input 
            type="range" 
            v-model="pitch" 
            min="0.5" 
            max="2" 
            step="0.1"
            class="slider"
          >
        </div>
      </div>
    </main>

    <!-- Уведомление -->
    <div v-if="showNotification" class="notification">
      {{ notificationMessage }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { createWorker } from 'tesseract.js';
import mammoth from 'mammoth';

// Определяем окружение
const isDesktop = ref(false);
let invoke: any = null;

// Состояние
const textContent = ref('');
const fileName = ref('');
const webUrl = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
const isSpeaking = ref(false);
const isPaused = ref(false);
const isProcessing = ref(false);
const isGenerating = ref(false);

// Прогресс
const progress = ref(0);
const currentTime = ref(0);
const duration = ref(0);
let progressInterval: number | null = null;

// Уведомления
const showNotification = ref(false);
const notificationMessage = ref('');

// Настройки голоса
const edgeVoice = ref('ru-RU-SvetlanaNeural');
const rate = ref(1);
const pitch = ref(1);

// Аудио
let currentAudio: HTMLAudioElement | null = null;
let currentAudioUrl: string | null = null;

// Определение окружения при монтировании
onMounted(async () => {
  // Проверяем, запущено ли в Tauri
  if ((window as any).__TAURI__) {
    isDesktop.value = true;
    const module = await import('@tauri-apps/api/core');
    invoke = module.invoke;
  }
});

// Уведомления
function notify(message: string, duration: number = 3000) {
  notificationMessage.value = message;
  showNotification.value = true;
  setTimeout(() => {
    showNotification.value = false;
  }, duration);
}

// Форматирование времени
function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Очистка текста
function cleanText(text: string): string {
  return text
    .replace(/https?:\/\/[^\s]+/g, '')
    .replace(/[\w.-]+@[\w.-]+\.\w+/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Обновление прогресса
function startProgressTracking() {
  if (progressInterval) clearInterval(progressInterval);
  
  progressInterval = window.setInterval(() => {
    if (currentAudio && !currentAudio.paused) {
      currentTime.value = currentAudio.currentTime;
      duration.value = currentAudio.duration || 0;
      
      if (duration.value > 0) {
        progress.value = (currentTime.value / duration.value) * 100;
      }
    }
  }, 100);
}

function stopProgressTracking() {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
  progress.value = 0;
  currentTime.value = 0;
  duration.value = 0;
}

// Очистка при размонтировании
onUnmounted(() => {
  stopProgressTracking();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = null;
  }
});

// ========== ЗАГРУЗКА ФАЙЛОВ ==========

function selectFile() {
  fileInput.value?.click();
}

async function handleFileUpload(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  
  if (!file) return;
  
  fileName.value = file.name;
  isProcessing.value = true;
  
  try {
    if (file.name.endsWith('.txt')) {
      const text = await file.text();
      textContent.value = text;
      notify('✅ Текст загружен');
    }
    else if (file.name.endsWith('.docx')) {
      await processDOCX(file);
    }
    else if (file.type.startsWith('image/')) {
      await processImageOCR(file);
    }
  } catch (error) {
    console.error('Ошибка обработки файла:', error);
    notify('❌ Ошибка при обработке файла');
  } finally {
    isProcessing.value = false;
  }
}

// ========== DOCX ==========
async function processDOCX(file: File) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    textContent.value = result.value;
    notify('✅ DOCX успешно обработан');
  } catch (error) {
    console.error('Ошибка DOCX:', error);
    notify('❌ Не удалось обработать DOCX');
  }
}

// ========== OCR ==========
async function processImageOCR(file: File) {
  try {
    const worker = await createWorker('rus+eng');
    const { data: { text } } = await worker.recognize(file);
    textContent.value = text;
    await worker.terminate();
    notify('✅ Текст распознан с изображения');
  } catch (error) {
    console.error('Ошибка OCR:', error);
    notify('❌ Не удалось распознать текст');
  }
}

// ========== ВЕБ-СТРАНИЦЫ ==========
async function fetchWebPage() {
  if (!webUrl.value) return;
  
  isProcessing.value = true;
  
  try {
    let html: string;
    
    if (isDesktop.value && invoke) {
      // Десктоп - используем Tauri
      html = await invoke('fetch_webpage', { url: webUrl.value }) as string;
    } else {
      // Веб - используем CORS proxy
      const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(webUrl.value)}`);
      const data = await response.json();
      html = data.contents;
    }
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Удаляем ненужные элементы
    const unwantedSelectors = [
      'header', 'nav', 'footer', 'aside',
      '.header', '.nav', '.navigation', '.footer', '.sidebar',
      '[role="navigation"]', '[role="banner"]', '[role="complementary"]',
      'script', 'style', 'iframe', 'noscript'
    ];
    
    unwantedSelectors.forEach(selector => {
      doc.querySelectorAll(selector).forEach(el => el.remove());
    });
    
    // Ищем основной контент
    const mainContent = 
      doc.querySelector('main')?.textContent ||
      doc.querySelector('article')?.textContent ||
      doc.querySelector('[role="main"]')?.textContent ||
      doc.querySelector('.post-content')?.textContent ||
      doc.querySelector('.article-content')?.textContent ||
      doc.querySelector('.content')?.textContent ||
      doc.querySelector('#content')?.textContent ||
      doc.body?.textContent ||
      '';
    
    // Очищаем текст
    const cleanedText = mainContent
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();
    
    textContent.value = cleanedText;
    
    if (!textContent.value) {
      notify('❌ Не удалось извлечь текст со страницы');
    } else {
      notify('✅ Текст загружен с веб-страницы');
    }
    
  } catch (error) {
    console.error('Ошибка загрузки страницы:', error);
    notify(`❌ Ошибка: ${error}`);
  } finally {
    isProcessing.value = false;
  }
}

// ========== ОЗВУЧКА ==========

async function generateAudio(): Promise<string> {
  const text = textContent.value;
  
  // Очищаем текст
  const cleanedText = cleanText(text);
  
  const maxLength = 5000;
  let textToSpeak = cleanedText;
  
  if (cleanedText.length > maxLength) {
    textToSpeak = cleanedText.substring(0, maxLength);
    notify(`⚠️ Текст обрезан до ${maxLength} символов`);
  }
  
  const rateValue = rate.value.toString();
  const pitchValue = pitch.value.toString();
  
  if (isDesktop.value && invoke) {
    // Десктопная версия - используем Tauri
    notify('⏳ Генерация аудио...', 10000);
    
    const base64Audio = await invoke('generate_speech', {
      text: textToSpeak,
      voice: edgeVoice.value,
      rate: rateValue,
      pitch: pitchValue
    }) as string;
    
    return base64Audio;
  } else {
    // Веб-версия - используем БРАУЗЕРНЫЙ TTS (не API)
    throw new Error('На веб-версии используйте браузерный TTS. Edge TTS доступен только в десктопном приложении.');
  }
}

async function togglePlayPause() {
  if (isPaused.value && currentAudio) {
    await currentAudio.play();
    isSpeaking.value = true;
    isPaused.value = false;
    startProgressTracking();
    return;
  }
  
  if (isSpeaking.value && currentAudio) {
    currentAudio.pause();
    isSpeaking.value = false;
    isPaused.value = true;
    return;
  }
  
  await speak();
}

async function speak() {
  try {
    // ПОЛНАЯ ОЧИСТКА ВСЕХ АУДИО
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = '';
      currentAudio.load();
      currentAudio = null;
    }
    if (currentAudioUrl) {
      URL.revokeObjectURL(currentAudioUrl);
      currentAudioUrl = null;
    }
    
    // Останавливаем ВСЕ медиа на странице
    document.querySelectorAll('audio, video').forEach((media: any) => {
      media.pause();
      media.src = '';
      media.load();
    });
    
    stopProgressTracking();
    
    isSpeaking.value = true;
    isPaused.value = false;
    
    const base64Audio = await generateAudio();
    
    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const audioBlob = new Blob([bytes], { type: 'audio/mp3' });
    const audioUrl = URL.createObjectURL(audioBlob);
    currentAudioUrl = audioUrl;
    
    currentAudio = new Audio(audioUrl);
    
    currentAudio.onloadedmetadata = () => {
      if (currentAudio) {
        duration.value = currentAudio.duration;
      }
    };
    
    currentAudio.onended = () => {
      isSpeaking.value = false;
      isPaused.value = false;
      stopProgressTracking();
      if (currentAudio) {
        currentAudio.src = '';
        currentAudio.load();
        currentAudio = null;
      }
      if (currentAudioUrl) {
        URL.revokeObjectURL(currentAudioUrl);
        currentAudioUrl = null;
      }
      notify('✅ Воспроизведение завершено');
    };
    
    currentAudio.onerror = () => {
      isSpeaking.value = false;
      isPaused.value = false;
      stopProgressTracking();
    };
    
    await currentAudio.play();
    startProgressTracking();
    
  } catch (error) {
    console.error('Ошибка озвучки:', error);
    isSpeaking.value = false;
    isPaused.value = false;
    stopProgressTracking();
    notify(`❌ Ошибка: ${error}`);
  }
}

async function downloadAudio() {
  if (!textContent.value) {
    notify('⚠️ Введите текст для озвучки');
    return;
  }
  
  try {
    isGenerating.value = true;
    notify('⏳ Генерация аудио...');
    
    const base64Audio = await generateAudio();
    
    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const audioBlob = new Blob([bytes], { type: 'audio/mp3' });
    
    const url = URL.createObjectURL(audioBlob);
    const a = document.createElement('a');
    a.href = url;
    const filename = `speech_${Date.now()}.mp3`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    notify(`✅ Файл ${filename} сохранён в "Загрузки"`);
    
  } catch (error) {
    console.error('Ошибка генерации:', error);
    notify(`❌ Ошибка: ${error}`);
  } finally {
    isGenerating.value = false;
  }
}

function stop() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio.src = '';
    currentAudio.load();
    currentAudio = null;
  }
  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = null;
  }
  isSpeaking.value = false;
  isPaused.value = false;
  stopProgressTracking();
  notify('⏹️ Воспроизведение остановлено');
}
</script>

<style scoped>
.app {
  min-height: 100vh;
  height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 1.5rem;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.header {
  text-align: center;
  color: white;
  margin-bottom: 1.5rem;
  flex-shrink: 0;
}

.header h1 {
  font-size: clamp(1.5rem, 4vw, 2.5rem);
  margin: 0 0 0.5rem 0;
  text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
}

.header p {
  font-size: clamp(0.875rem, 2vw, 1.1rem);
  opacity: 0.9;
  margin: 0;
}

.main-content {
  width: 100%;
  max-width: 800px;
  background: white;
  border-radius: 1rem;
  padding: clamp(1rem, 3vw, 2rem);
  box-shadow: 0 10px 40px rgba(0,0,0,0.2);
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 10rem);
  overflow: hidden;
}

.web-notice {
  background: #fef3c7;
  border: 2px solid #f59e0b;
  padding: 0.75rem;
  border-radius: 0.5rem;
  margin-bottom: 1rem;
  font-size: 0.875rem;
  text-align: center;
  flex-shrink: 0;
}

.web-notice a {
  color: #667eea;
  font-weight: 600;
  text-decoration: underline;
}

.upload-section {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.file-info {
  color: #666;
  font-size: 0.875rem;
}

.processing {
  color: #667eea;
  font-weight: 600;
  font-size: 0.875rem;
}

.url-section {
  display: flex;
  gap: 0.625rem;
  margin-bottom: 1rem;
  flex-shrink: 0;
}

.url-input {
  flex: 1;
  padding: 0.75rem;
  border: 2px solid #e0e0e0;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  transition: border-color 0.3s;
}

.url-input:focus {
  outline: none;
  border-color: #667eea;
}

.text-section {
  margin-bottom: 1rem;
  flex: 1;
  min-height: 150px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.text-area {
  width: 100%;
  flex: 1;
  padding: 0.875rem;
  border: 2px solid #e0e0e0;
  border-radius: 0.625rem;
  font-size: 0.9375rem;
  font-family: inherit;
  resize: none;
  transition: border-color 0.3s;
  overflow-y: auto;
}

.text-area:focus {
  outline: none;
  border-color: #667eea;
}

.progress-section {
  margin-bottom: 1rem;
  flex-shrink: 0;
}

.progress-bar {
  width: 100%;
  height: 0.5rem;
  background: #e0e0e0;
  border-radius: 0.25rem;
  overflow: hidden;
  margin-bottom: 0.5rem;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #667eea, #764ba2);
  transition: width 0.1s linear;
  border-radius: 0.25rem;
}

.progress-time {
  text-align: center;
  font-size: 0.875rem;
  color: #666;
  font-weight: 600;
}

.controls-section {
  display: flex;
  gap: 0.625rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: #667eea;
  color: white;
}

.btn-secondary {
  background: #06b6d4;
  color: white;
}

.btn-success {
  background: #10b981;
  color: white;
}

.btn-danger {
  background: #ef4444;
  color: white;
}

.btn-info {
  background: #8b5cf6;
  color: white;
}

.settings-section {
  background: #f9fafb;
  padding: 1.25rem;
  border-radius: 0.625rem;
  flex-shrink: 0;
}

.setting {
  margin-bottom: 1rem;
}

.setting:last-child {
  margin-bottom: 0;
}

.setting label {
  display: block;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: #374151;
  font-size: 0.875rem;
}

.select {
  width: 100%;
  padding: 0.625rem;
  border: 2px solid #e0e0e0;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: white;
  cursor: pointer;
}

.slider {
  width: 100%;
  height: 0.5rem;
  border-radius: 0.25rem;
  background: #e0e0e0;
  outline: none;
  cursor: pointer;
}

.slider::-webkit-slider-thumb {
  appearance: none;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 50%;
  background: #667eea;
  cursor: pointer;
}

.slider::-moz-range-thumb {
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 50%;
  background: #667eea;
  cursor: pointer;
  border: none;
}

.notification {
  position: fixed;
  top: 1.25rem;
  right: 1.25rem;
  background: white;
  padding: 0.875rem 1.25rem;
  border-radius: 0.625rem;
  box-shadow: 0 4px 20px rgba(0,0,0,0.2);
  font-weight: 600;
  color: #374151;
  animation: slideIn 0.3s ease-out;
  z-index: 1000;
  max-width: 350px;
  font-size: 0.875rem;
}

@keyframes slideIn {
  from {
    transform: translateX(400px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@media (max-width: 768px) {
  .app {
    padding: 1rem;
  }
  
  .main-content {
    padding: 1.25rem;
    max-height: calc(100vh - 6rem);
  }
  
  .controls-section {
    justify-content: center;
  }
  
  .btn {
    flex: 1;
    min-width: 100px;
  }
}
</style>