# Smart Home AI Hub (Jarvis) - Phase 1: Browser PoC

Repositori ini berisi kode untuk **Phase 1 (Proof of Concept di Browser/Laptop)** dari proyek Smart Home AI Hub berbasis **Gemini Live API (Native Audio)** dan **ESP32-S3**. 

PoC ini dibangun menggunakan HTML, Vanilla CSS (tema gelap modern dengan aksen oranye ala Anthropic), dan Vanilla JavaScript tanpa framework tambahan agar Anda dapat mempelajari cara kerja sistem secara mendasar sebelum memindahkannya ke sistem tertanam (embedded system).

---

## Fitur Utama Phase 1

1. **Koneksi WebSocket Real-time**: Komunikasi dua arah dengan model Gemini Live API (misal `gemini-2.0-flash-exp` atau `gemini-2.5-flash`).
2. **Audio Streaming Pipeline**:
   - **Perekaman (Input)**: Menangkap mikrofon browser, mengonversi audio Float32 ke **16-bit PCM 16kHz Mono**, dan mengirimkannya secara terus-menerus dalam bentuk chunks Base64.
   - **Pemutaran (Output)**: Menerima data **24kHz PCM** dari Gemini dan memutarnya secara gapless (tanpa kresek/putus-putus) melalui Web Audio API.
3. **Interupsi Alami (Barge-in)**: Jika Anda menyela pembicaraan Jarvis, sistem akan mendeteksi suara Anda melalui VAD server-side, lalu browser akan langsung mematikan suara Jarvis secara instan.
4. **Function Calling (Simulasi IoT)**:
   - Mendeklarasikan tools smart home saat inisialisasi WebSocket.
   - AI dapat memanggil fungsi `control_device` untuk mengubah kondisi perangkat (Lampu, AC, Kipas, Kunci Pintu).
   - Dashboard simulasi IoT di browser akan memperbarui tampilan secara otomatis berdasarkan respon fungsi.
5. **WebSocket Traffic Logger**: Panel log interaktif yang menampilkan data JSON keluar/masuk secara real-time untuk memudahkan Anda belajar.

---

## Cara Menjalankan Project

Browser memiliki kebijakan keamanan ketat yang **membatasi akses mikrofon (`getUserMedia`) dan fitur AudioWorklet jika file dibuka langsung** menggunakan double-click (`file://`). Aplikasi ini **harus dijalankan melalui server lokal (localhost)**.

### Metode 1: Menggunakan Python (Paling Mudah)
Jika di laptop Anda sudah terinstal Python, buka terminal di folder proyek ini dan jalankan:
```bash
python3 -m http.server 8000
```
Lalu buka browser Anda dan akses: [http://localhost:8000](http://localhost:8000)

### Metode 2: Menggunakan Node.js (`http-server`)
Jika Anda lebih terbiasa dengan ekosistem JavaScript:
1. Instal paket server statis:
   ```bash
   npm install -g http-server
   ```
2. Jalankan server:
   ```bash
   http-server -p 8000
   ```
3. Akses di browser: [http://localhost:8000](http://localhost:8000)

---

## Cara Menggunakan PoC

1. Dapatkan API Key Gemini Anda secara gratis di [Google AI Studio](https://aistudio.google.com/).
2. Masukkan API Key Anda pada kolom **Gemini API Key**.
3. Pilih suara AI yang Anda sukai (misalnya suara *Puck* untuk gaya ceria atau *Charon* untuk gaya nge-bass).
4. Klik tombol **"Connect to Gemini"**.
5. Setelah status berubah menjadi **CONNECTED**, klik tombol **"Mulai Bicara (Unmute)"** dan izinkan akses mikrofon pada browser Anda.
6. Mulailah mengobrol dengan Jarvis, contohnya:
   - *"Halo Jarvis, apa kabar?"*
   - *"Tolong nyalakan lampu ruang tamu dan atur kecerahannya ke 75 persen."*
   - *"Ubah suhu AC ruang tengah menjadi 20 derajat."*
   - *"Buka kunci pintu depan."*
7. Perhatikan dashboard perangkat simulasi dan WebSocket Logger di bagian bawah untuk melihat JSON payload yang dikirim dan diterima.

---

## Panduan Belajar: Cara Kerja Kode

### 1. Resampling & Konversi Audio (`app.js`)
Gemini Live API mensyaratkan input audio berupa PCM 16-bit 16kHz. 
- Kita menginisialisasi `new AudioContext({ sampleRate: 16000 })` agar browser otomatis melakukan resampling.
- Konversi Float32 (nilai desimal -1.0 s.d 1.0) ke Int16 PCM (bilangan bulat -32768 s.d 32767) dilakukan dengan mengalikan nilai float dengan `32767` (atau `32768` untuk nilai negatif).

### 2. Timeline Scheduling Playback (`app.js`)
Untuk menghindari jeda antar paket audio (buffer underrun) yang memicu suara kresek:
- Kita membuat variabel penunjuk waktu `nextPlaybackStartTime`.
- Setiap kali audio chunk baru masuk, ia akan dijadwalkan tepat setelah durasi chunk sebelumnya selesai, menggunakan `playbackContext.currentTime`.

### 3. Skema Function Calling (`app.js`)
Ketika model memutuskan untuk mengontrol perangkat, ia akan mengirim pesan JSON terstruktur seperti berikut:
```json
{
  "toolCall": {
    "functionCalls": [
      {
        "id": "panggilan_123",
        "name": "control_device",
        "args": {
          "device_id": "living_room_lamp",
          "action": "set_value",
          "value": "80"
        }
      }
    ]
  }
}
```
Aplikasi kita akan mengeksekusi aksi tersebut secara lokal di JavaScript, memperbarui tampilan HTML, dan mengirim respon balik ke Gemini:
```json
{
  "toolResponse": {
    "functionResponses": [
      {
        "id": "panggilan_123",
        "response": {
          "output": {
            "success": true,
            "message": "Lampu Ruang Tamu berhasil diatur ke 80."
          }
        }
      }
    ]
  }
}
```

---

## Roadmap Fase Berikutnya: Menuju ESP32-S3

Setelah memvalidasi alur audio dan logika AI di browser pada Fase 1 ini, Anda dapat merencanakan Fase 2 (Migrasi ke Hardware):

### 1. Kebutuhan Komponen Hardware
- **Mikrofon**: INMP441 (I2S Digital Microphone).
- **Speaker / DAC**: MAX98357A (I2S Class D Amplifier) + Speaker 4 ohm/8 ohm.
- **Microcontroller**: ESP32-S3 (disarankan dev kit dengan RAM yang cukup karena pemrosesan audio membutuhkan buffer).

### 2. Skema Wiring I2S ke ESP32-S3

| Komponen | Pin INMP441 (Mic) | Pin MAX98357A (Amplifier) | Pin ESP32-S3 (Contoh) |
| :--- | :--- | :--- | :--- |
| **Daya** | VDD (3.3V) | VIN (5V / 3.3V) | 3.3V / 5V |
| **Ground** | GND | GND | GND |
| **I2S Clock** | SCK | BCLK | GPIO 4 (BCLK) |
| **I2S Word Select** | WS | LRC | GPIO 5 (WS/LRC) |
| **I2S Data In (Mic)**| SD | - | GPIO 6 (DIN) |
| **I2S Data Out (Amp)**| - | DIN | GPIO 7 (DOUT) |
| **Channel Select** | L/R (GND untuk kiri) | - | GND |
| **Gain / SD** | - | SD (Bisa dibiarkan) | NC / Pull-up |

### 3. Firmware ESP32-S3
- Menggunakan **ESP-IDF** atau **Arduino Core with PlatformIO**.
- Menginisialisasi dua saluran I2S (I2S_NUM_0 untuk input mic dan I2S_NUM_1 untuk output speaker).
- Membuka koneksi WebSocket ke API Gemini (menggunakan library `WebSocketsClient` di Arduino atau WebSocket client bawaan ESP-IDF).
- Mengodekan data biner mic menjadi Base64 secara real-time dan mengirimkannya dalam format JSON yang sama seperti PoC ini.
