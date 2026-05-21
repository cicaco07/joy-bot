# Telegram Command Reference

Dokumen ini merangkum semua command yang dapat dieksekusi dari sisi Telegram.
Command hanya diproses untuk user ID yang ada di `ALLOWED_TELEGRAM_USER_IDS`.

## Ringkasan Cepat

| Command | Format | Fungsi |
|---|---|---|
| `/start` | `/start` | Menampilkan pesan pembuka dan command dasar. |
| `/help` | `/help` | Menampilkan bantuan command. |
| `/?` | `/?` | Alias untuk `/help`. |
| `/root` | `/root` | Menampilkan nilai `PROJECTS_ROOT`. |
| `/workspaces` | `/workspaces` | Menampilkan daftar workspace. |
| `/workspace` | `/workspace use <nama>` | Memilih workspace aktif. |
| `/pwd` | `/pwd` | Menampilkan workspace dan cwd aktif. |
| `/cd` | `/cd <path>` atau `/cd ~` | Mengubah cwd di dalam workspace aktif. |
| `/ls` | `/ls [path]` | Menampilkan isi direktori. |
| `/tree` | `/tree [path]` | Menampilkan struktur direktori. |
| `/open` | `/open <file>` | Menampilkan isi file teks. |
| `/cat` | `/cat <file>` | Alias untuk `/open`. |
| `/find` | `/find <keyword>` | Mencari file berdasarkan nama. |
| `/find` | `/find <keyword> --content` | Mencari teks di isi file. |
| `/download` | `/download <file>` | Mengirim file sebagai dokumen Telegram. |
| `/run` | `/run <prompt>` | Menjalankan `opencode run` via CLI. |
| `/task` | `/task <prompt>` | Alias untuk `/run`. |
| `/doctor` | `/doctor` | Mengecek apakah command opencode bisa dijalankan. |
| `/opencode_help` | `/opencode_help` | Menampilkan output bantuan opencode. |
| `/sessions` | `/sessions` | Menampilkan daftar session. |
| `/session_new` | `/session_new <judul>` | Membuat session baru. |
| `/session_use` | `/session_use <id>` | Memilih session aktif. |
| `/session_current` | `/session_current` | Menampilkan session aktif. |
| `/session_prompt` | `/session_prompt <pesan>` | Mengirim prompt ke session aktif. |
| `/session_command` | `/session_command <cmd> [args...]` | Mengirim command ke session aktif. |
| `/session_abort` | `/session_abort` | Menghentikan session aktif. |
| `/omo` | `/omo <command> [args...]` | Mengirim command OMO yang masuk allowlist. |
| `/status` | `/status` | Menampilkan job aktif yang sedang berjalan. |
| `/jobs` | `/jobs` | Menampilkan 10 job terbaru. |
| `/job` | `/job <id>` | Menampilkan detail job tertentu. |
| `/cancel` | `/cancel [id]` | Membatalkan job aktif atau job tertentu. |
| `/cancel_all` | `/cancel_all` | Membatalkan semua job aktif. |
| `/logs` | `/logs [latest]` | Menampilkan log job selesai terbaru. |
| `/logs` | `/logs <id>` | Menampilkan preview log job tertentu. |
| `/logs` | `/logs <id> errors` | Menampilkan log stderr job tertentu. |
| `/logs` | `/logs <id> download` | Mengunduh log lengkap job tertentu. |
| `/model` | `/model` | Menampilkan model default dan model session aktif. |
| `/model` | `/model list` | Menampilkan instruksi format pengaturan model. |
| `/model` | `/model use <providerID/modelID>` | Mengatur model default. |
| `/model` | `/model use <providerID/modelID> --session` | Mengatur model untuk session aktif. |
| `/agent` | `/agent` | Menampilkan agent default. |
| `/agent` | `/agent use <name>` | Mengatur agent default. |
| `/mode` | `/mode` | Menampilkan mode default. |
| `/mode` | `/mode <plan|build|deep|ultrawork>` | Mengatur mode default. |

## Workspace dan Navigasi

### `/root`

Menampilkan path root project yang dikonfigurasi lewat `PROJECTS_ROOT`.

### `/workspaces`

Menampilkan daftar workspace yang tersedia di `PROJECTS_ROOT`.
Workspace aktif ditandai pada output.

### `/workspace use <nama>`

Memilih workspace aktif untuk chat Telegram saat ini.

Aturan:

- `<nama>` harus ada di daftar workspace.
- Nama tidak boleh berisi `/` atau `\`.
- Setelah workspace diganti, cwd akan direset ke root workspace.

### `/pwd`

Menampilkan lokasi kerja aktif dalam format:

```text
<workspace>/<cwd>
```

Jika belum ada workspace aktif, bot akan meminta menjalankan `/workspace use <nama>`.

### `/cd <path>`

Mengubah cwd di dalam workspace aktif.

Contoh:

```text
/cd src
/cd ../tests
/cd ~
```

Catatan:

- `/cd ~` kembali ke root workspace.
- Path divalidasi agar tetap berada di dalam workspace aktif.

## File Browser

Semua command file membutuhkan workspace aktif.
Akses file dibatasi di dalam workspace aktif dan tidak menjalankan shell bebas.

### `/ls [path]`

Menampilkan isi direktori.
Jika `[path]` tidak diisi, bot memakai cwd aktif.

Contoh:

```text
/ls
/ls src
```

### `/tree [path]`

Menampilkan struktur direktori.
Jika output terlalu panjang, bot mengirimnya sebagai file teks.

### `/open <file>`

Menampilkan isi file teks.
Jika file terlalu besar, biner, tidak ditemukan, atau path adalah direktori, bot mengirim pesan status yang sesuai.

### `/cat <file>`

Alias untuk `/open <file>`.

### `/find <keyword>`

Mencari file berdasarkan nama dari cwd aktif.

### `/find <keyword> --content`

Mencari teks di isi file dari cwd aktif.

Contoh:

```text
/find createBot
/find Telegram --content
```

### `/download <file>`

Mengirim file sebagai dokumen Telegram.
File harus ada, bukan direktori, dan ukurannya tidak melebihi `FILE_READ_MAX_BYTES`.

## Opencode CLI

### `/run <prompt>`

Menjalankan `opencode run` di workspace aktif.

Alur:

1. Bot mengecek workspace aktif.
2. Bot menolak eksekusi jika masih ada job aktif di chat yang sama.
3. Bot membuat job, menjalankan opencode, dan menyimpan log.
4. Bot mengirim ringkasan job dan 60 baris terakhir log.

Contoh:

```text
/run jelaskan struktur project ini
```

### `/task <prompt>`

Alias untuk `/run <prompt>`.

### `/doctor`

Mengecek apakah command opencode yang dikonfigurasi di `OPENCODE_COMMAND` dapat dijalankan.
Output mencakup command, exit code, cwd, error jika ada, dan preview output.

### `/opencode_help`

Menampilkan output bantuan opencode.
Jika output terlalu panjang, bot mengirimnya sebagai file teks.

## Sessions

Fitur session memakai `OPENCODE_SERVER_URL` dan membutuhkan `opencode serve` yang dapat dijangkau.
Jika server tidak tersedia saat membuat session, session lokal tetap dibuat dengan status pending API dan beberapa command API tidak dapat dipakai sampai server tersedia.

### `/sessions`

Menampilkan daftar session untuk chat saat ini.
Session aktif ditandai pada output.

### `/session_new <judul>`

Membuat session baru dan menjadikannya session aktif.
Bot juga mencoba membuat session opencode melalui API.

Contoh:

```text
/session_new refactor auth middleware
```

### `/session_use <id>`

Memilih session aktif berdasarkan ID.
Session harus milik chat Telegram yang sama.

### `/session_current`

Menampilkan detail session aktif.

### `/session_prompt <pesan>`

Mengirim prompt ke session aktif melalui API opencode.
Jika session belum terhubung ke opencode server, bot akan mencoba membuat link terlebih dahulu.

### `/session_command <cmd> [args...]`

Mengirim command ke session aktif melalui API opencode.
Command dan argumen diteruskan ke endpoint command session.

### `/session_abort`

Menghentikan session aktif.
Jika session terhubung ke opencode server, bot mencoba abort session API terlebih dahulu, lalu menandai session lokal sebagai aborted dan mengosongkan session aktif.

## OMO

### `/omo <command> [args...]`

Mengirim command OMO ke session aktif melalui API opencode.
Command harus ada di allowlist `OMO_ALLOWED_COMMANDS`.

Default allowlist:

```text
review-work,handoff,hyperplan,ulw-loop,stop-continuation
```

Syarat:

- Harus ada session aktif.
- Session aktif harus sudah memiliki `opencodeSessionId`.
- `<command>` harus masuk allowlist.

Contoh:

```text
/omo review-work
/omo handoff ringkas progres terakhir
```

## Jobs dan Logs

### `/status`

Menampilkan job aktif yang sedang berjalan untuk chat saat ini.
Jika tidak ada job aktif, bot mengirim `Tidak ada job berjalan.`

### `/jobs`

Menampilkan 10 job terbaru untuk chat saat ini.

### `/job <id>`

Menampilkan detail job tertentu beserta 60 baris terakhir log.
Job harus milik chat Telegram yang sama.

### `/cancel [id]`

Membatalkan job.

- Tanpa `[id]`: membatalkan job aktif di chat saat ini.
- Dengan `[id]`: membatalkan job tertentu jika job tersebut milik chat saat ini.

### `/cancel_all`

Membatalkan semua job dengan status `running` atau `pending` untuk chat saat ini.

### `/logs` atau `/logs latest`

Menampilkan log dari job selesai terbaru.
Status job yang dianggap selesai: `done`, `failed`, `timeout`, `cancelled`, atau `interrupted`.

### `/logs <id>`

Menampilkan 60 baris terakhir log job tertentu.

### `/logs <id> errors`

Menampilkan log stderr untuk job tertentu.

### `/logs <id> download`

Mengirim file log lengkap untuk job tertentu sebagai dokumen Telegram.

## Settings

### `/model`

Menampilkan model default.
Jika ada session aktif dan session tersebut memiliki model khusus, bot juga menampilkannya.

### `/model list`

Menampilkan instruksi singkat untuk mengatur model.
Command ini tidak mengambil daftar model dari provider.

### `/model use <providerID/modelID>`

Mengatur model default untuk chat saat ini.

Contoh:

```text
/model use openai/gpt-5.1
```

### `/model use <providerID/modelID> --session`

Mengatur model hanya untuk session aktif.
Jika tidak ada session aktif, bot akan meminta membuat session terlebih dahulu.

### `/agent`

Menampilkan agent default untuk chat saat ini.

### `/agent use <name>`

Mengatur agent default.

Contoh:

```text
/agent use build
```

### `/mode`

Menampilkan mode default untuk chat saat ini.

### `/mode <plan|build|deep|ultrawork>`

Mengatur mode default.
Nilai lain akan ditolak.

## Bantuan

### `/start`

Menampilkan pesan pembuka, command dasar, dan arahan untuk membuka `/help`.

### `/help`

Menampilkan bantuan command di Telegram.

### `/?`

Alias untuk `/help`.

## Pesan Teks Biasa

Jika bot menerima pesan teks yang tidak diawali `/`, bot akan membalas:

```text
Ketik /help untuk daftar perintah.
```
