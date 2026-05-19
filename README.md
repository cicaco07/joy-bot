# Telegram bot untuk opencode lokal

Bot ini menerima prompt dari Telegram, lalu menjalankan `opencode run` di laptop pada folder project yang kamu izinkan.

## Prasyarat

- Node.js sudah terpasang.
- `opencode` sudah login dan bisa dijalankan dari terminal laptop.
- Bot Telegram sudah dibuat lewat `@BotFather`.
- Telegram user ID kamu sudah diketahui, misalnya lewat `@userinfobot`.

## Setup

1. Buat folder project yang boleh diakses bot:

   ```powershell
   New-Item -ItemType Directory -Path "projects"
   ```

2. Salin konfigurasi:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Edit `.env`:

   ```env
   TELEGRAM_BOT_TOKEN=token_dari_botfather
   ALLOWED_TELEGRAM_USER_IDS=id_telegram_kamu
   PROJECTS_ROOT=C:\Users\aryo deva\2021\project kecil\ml\tailscale\projects
   OPENCODE_COMMAND=opencode.cmd
   OPENCODE_TIMEOUT_MS=600000
   PROGRESS_INTERVAL_MS=30000
   ```

4. Masukkan folder project ke dalam `projects`, contoh:

   ```text
   projects\my-app
   projects\api-service
   ```

5. Jalankan bot:

   ```powershell
   npm run check-config
   npm start
   ```

   Di Windows, gunakan `OPENCODE_COMMAND=opencode.cmd`. Jika masih muncul error `spawn opencode ENOENT`, isi dengan path penuh hasil `where.exe opencode`, contoh:

   ```env
   OPENCODE_COMMAND=C:\Users\aryo deva\AppData\Roaming\npm\opencode.cmd
   ```

   Jika bot berhenti di pesan `Menjalankan opencode di "nama-folder"...`, tunggu pesan progress berikutnya. Bot akan mengirim update setiap `PROGRESS_INTERVAL_MS`. Default-nya 30 detik. Jika proses terlalu lama, gunakan `/status` atau `/cancel`.

## Command Telegram

- `/start` - bantuan singkat.
- `/folders` - daftar folder project yang boleh diakses.
- `/use <folder>` - memilih folder aktif.
- `/active` - melihat folder aktif.
- `/task <instruksi>` - menjalankan `opencode run` di folder aktif.
- `/doctor` - mengecek apakah command opencode bisa dijalankan dari bot.
- `/projects` - alias untuk `/folders`.
- `/prompt <project> <instruksi>` - menjalankan `opencode run` tanpa memilih folder aktif.
- `/status` - melihat job yang sedang berjalan.
- `/cancel` - menghentikan job aktif.

Contoh:

```text
/folders
/use my-app
/task Tambahkan validasi email di form register dan tampilkan diff perubahan.
```

Jika bot terlihat stuck, jalankan:

```text
/doctor
/status
/cancel
```

`/doctor` akan menjalankan `opencode --help` dari proses bot untuk memastikan command opencode benar-benar bisa dieksekusi oleh Node.js.

## Batasan keamanan

- Bot hanya menerima pesan dari `ALLOWED_TELEGRAM_USER_IDS`.
- Bot hanya bisa memilih folder langsung di bawah `PROJECTS_ROOT`.
- Bot tidak menyediakan command shell bebas.
- Jangan letakkan `.env`, SSH key, credential cloud, atau folder pribadi di dalam `PROJECTS_ROOT`.
- Review perubahan dari `git diff` sebelum commit atau push.
