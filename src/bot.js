require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Bot } = require('grammy');

const token = process.env.TELEGRAM_BOT_TOKEN;
const allowedUserIds = parseCsv(process.env.ALLOWED_TELEGRAM_USER_IDS).map(Number);
const projectsRoot = path.resolve(process.env.PROJECTS_ROOT || path.join(process.cwd(), 'projects'));
const opencodeCommand = process.env.OPENCODE_COMMAND || defaultOpencodeCommand();
const maxOutputLength = Number(process.env.MAX_OUTPUT_LENGTH || 3500);
const commandTimeoutMs = Number(process.env.OPENCODE_TIMEOUT_MS || 10 * 60 * 1000);
const progressIntervalMs = Number(process.env.PROGRESS_INTERVAL_MS || 30 * 1000);
const doctorTimeoutMs = Number(process.env.DOCTOR_TIMEOUT_MS || 15 * 1000);
const checkConfigOnly = process.argv.includes('--check-config');

if (!token) {
  console.error('Missing TELEGRAM_BOT_TOKEN in environment or .env');
  process.exit(1);
}

if (allowedUserIds.length === 0 || allowedUserIds.some(Number.isNaN)) {
  console.error('Missing or invalid ALLOWED_TELEGRAM_USER_IDS in environment or .env');
  process.exit(1);
}

if (!fs.existsSync(projectsRoot)) {
  console.error(`PROJECTS_ROOT does not exist: ${projectsRoot}`);
  process.exit(1);
}

if (checkConfigOnly) {
  console.log('Configuration OK');
  console.log(`Allowed Telegram users: ${allowedUserIds.join(', ')}`);
  console.log(`PROJECTS_ROOT: ${projectsRoot}`);
  console.log(`Projects found: ${listProjects().join(', ') || '(none)'}`);
  console.log(`OPENCODE_COMMAND: ${opencodeCommand}`);
  process.exit(0);
}

const bot = new Bot(token);
const runningJobs = new Map();
const activeProjects = new Map();

bot.command('start', async (ctx) => {
  if (!isAllowed(ctx)) return deny(ctx);

  await sendMessage(ctx.chat.id, [
    'Bot opencode lokal aktif.',
    '',
    'Command utama:',
    '/folders - daftar folder project yang boleh diakses',
    '/use <folder> - pilih folder aktif',
    '/active - lihat folder aktif',
    '/task <instruksi> - jalankan opencode run di folder aktif',
    '/doctor - cek command opencode dari bot',
    '/status - cek job aktif',
    '/cancel - hentikan job aktif',
    '',
    'Command kompatibilitas:',
    '/projects - alias untuk /folders',
    '/prompt <project> <instruksi> - jalankan opencode run tanpa memilih folder aktif',
    '',
    'Contoh:',
    '/folders',
    '/use tailscale',
    '/task cek struktur project ini',
    '',
    `Root project: ${projectsRoot}`,
  ].join('\n'));
});

bot.command('folders', async (ctx) => {
  if (!isAllowed(ctx)) return deny(ctx);

  await sendProjectList(ctx.chat.id);
});

bot.command('projects', async (ctx) => {
  if (!isAllowed(ctx)) return deny(ctx);

  await sendProjectList(ctx.chat.id);
});

bot.command('use', async (ctx) => {
  if (!isAllowed(ctx)) return deny(ctx);

  const chatId = ctx.chat.id;
  const project = ctx.match.trim();

  if (!project) {
    await sendMessage(chatId, 'Format: /use <folder>\nContoh: /use tailscale');
    return;
  }

  const projectPath = resolveProjectPath(project);
  if (!projectPath) {
    await sendMessage(chatId, `Folder tidak valid atau tidak ditemukan: ${project}\nPakai /folders untuk melihat daftar.`);
    return;
  }

  activeProjects.set(chatId, project);
  await sendMessage(chatId, `Folder aktif: ${project}\nPath: ${projectPath}\n\nSekarang kamu bisa kirim: /task <instruksi>`);
});

bot.command('active', async (ctx) => {
  if (!isAllowed(ctx)) return deny(ctx);

  const project = activeProjects.get(ctx.chat.id);
  if (!project) {
    await sendMessage(ctx.chat.id, 'Belum ada folder aktif. Pilih dengan /use <folder>.');
    return;
  }

  const projectPath = resolveProjectPath(project);
  if (!projectPath) {
    activeProjects.delete(ctx.chat.id);
    await sendMessage(ctx.chat.id, `Folder aktif "${project}" sudah tidak valid. Pilih ulang dengan /use <folder>.`);
    return;
  }

  await sendMessage(ctx.chat.id, `Folder aktif: ${project}\nPath: ${projectPath}`);
});

bot.command('task', async (ctx) => {
  if (!isAllowed(ctx)) return deny(ctx);

  const chatId = ctx.chat.id;
  if (runningJobs.has(chatId)) {
    await sendMessage(chatId, 'Masih ada job berjalan. Pakai /status atau /cancel dulu.');
    return;
  }

  const project = activeProjects.get(chatId);
  if (!project) {
    await sendMessage(chatId, 'Pilih folder dulu dengan /use <folder>. Pakai /folders untuk melihat daftar folder.');
    return;
  }

  const prompt = ctx.match.trim();
  if (!prompt) {
    await sendMessage(chatId, 'Instruksi kosong. Format: /task <instruksi>');
    return;
  }

  const projectPath = resolveProjectPath(project);
  if (!projectPath) {
    activeProjects.delete(chatId);
    await sendMessage(chatId, `Folder aktif "${project}" sudah tidak valid. Pilih ulang dengan /use <folder>.`);
    return;
  }

  await sendMessage(chatId, `Menjalankan opencode di "${project}"...`);

  const result = await runOpencode(chatId, project, projectPath, prompt);
  await sendMessage(chatId, result);
});

bot.command('status', async (ctx) => {
  if (!isAllowed(ctx)) return deny(ctx);

  const job = runningJobs.get(ctx.chat.id);
  if (!job) {
    await sendMessage(ctx.chat.id, 'Tidak ada job yang sedang berjalan.');
    return;
  }

  await sendMessage(ctx.chat.id, `Job sedang berjalan di folder "${job.project}" selama ${formatDuration(Date.now() - job.startedAt)}.`);
});

bot.command('doctor', async (ctx) => {
  if (!isAllowed(ctx)) return deny(ctx);

  const project = activeProjects.get(ctx.chat.id) || listProjects()[0];
  const projectPath = project ? resolveProjectPath(project) : projectsRoot;
  const { command, args } = parseProcessCommand(opencodeCommand);
  const result = await runProcess(command, [...args, '--help'], projectPath || projectsRoot, doctorTimeoutMs);

  await sendMessage(ctx.chat.id, [
    'Doctor opencode:',
    `OPENCODE_COMMAND: ${opencodeCommand}`,
    `Resolved command: ${command}`,
    `Base args: ${args.join(' ') || '(none)'}`,
    `Working directory: ${projectPath || projectsRoot}`,
    `Exit code: ${result.code}`,
    `Signal: ${result.signal || '(none)'}`,
    `Error: ${result.error || '(none)'}`,
    '',
    truncate(result.output || '(tidak ada output)', maxOutputLength),
  ].join('\n'));
});

bot.command('cancel', async (ctx) => {
  if (!isAllowed(ctx)) return deny(ctx);

  const job = runningJobs.get(ctx.chat.id);
  if (!job) {
    await sendMessage(ctx.chat.id, 'Tidak ada job yang sedang berjalan.');
    return;
  }

  stopChild(job.child);
  runningJobs.delete(ctx.chat.id);
  await sendMessage(ctx.chat.id, 'Job dihentikan.');
});

bot.command('prompt', async (ctx) => {
  if (!isAllowed(ctx)) return deny(ctx);

  const chatId = ctx.chat.id;
  if (runningJobs.has(chatId)) {
    await sendMessage(chatId, 'Masih ada job berjalan. Pakai /status atau /cancel dulu.');
    return;
  }

  const args = ctx.match.trim();
  const separatorIndex = args.search(/\s/);
  if (separatorIndex === -1) {
    await sendMessage(chatId, 'Format: /prompt <project> <instruksi>');
    return;
  }

  const project = args.slice(0, separatorIndex);
  const prompt = args.slice(separatorIndex).trim();
  const projectPath = resolveProjectPath(project);

  if (!projectPath) {
    await sendMessage(chatId, `Project tidak valid atau tidak ditemukan: ${project}\nPakai /folders untuk melihat daftar.`);
    return;
  }

  if (!prompt) {
    await sendMessage(chatId, 'Instruksi kosong. Format: /prompt <project> <instruksi>');
    return;
  }

  await sendMessage(chatId, `Menjalankan opencode di "${project}"...`);

  const result = await runOpencode(chatId, project, projectPath, prompt);
  await sendMessage(chatId, result);
});

bot.on('message:text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return;
  if (!isAllowed(ctx)) return deny(ctx);

  await sendMessage(ctx.chat.id, 'Gunakan /use <folder> lalu /task <instruksi>. Ketik /start untuk bantuan.');
});

bot.catch((error) => {
  console.error('Telegram bot error:', error.error);
});

bot.start();
console.log(`Telegram opencode bot is running. PROJECTS_ROOT=${projectsRoot}`);

function parseCsv(value) {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isAllowed(ctx) {
  return Boolean(ctx.from) && allowedUserIds.includes(ctx.from.id);
}

async function deny(ctx) {
  await sendMessage(ctx.chat.id, 'Akses ditolak. Telegram user ID kamu tidak diizinkan.');
}

async function sendProjectList(chatId) {
  const projects = listProjects();
  if (projects.length === 0) {
    await sendMessage(chatId, [
      'Belum ada folder project di PROJECTS_ROOT.',
      '',
      `Root saat ini: ${projectsRoot}`,
      '',
      'Tambahkan folder project ke root ini, atau ubah PROJECTS_ROOT di file .env.',
    ].join('\n'));
    return;
  }

  await sendMessage(chatId, [
    'Folder tersedia:',
    projects.map((name) => `- ${name}`).join('\n'),
    '',
    'Pilih folder dengan:',
    '/use <folder>',
    '',
    'Contoh:',
    `/use ${projects[0]}`,
  ].join('\n'));
}

function listProjects() {
  return fs.readdirSync(projectsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();
}

function resolveProjectPath(project) {
  if (!project || project.includes('/') || project.includes('\\') || project === '..') return null;

  const projectPath = path.resolve(projectsRoot, project);
  const relative = path.relative(projectsRoot, projectPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) return null;

  return projectPath;
}

function runOpencode(chatId, project, projectPath, prompt) {
  return new Promise((resolve) => {
    const { command, args } = parseProcessCommand(opencodeCommand);
    const child = spawn(command, [...args, 'run', prompt], {
      cwd: projectPath,
      shell: process.platform === 'win32',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CI: '1',
        NO_COLOR: '1',
        TERM: 'dumb',
      },
    });

    const chunks = [];
    const startedAt = Date.now();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      stopChild(child);
    }, commandTimeoutMs);
    const progress = setInterval(() => {
      const elapsed = formatDuration(Date.now() - startedAt);
      const output = chunks.join('').trim();
      const preview = output ? `\n\nOutput sementara:\n${truncate(output, 1000)}` : '';
      sendMessage(chatId, `Opencode masih berjalan di "${project}" selama ${elapsed}.${preview}\n\nPakai /status untuk cek atau /cancel untuk menghentikan.`)
        .catch((error) => console.error('Failed to send progress message:', error));
    }, progressIntervalMs);

    runningJobs.set(chatId, { child, project, startedAt });

    child.stdout.on('data', (data) => chunks.push(data.toString()));
    child.stderr.on('data', (data) => chunks.push(data.toString()));

    child.on('error', (error) => {
      clearTimeout(timeout);
      clearInterval(progress);
      runningJobs.delete(chatId);
      resolve(`Gagal menjalankan opencode: ${error.message}`);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      clearInterval(progress);
      runningJobs.delete(chatId);

      const output = chunks.join('').trim();
      const status = timedOut
        ? `dihentikan karena timeout ${formatDuration(commandTimeoutMs)}`
        : signal ? `dihentikan oleh signal ${signal}` : `selesai dengan exit code ${code}`;
      const body = output || '(tidak ada output dari opencode)';

      resolve(`opencode ${status}.\n\n${truncate(body, maxOutputLength)}`);
    });
  });
}

async function sendMessage(chatId, text) {
  const chunks = splitTelegramMessage(text);
  for (const chunk of chunks) {
    await bot.api.sendMessage(chatId, chunk);
  }
}

function splitTelegramMessage(text) {
  const limit = 3900;
  const chunks = [];
  for (let index = 0; index < text.length; index += limit) {
    chunks.push(text.slice(index, index + limit));
  }
  return chunks.length ? chunks : [''];
}

function truncate(text, maxLength) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n\n...[output dipotong, total ${text.length} karakter]`;
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
}

function stopChild(child) {
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      shell: false,
    });
    return;
  }

  child.kill('SIGTERM');
}

function runProcess(command, args, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      shell: process.platform === 'win32',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CI: '1',
        NO_COLOR: '1',
        TERM: 'dumb',
      },
    });

    const chunks = [];
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      stopChild(child);
    }, timeoutMs);

    child.stdout.on('data', (data) => chunks.push(data.toString()));
    child.stderr.on('data', (data) => chunks.push(data.toString()));

    child.on('error', (error) => {
      clearTimeout(timeout);
      resolve({ code: null, signal: null, error: error.message, output: chunks.join('').trim() });
    });

    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      resolve({
        code,
        signal,
        error: timedOut ? `timeout setelah ${formatDuration(timeoutMs)}` : '',
        output: chunks.join('').trim(),
      });
    });
  });
}

function defaultOpencodeCommand() {
  return process.platform === 'win32' ? 'opencode.cmd' : 'opencode';
}

function parseProcessCommand(commandText) {
  if (fs.existsSync(commandText)) {
    return { command: commandText, args: [] };
  }

  const parts = commandText.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  const cleaned = parts.map((part) => part.replace(/^"|"$/g, ''));

  return {
    command: cleaned[0] || defaultOpencodeCommand(),
    args: cleaned.slice(1),
  };
}
