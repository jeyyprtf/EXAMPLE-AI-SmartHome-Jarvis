const btnConnect = document.getElementById('btnConnect');
const btnTalk = document.getElementById('btnTalk');
const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');

let ws = null;
let audioCtx = null;
let playCtx = null;
let micStream = null;
let processor = null;
let isTalking = false;
let nextPlayTime = 0;

function log(msg, cls = '') {
  const line = document.createElement('div');
  line.className = cls;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
  console.log(msg);
}

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
      // Abaikan komentar dan baris kosong
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

// Mulai muat env di awal
btnConnect.disabled = true;
loadEnv();

// ============================================================
// CONNECT
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

  // Contoh resmi Google pakai v1alpha untuk model baru
  const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${key}`;

  log('Menghubungkan... (v1alpha)', 'log-info');
  statusEl.textContent = 'CONNECTING...';
  btnConnect.disabled = true;

  ws = new WebSocket(url);

  ws.onopen = () => {
    log('WebSocket OPEN ✓', 'log-info');
    statusEl.textContent = 'CONNECTED';
    btnConnect.textContent = 'Disconnect';
    btnConnect.disabled = false;
    btnTalk.disabled = false;

    // Format setup PERSIS seperti contoh resmi Google
    // github.com/google-gemini/gemini-live-api-examples/.../geminilive.js line 334
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

    startMic();
  };

  // Handle pesan masuk — bisa String atau Blob (sesuai contoh resmi Google)
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

      // Setup complete
      if (data.setupComplete) {
        log('✅ Setup complete!', 'log-info');
        return;
      }

      // Server content
      const sc = data.serverContent;
      if (sc) {
        // Audio dari model
        if (sc.modelTurn?.parts) {
          for (const part of sc.modelTurn.parts) {
            if (part.inlineData?.data) {
              playAudio(part.inlineData.data);
            }
            if (part.text) {
              log('💬 ' + part.text, 'log-recv');
            }
          }
        }

        // Transkripsi
        if (sc.inputTranscription?.text) {
          log('🗣️ Kamu: ' + sc.inputTranscription.text, 'log-info');
        }
        if (sc.outputTranscription?.text) {
          log('🤖 Gemini: ' + sc.outputTranscription.text, 'log-info');
        }

        if (sc.interrupted) {
          log('⚡ Interupsi', 'log-info');
          flushPlayback();
        }
        if (sc.turnComplete) {
          log('✅ Turn selesai', 'log-info');
        }
        return;
      }

      // Tool call
      if (data.toolCall) {
        log('🔧 ' + JSON.stringify(data.toolCall), 'log-recv');
        return;
      }

      // Unknown
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
    btnTalk.disabled = true;
    stopMic();
    ws = null;
  };
}

// ============================================================
// MIC — 16kHz PCM
// ============================================================
async function startMic() {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
    });
    log('Mic ✓', 'log-info');

    audioCtx = new AudioContext({ sampleRate: 16000 });
    const source = audioCtx.createMediaStreamSource(micStream);

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
      // SELALU kirim audio ke server (termasuk saat diam)
      // VAD server yang akan mendeteksi kapan kamu bicara & kapan berhenti
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

// Contoh resmi Google: mimeType "audio/pcm" (tanpa rate)
// github.com/google-gemini/gemini-live-api-examples/.../geminilive.js line 434
function sendAudio(samples) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const int16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }

  let bin = '';
  const bytes = new Uint8Array(int16.buffer);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);

  ws.send(JSON.stringify({
    realtimeInput: {
      audio: { mimeType: "audio/pcm", data: b64 }
    }
  }));

  sendAudio._c = (sendAudio._c || 0) + 1;
  if (sendAudio._c % 10 === 1) {
    log('→ Audio #' + sendAudio._c, 'log-sent');
  }
}

// ============================================================
// PLAYBACK — 24kHz PCM
// ============================================================
function playAudio(base64) {
  if (!playCtx) playCtx = new AudioContext({ sampleRate: 24000 });
  if (playCtx.state === 'suspended') playCtx.resume();

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

  if (nextPlayTime < playCtx.currentTime) nextPlayTime = playCtx.currentTime + 0.02;
  src.start(nextPlayTime);
  nextPlayTime += buf.duration;
}

function flushPlayback() { nextPlayTime = 0; }

// ============================================================
// TALK
// ============================================================
btnTalk.addEventListener('mousedown', () => {
  isTalking = true;
  btnTalk.classList.add('active');
  btnTalk.textContent = '🔴 Bicara...';
  log('🎤 Mulai bicara', 'log-info');
  if (audioCtx?.state === 'suspended') audioCtx.resume();
  if (playCtx?.state === 'suspended') playCtx.resume();
});
btnTalk.addEventListener('mouseup', stopTalking);
btnTalk.addEventListener('mouseleave', stopTalking);

function stopTalking() {
  if (!isTalking) return;
  isTalking = false;
  btnTalk.classList.remove('active');
  btnTalk.textContent = '🎤 Hold to Talk';
  log('🎤 Berhenti bicara', 'log-info');
}
