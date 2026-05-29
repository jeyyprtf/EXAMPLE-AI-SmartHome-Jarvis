# 🎙️ Gemini Live Audio Test - Minimal PoC

[🇮🇩 Bahasa Indonesia](#bahasa-indonesia) | [🇬🇧 English](#english)

---

## Bahasa Indonesia

### Deskripsi
Aplikasi web sederhana ini adalah Proof of Concept (PoC) minimal untuk menguji konektivitas audio real-time dua arah menggunakan **Gemini Live API (WebSockets)** secara langsung dari browser.

Tujuan utama proyek ini adalah untuk mempelajari alur pengiriman audio mikrofon (16kHz PCM) ke Gemini dan memutar respons audio balikan (24kHz PCM) secara langsung menggunakan Web Audio API tanpa library tambahan yang rumit.

### Fitur Utama
1. **WebSocket Real-time**: Koneksi langsung ke endpoint Gemini Live API (`v1alpha`).
2. **Audio Streaming Pipeline**:
   * **Input**: Perekaman mikrofon 16kHz PCM Mono yang dikirim secara kontinu.
   * **Output**: Pemutaran audio 24kHz PCM secara mulus (*gapless*) dari Gemini.
3. **Penyimpanan Kunci Aman**: API Key disimpan di file `.env` lokal dan dikecualikan oleh `.gitignore` agar aman saat di-publish ke GitHub.
4. **Log Real-time**: Panel log interaktif yang menampilkan lalu lintas data masuk dan keluar.

### Prasyarat
- Node.js terinstal di komputer/laptop Anda.

### Panduan Menjalankan Project (Sangat Mudah!)

1. **Download / Klon** repositori ini ke komputer Anda.
2. **Siapkan Konfigurasi `.env`**:
   * Cari file bernama `.env.example` di folder proyek ini.
   * Copy file tersebut dan ubah namanya menjadi `.env` (atau rename saja).
   * Buka file `.env` dengan text editor pilihan Anda (VS Code, Notepad, dll).
   * Isi kolom `GEMINI_API_KEY` dengan API Key Anda yang didapatkan dari [Google AI Studio](https://aistudio.google.com/). Contoh:
     ```env
     GEMINI_API_KEY=AIzaSyA1...
     ```
3. **Jalankan Local Server**:
   Buka terminal/command prompt di folder project ini dan jalankan perintah berikut:
   ```bash
   npx http-server -p 8000 -c-1
   ```
4. **Buka Aplikasi**:
   * Buka browser (Chrome/Edge disarankan) dan akses url: **http://localhost:8000**
   * Klik tombol **Connect**.
   * Izinkan akses mikrofon saat browser memintanya.
   * Setelah status berubah menjadi **CONNECTED**, **silakan langsung bicara** ke mikrofon Anda! Gemini akan merespons melalui speaker Anda.

---

## English

### Description
This simple web application is a minimal Proof of Concept (PoC) to test real-time, bidirectional audio connectivity using the **Gemini Live API (WebSockets)** directly from your browser.

The main goal of this project is to understand the mechanics of capturing microphone audio (16kHz PCM), streaming it to Gemini, and playing back the response (24kHz PCM) using the Web Audio API without complex third-party dependencies.

### Features
1. **Real-time WebSockets**: Direct connection to the Gemini Live API endpoint (`v1alpha`).
2. **Audio Streaming Pipeline**:
   * **Input**: Continuous streaming of 16kHz PCM Mono microphone audio.
   * **Output**: Seamless, gapless playback of incoming 24kHz PCM audio from Gemini.
3. **Secure API Key Management**: Uses a local `.env` configuration file to prevent key leaks, pre-configured with `.gitignore`.
4. **Real-time Logs**: An interactive log console displaying incoming/outgoing payloads.

### Prerequisites
- Node.js installed on your computer.

### Step-by-Step Guide to Run (Beginner-Friendly!)

1. **Clone or Download** this repository to your local machine.
2. **Set up `.env` Configuration**:
   * Locate the `.env.example` file in the project folder.
   * Duplicate and rename it to `.env`.
   * Open the `.env` file with a text editor (VS Code, Notepad, etc.).
   * Replace the placeholder with your actual Gemini API Key from [Google AI Studio](https://aistudio.google.com/):
     ```env
     GEMINI_API_KEY=AIzaSyA1...
     ```
3. **Start the Local Server**:
   Open your terminal/command prompt inside the project directory and run:
   ```bash
   npx http-server -p 8000 -c-1
   ```
4. **Open the Application**:
   * Open your browser and navigate to: **http://localhost:8000**
   * Click the **Connect** button.
   * Grant microphone access permissions when prompted by the browser.
   * Once the status displays **CONNECTED**, **simply start talking** into your mic! Gemini will respond back using your speakers.
