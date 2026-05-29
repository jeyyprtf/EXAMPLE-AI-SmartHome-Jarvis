// app.js — Gemini Live Audio PoC
// Referensi: github.com/google-gemini/gemini-live-api-examples
//
// Alur kerja:
//   1. Muat API Key dari file .env
//   2. Buka WebSocket ke Gemini Live API (v1alpha)
//   3. Kirim setup message
//   4. Mic selalu aktif → audio 16kHz PCM dikirim terus ke server
//   5. Server VAD mendeteksi kapan user bicara & berhenti
//   6. Respons audio 24kHz PCM dimainkan via Web Audio API

const btnConnect = document.getElementById('btnConnect');
const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');

let ws = null;
let audioCtx = null;       // AudioContext mic (16kHz)
let playCtx = null;        // AudioContext playback (24kHz)
let micStream = null;
let processor = null;
let nextPlayTime = 0;
let activeSources = [];    // Track audio sources untuk barge-in

function log(msg, cls = '') {
  const line = document.createElement('div');
  line.className = cls;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
  console.log(msg);
}

// ============================================================
// ENV — Muat konfigurasi dari .env
// ============================================================
const CONFIG = {
  GEMINI_API_KEY: '',
  GEMINI_MODEL: 'models/gemini-3.1-flash-live-preview'
};

async function loadEnv() {
  try {
    const res = await fetch('/.env');
    if (!res.ok) throw new Error('File .env tidak ditemukan');
    const text = await res.text();
    text.split('\n').forEach(line => {
      if (!line.trim() || line.trim().startsWith('#')) return;
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim();
        if (key) CONFIG[key] = val;
      }
    });
    log('Konfigurasi .env berhasil dimuat ✓', 'log-info');
    btnConnect.disabled = false;
  } catch (err) {
    log('Gagal memuat .env: ' + err.message + '. Pastikan file .env ada di root folder.', 'log-err');
  }
}

btnConnect.disabled = true;
loadEnv();

// ============================================================
// CONNECT — WebSocket ke Gemini Live API
// ============================================================
btnConnect.addEventListener('click', () => {
  if (ws && ws.readyState === WebSocket.OPEN) { ws.close(); return; }
  connect();
});

function connect() {
  const key = CONFIG.GEMINI_API_KEY;
  const model = CONFIG.GEMINI_MODEL || "models/gemini-3.1-flash-live-preview";

  if (!key || key.startsWith('YOUR_')) {
    log('Error: API Key kosong atau belum diset di .env!', 'log-err');
    return;
  }

  const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${key}`;

  log('Menghubungkan...', 'log-info');
  statusEl.textContent = 'CONNECTING...';
  btnConnect.disabled = true;

  ws = new WebSocket(url);

  ws.onopen = () => {
    log('WebSocket OPEN ✓', 'log-info');
    statusEl.textContent = 'CONNECTED';
    btnConnect.textContent = 'Disconnect';
    btnConnect.disabled = false;

    // Setup message — format sesuai contoh resmi Google
    const setupMessage = {
      setup: {
        model: model,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Sulafat" }
            }
          }
        },
        systemInstruction: {
          parts: [{ text: "Kamu adalah asisten AI bernama Jarvis. Jawab dengan singkat dalam bahasa Indonesia." }]
        }
      }
    };

    log('Model: ' + model, 'log-info');
    log('→ Setup sent', 'log-sent');
    ws.send(JSON.stringify(setupMessage));

    // Mic langsung aktif setelah connect
    startMic();
  };

  // Handle response — bisa String, Blob, atau ArrayBuffer
  ws.onmessage = async (event) => {
    let jsonText;
    if (event.data instanceof Blob) {
      jsonText = await event.data.text();
    } else if (event.data instanceof ArrayBuffer) {
      jsonText = new TextDecoder().decode(event.data);
    } else {
      jsonText = event.data;
    }

    try {
      const data = JSON.parse(jsonText);

      if (data.setupComplete) {
        log('✅ Setup complete!', 'log-info');
        return;
      }

      const sc = data.serverContent;
      if (sc) {
        // Audio dari model
        if (sc.modelTurn?.parts) {
          for (const part of sc.modelTurn.parts) {
            if (part.inlineData?.data) playAudio(part.inlineData.data);
            if (part.text) log('💬 ' + part.text, 'log-recv');
          }
        }

        // Transkripsi
        if (sc.inputTranscription?.text) log('🗣️ Kamu: ' + sc.inputTranscription.text, 'log-info');
        if (sc.outputTranscription?.text) log('🤖 Gemini: ' + sc.outputTranscription.text, 'log-info');

        // Barge-in: user menyela saat Gemini bicara
        if (sc.interrupted) {
          log('⚡ Interupsi', 'log-info');
          flushPlayback();
        }
        if (sc.turnComplete) log('✅ Turn selesai', 'log-info');
        return;
      }

      if (data.toolCall) {
        log('🔧 ' + JSON.stringify(data.toolCall), 'log-recv');
        return;
      }

      // Pesan lain (misal sessionResumptionUpdate)
      log('← ' + JSON.stringify(data).substring(0, 300), 'log-recv');

    } catch (err) {
      log('Parse error: ' + err.message, 'log-err');
    }
  };

  ws.onerror = () => log('WebSocket ERROR', 'log-err');

  ws.onclose = (e) => {
    log(`CLOSED (code=${e.code}, reason=${e.reason || '-'})`, 'log-err');
    statusEl.textContent = 'DISCONNECTED';
    btnConnect.textContent = 'Connect';
    btnConnect.disabled = false;
    stopMic();
    ws = null;
  };
}

// ============================================================
// MIC — Rekam audio 16kHz PCM via AudioWorklet
// ============================================================
// AudioWorklet dipilih karena ScriptProcessorNode sudah deprecated
// dan berjalan di main thread (menyebabkan UI lag).
// AudioWorklet berjalan di dedicated audio thread.
async function startMic() {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
    });
    log('Mic ✓', 'log-info');

    audioCtx = new AudioContext({ sampleRate: 16000 });
    const source = audioCtx.createMediaStreamSource(micStream);

    // Inline AudioWorklet processor
    const code = `
      class P extends AudioWorkletProcessor {
        process(inputs) {
          const ch = inputs[0]?.[0];
          if (ch) this.port.postMessage(ch);
          return true;
        }
      }
      registerProcessor('p', P);
    `;
    await audioCtx.audioWorklet.addModule(
      URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
    );
    if (!audioCtx) return;

    processor = new AudioWorkletNode(audioCtx, 'p');
    let buf = [];
    processor.port.onmessage = (e) => {
      // Audio SELALU dikirim (termasuk saat diam).
      // VAD server Gemini yang mendeteksi kapan user bicara & berhenti.
      buf.push(...e.data);
      if (buf.length >= 2048) {
        sendAudio(buf.splice(0, 2048));
      }
    };
    source.connect(processor);
  } catch (err) {
    log('Mic error: ' + err.message, 'log-err');
  }
}

function stopMic() {
  processor?.disconnect(); processor = null;
  micStream?.getTracks().forEach(t => t.stop()); micStream = null;
  audioCtx?.close(); audioCtx = null;
}

// ============================================================
// SEND AUDIO — Float32 → Int16 PCM → Base64 → WebSocket
// ============================================================
function sendAudio(samples) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  // Konversi Float32 (-1.0 s/d 1.0) ke Int16 (-32768 s/d 32767)
  const int16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }

  // Int16 → Base64
  const b64 = btoa(Array.from(new Uint8Array(int16.buffer), b => String.fromCharCode(b)).join(''));

  ws.send(JSON.stringify({
    realtimeInput: {
      audio: { mimeType: "audio/pcm", data: b64 }
    }
  }));

  // Log setiap 10 chunk (supaya tidak spam)
  sendAudio._c = (sendAudio._c || 0) + 1;
  if (sendAudio._c % 10 === 1) {
    log('→ Audio #' + sendAudio._c, 'log-sent');
  }
}

// ============================================================
// PLAYBACK — Putar audio PCM 24kHz dari Gemini
// ============================================================
// Teknik: scheduled playback dengan nextPlayTime.
// Setiap chunk dijadwalkan mulai tepat setelah chunk sebelumnya selesai,
// sehingga tidak ada gap atau overlap antar chunk (gapless playback).
function playAudio(base64) {
  if (!playCtx) playCtx = new AudioContext({ sampleRate: 24000 });
  if (playCtx.state === 'suspended') playCtx.resume();

  // Base64 → Int16 → Float32
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;

  const buf = playCtx.createBuffer(1, float32.length, 24000);
  buf.copyToChannel(float32, 0);
  const src = playCtx.createBufferSource();
  src.buffer = buf;
  src.connect(playCtx.destination);

  // Track source supaya bisa di-stop saat barge-in
  activeSources.push(src);
  src.onended = () => activeSources = activeSources.filter(s => s !== src);

  if (nextPlayTime < playCtx.currentTime) nextPlayTime = playCtx.currentTime + 0.02;
  src.start(nextPlayTime);
  nextPlayTime += buf.duration;
}

// Stop semua audio yang sedang/akan diputar (untuk barge-in)
function flushPlayback() {
  activeSources.forEach(s => { try { s.stop(); } catch(e) {} });
  activeSources = [];
  nextPlayTime = 0;
}
