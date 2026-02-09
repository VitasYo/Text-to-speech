// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Command, Stdio};
use std::fs;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[tauri::command]
async fn generate_speech(text: String, voice: String, rate: String, pitch: String) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let audio_file = temp_dir.join(format!("tts_{}.mp3", uuid::Uuid::new_v4()));
    
    // Преобразуем rate в проценты для edge-tts
    let rate_f: f32 = rate.parse().unwrap_or(1.0);
    let rate_percent_value = ((rate_f - 1.0) * 100.0) as i32;
    let rate_percent = if rate_percent_value >= 0 {
        format!("+{}%", rate_percent_value)
    } else {
        format!("{}%", rate_percent_value)
    };
    
    // Преобразуем pitch в герцы для edge-tts
    let pitch_f: f32 = pitch.parse().unwrap_or(1.0);
    let pitch_hz_value = ((pitch_f - 1.0) * 10.0) as i32;
    let pitch_hz = if pitch_hz_value >= 0 {
        format!("+{}Hz", pitch_hz_value)
    } else {
        format!("{}Hz", pitch_hz_value)
    };
    
    // Пытаемся найти встроенный wrapper
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()));
    
    let wrapper_path = if let Some(dir) = exe_dir {
        let bundled = dir.join("python-dist").join("edge_tts_wrapper.exe");
        if bundled.exists() {
            Some(bundled)
        } else {
            None
        }
    } else {
        None
    };
    
    let output = if let Some(wrapper) = wrapper_path {
        // Используем встроенный wrapper
        let mut cmd = Command::new(&wrapper);
        cmd.arg(&text)
            .arg(&voice)
            .arg(&rate_percent)
            .arg(&pitch_hz)
            .arg(&audio_file);
        
        // Скрываем окно консоли на Windows
        #[cfg(windows)]
        {
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        
        cmd.stdout(Stdio::null())
            .stderr(Stdio::piped())
            .output()
    } else {
        // Используем системный Python (для разработки)
        let mut cmd = Command::new("python");
        cmd.arg("-m")
            .arg("edge_tts")
            .arg("--text")
            .arg(&text)
            .arg("--voice")
            .arg(&voice)
            .arg("--rate")
            .arg(&rate_percent)
            .arg("--pitch")
            .arg(&pitch_hz)
            .arg("--write-media")
            .arg(&audio_file);
        
        // Скрываем окно консоли на Windows
        #[cfg(windows)]
        {
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        
        cmd.stdout(Stdio::null())
            .stderr(Stdio::piped())
            .output()
    }
    .map_err(|e| format!("Не удалось запустить edge-tts: {}", e))?;
    
    if !output.status.success() {
        let error_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!("edge-tts завершился с ошибкой: {}", error_msg));
    }
    
    // Проверяем что файл создан
    if !audio_file.exists() {
        return Err("Аудио файл не был создан".to_string());
    }
    
    // Читаем аудио файл и конвертируем в base64
    let audio_data = fs::read(&audio_file).map_err(|e| e.to_string())?;
    let base64_audio = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &audio_data);
    
    // Удаляем временный аудио файл
    let _ = fs::remove_file(&audio_file);
    
    Ok(base64_audio)
}

#[tauri::command]
async fn fetch_webpage(url: String) -> Result<String, String> {
    // Загружаем веб-страницу
    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Ошибка загрузки страницы: {}", e))?;
    
    let html = response.text()
        .await
        .map_err(|e| format!("Ошибка чтения HTML: {}", e))?;
    
    Ok(html)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![generate_speech, fetch_webpage])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}