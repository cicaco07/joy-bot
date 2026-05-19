# Joy-Bot: Telegram Remote Control untuk Opencode

Bot Telegram untuk mengontrol opencode + 9router dari HP. Laptop menjalankan opencode, bot menjadi remote control. API key 9router tetap di laptop — tidak pernah dikirim ke Telegram.

## Prasyarat

- Node.js 18+
- `opencode` CLI sudah terinstall dan bisa dijalankan dari terminal laptop
- (Opsional) `opencode serve` untuk fitur session
- Bot Telegram sudah dibuat lewat `@BotFather`
- Telegram user ID kamu (cek lewat `@userinfobot`)

## Install

```powershell
npm install
Copy-Item .env.example .env
# Edit .env sesuai kebutuhan
npm run check-config
npm start
```

## Konfigurasi (.env)

Salin `.env.example` ke `.env` dan isi nilai berikut:

| Variabel | Default | Keterangan |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | — | Token dari BotFather (wajib) |
| `ALLOWED_TELEGRAM_USER_IDS` | — | CSV user ID yang diizinkan (wajib) |
| `PROJECTS_ROOT` | — | Folder root semua project (wajib) |
| `OPENCODE_COMMAND` | `opencode.cmd` | Path ke binary opencode |
| `OPENCODE_TIMEOUT_MS` | `600000` | Timeout eksekusi opencode (ms) |
| `PROGRESS_INTERVAL_MS` | `30000` | Interval pesan progress (ms) |
| `MAX_TELEGRAM_MESSAGE_CHARS` | `3500` | Batas karakter pesan Telegram |
| `OPENCODE_SERVER_URL` | `http://localhost:4096` | URL opencode server |
| `OMO_ALLOWED_COMMANDS` | `review-work,...` | Daftar command OMO yang diizinkan |
| `STORAGE_DIR` | `./storage` | Folder penyimpanan jobs/logs/sessions |
| `LOG_RETENTION_JOBS` | `50` | Jumlah log job yang disimpan |
| `FILE_READ_MAX_BYTES` | `1048576` | Batas baca file (1 MB) |
| `DOCTOR_TIMEOUT_MS` | `15000` | Timeout doctor check (ms) |

Di Windows gunakan `OPENCODE_COMMAND=opencode.cmd`. Jika error `ENOENT`, isi dengan path penuh hasil `where.exe opencode`.

## Command Reference

### Workspace & Navigasi

| Command | Keterangan |
|---|---|
| `/root` | Tampilkan PROJECTS_ROOT |
| `/workspaces` | Daftar workspace yang tersedia |
| `/workspace use <nama>` | Pilih workspace aktif |
| `/pwd` | Tampilkan workspace dan cwd aktif |
| `/cd <path>` | Navigasi ke folder di dalam workspace |

### File Browser (read-only)

| Command | Keterangan |
|---|---|
| `/ls [path]` | Daftar isi folder |
| `/tree [path]` | Tampilkan struktur folder (depth 3) |
| `/open <file>` | Baca isi file teks |
| `/cat <file>` | Alias untuk /open |
| `/find <keyword>` | Cari file berdasarkan nama |
| `/find --content <keyword>` | Cari berdasarkan isi file |
| `/download <file>` | Unduh file ke Telegram |

### Opencode CLI

| Command | Keterangan |
|---|---|
| `/run <prompt>` | Jalankan opencode run di workspace aktif |
| `/task <prompt>` | Alias untuk /run |
| `/doctor` | Cek apakah opencode bisa dijalankan |
| `/opencode_help` | Tampilkan opencode --help |

### Sessions

Membutuhkan `opencode serve` yang berjalan di laptop.

| Command | Keterangan |
|---|---|
| `/sessions` | Daftar session |
| `/session_new <judul>` | Buat session baru |
| `/session_use <id>` | Pilih session aktif |
| `/session_current` | Tampilkan session aktif |
| `/session_prompt <pesan>` | Kirim prompt ke session aktif |
| `/session_command <cmd>` | Jalankan slash command di session |
| `/session_abort` | Hentikan session aktif |

### Jobs & Logs

| Command | Keterangan |
|---|---|
| `/status` | Cek job yang sedang berjalan |
| `/jobs` | Daftar job terbaru |
| `/job <id>` | Detail job tertentu |
| `/cancel [id]` | Hentikan job aktif atau job tertentu |
| `/cancel_all` | Hentikan semua job |
| `/logs latest` | Log job terakhir |
| `/logs <id>` | Preview log job tertentu |
| `/logs <id> errors` | Hanya tampilkan baris error |
| `/logs <id> download` | Unduh log lengkap sebagai file |

### Settings

| Command | Keterangan |
|---|---|
| `/model` | Tampilkan model aktif |
| `/model use <provider/model>` | Ganti model default |
| `/agent use <agent>` | Ganti agent (build, plan, deep, ultrabrain, dll) |
| `/mode <plan\|build\|deep\|ultrawork>` | Ganti mode kerja |

### OMO

| Command | Keterangan |
|---|---|
| `/omo <command>` | Jalankan OMO slash command di session aktif |

Command yang diizinkan dikonfigurasi via `OMO_ALLOWED_COMMANDS`. Default: `review-work,handoff,hyperplan,ulw-loop,stop-continuation`.

## Storage

```
storage/
  settings.json     # Pengaturan per chat
  jobs/             # Satu file JSON per job
  logs/             # Log output per job
  sessions/         # Record session opencode
  tmp/              # File sementara untuk output panjang
```

## Security

- Bot hanya menerima pesan dari `ALLOWED_TELEGRAM_USER_IDS`
- Semua akses file dibatasi di dalam `PROJECTS_ROOT` (path traversal diblokir)
- Tidak ada command shell bebas
- Tidak ada operasi tulis dari Telegram (hanya baca)
- OMO command dibatasi oleh allowlist
- API key 9router tidak pernah dikirim ke Telegram

## Troubleshooting

**opencode binary tidak ditemukan**
Jalankan `/doctor`. Set `OPENCODE_COMMAND` ke path penuh jika perlu.

**opencode serve tidak terjangkau**
Bot otomatis fallback ke CLI. Jalankan `opencode serve` di terminal terpisah untuk fitur session.

**Bot restart — job hilang**
Job yang sedang berjalan saat restart ditandai `interrupted`. Cek dengan `/jobs`.

**Output terlalu panjang**
Output panjang otomatis dikirim sebagai file. Gunakan `/logs <id> download` untuk log lengkap.
