import fs from 'fs';
import path from 'path';
import { htmlEscape, htmlCode, htmlPre } from '../utils/htmlEscape.js';
import { shouldSendAsDocument } from '../utils/telegramText.js';
import type { JobRecord, SessionRecord, ChatSettings } from '../types/index.js';

export type FormatterResult =
  | { kind: 'text'; text: string; parseMode: 'HTML' }
  | { kind: 'document'; filePath: string; caption?: string; parseMode: 'HTML' };

const DEFAULT_MAX_CHARS = 3500;

function textResult(text: string): FormatterResult {
  return { kind: 'text', text, parseMode: 'HTML' };
}

function writeTmpDoc(content: string, storageDir: string, caption?: string): FormatterResult {
  const tmpDir = path.join(storageDir, 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const rand = Math.random().toString(36).slice(2, 10);
  const filePath = path.join(tmpDir, `${rand}.txt`);
  fs.writeFileSync(filePath, content, 'utf8');
  const result: { kind: 'document'; filePath: string; caption?: string; parseMode: 'HTML' } = {
    kind: 'document',
    filePath,
    parseMode: 'HTML',
  };
  if (caption !== undefined) {
    result.caption = caption;
  }
  return result;
}

function statusBadge(status: JobRecord['status']): string {
  switch (status) {
    case 'done': return '✅';
    case 'failed': return '❌';
    case 'timeout': return '⏱';
    case 'cancelled': return '🚫';
    case 'interrupted': return '⚠️';
    case 'running': return '🔄';
    default: return '⏳';
  }
}

function duration(startedAt: string, endedAt?: string): string {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m${s}s`;
}

export function formatStart(): FormatterResult {
  const text = [
    '<b>Joy Bot</b> — opencode via Telegram',
    '',
    'Perintah dasar:',
    `${htmlCode('/workspaces')} — daftar workspace`,
    `${htmlCode('/workspace use <name>')} — pilih workspace aktif`,
    `${htmlCode('/cd <path>')} — ganti direktori kerja`,
    `${htmlCode('/ls [path]')} — list isi direktori`,
    `${htmlCode('/run <prompt>')} — jalankan opencode`,
    '',
    'Ketik /help untuk daftar lengkap perintah.',
  ].join('\n');
  return textResult(text);
}

export function formatHelp(): FormatterResult {
  const text = [
    '<b>📁 Workspace &amp; Files</b>',
    `${htmlCode('/workspaces')} — daftar workspace`,
    `${htmlCode('/workspace use <name>')} — pilih workspace`,
    `${htmlCode('/cd <path>')} — ganti cwd`,
    `${htmlCode('/ls [path]')} — list direktori`,
    `${htmlCode('/cat <file>')} — tampilkan isi file`,
    `${htmlCode('/tree [path]')} — tampilkan struktur direktori`,
    `${htmlCode('/download <file>')} — unduh file`,
    '',
    '<b>🤖 Opencode</b>',
    `${htmlCode('/run <prompt>')} — jalankan opencode`,
    `${htmlCode('/stop [jobId]')} — hentikan job`,
    `${htmlCode('/status [jobId]')} — status job`,
    '',
    '<b>💬 Sessions</b>',
    `${htmlCode('/sessions')} — daftar sesi`,
    `${htmlCode('/session new')} — buat sesi baru`,
    `${htmlCode('/session use <id>')} — pilih sesi`,
    `${htmlCode('/session delete <id>')} — hapus sesi`,
    '',
    '<b>📋 Jobs &amp; Logs</b>',
    `${htmlCode('/jobs')} — daftar job`,
    `${htmlCode('/log [jobId]')} — lihat log job`,
    `${htmlCode('/log <jobId> <filter>')} — filter log`,
    '',
    '<b>⚙️ Settings</b>',
    `${htmlCode('/settings')} — lihat pengaturan`,
    `${htmlCode('/set agent <name>')} — set agent`,
    `${htmlCode('/set mode <mode>')} — set mode`,
    `${htmlCode('/set model <model>')} — set model`,
    '',
    '<b>🔧 OMO</b>',
    `${htmlCode('/omo <prompt>')} — jalankan OMO`,
    `${htmlCode('/plan')} — lihat rencana aktif`,
    `${htmlCode('/help')} — tampilkan bantuan ini`,
  ].join('\n');
  return textResult(text);
}

export function formatWorkspaces(names: string[], activeWorkspace?: string): FormatterResult {
  if (names.length === 0) {
    return textResult('Belum ada workspace terdaftar.');
  }
  const lines = names.map((n) => {
    const escaped = htmlEscape(n);
    const active = n === activeWorkspace;
    return active ? `▶ <b>${escaped}</b>` : `• ${escaped}`;
  });
  return textResult('<b>Workspaces:</b>\n' + lines.join('\n'));
}

export type LsEntry = { name: string; kind: 'dir' | 'file' | 'other'; size?: number; mtime: string };

export function formatLs(entries: LsEntry[]): FormatterResult {
  if (entries.length === 0) {
    return textResult('Direktori kosong.');
  }
  const dirs = entries.filter((e) => e.kind === 'dir').sort((a, b) => a.name.localeCompare(b.name));
  const files = entries.filter((e) => e.kind !== 'dir').sort((a, b) => a.name.localeCompare(b.name));
  const lines = [
    ...dirs.map((e) => `[d] ${htmlEscape(e.name)}/`),
    ...files.map((e) => {
      const size = e.size !== undefined ? `  ${e.size}B` : '';
      return `[f] ${htmlEscape(e.name)}${size}`;
    }),
  ];
  return textResult(`<pre>${lines.join('\n')}</pre>`);
}

export function formatTree(
  lines: string[],
  truncated: boolean,
  storageDir: string,
  maxChars = DEFAULT_MAX_CHARS,
): FormatterResult {
  const body = lines.map((l) => htmlEscape(l)).join('\n');
  const suffix = truncated ? '\n... (terpotong)' : '';
  const full = `<pre>${body}${suffix}</pre>`;
  if (shouldSendAsDocument(full, maxChars)) {
    const plain = lines.join('\n') + (truncated ? '\n... (terpotong)' : '');
    return writeTmpDoc(plain, storageDir, 'tree output');
  }
  return textResult(full);
}

export function formatFile(
  content: string,
  filename: string,
  kind: 'text' | 'binary' | 'too_large' | 'missing' | 'is_dir',
  bytes?: number,
  storageDir?: string,
  maxChars = DEFAULT_MAX_CHARS,
): FormatterResult {
  switch (kind) {
    case 'binary':
      return textResult(`${htmlCode(filename)}: (file biner, gunakan /download)`);
    case 'too_large':
      return textResult(`${htmlCode(filename)}: File terlalu besar (${bytes ?? 0} bytes)`);
    case 'missing':
      return textResult('File tidak ditemukan');
    case 'is_dir':
      return textResult('Path adalah direktori, bukan file');
    case 'text': {
      const preview = `<b>${htmlEscape(filename)}</b>\n${htmlPre(content)}`;
      if (shouldSendAsDocument(preview, maxChars)) {
        if (storageDir) {
          return writeTmpDoc(content, storageDir, htmlEscape(filename));
        }
        // No storageDir — truncate with warning
        const truncated = content.slice(0, maxChars - 100);
        return textResult(`<b>${htmlEscape(filename)}</b>\n${htmlPre(truncated)}\n... (terpotong)`);
      }
      return textResult(preview);
    }
  }
}

export function formatJobSummary(job: JobRecord, logPreview: string): FormatterResult {
  const badge = statusBadge(job.status);
  const dur = duration(job.startedAt, job.endedAt);
  const lastLines = logPreview.split('\n').slice(-60).join('\n');

  const header = [
    `${badge} <b>Job</b> ${htmlCode(job.id)}`,
    `Workspace: ${htmlEscape(job.workspace)}`,
    `CWD: ${htmlEscape(job.cwd)}`,
    `Durasi: ${htmlEscape(dur)}`,
    '',
    '<b>Log (60 baris terakhir):</b>',
  ].join('\n');

  const logBlock = htmlPre(lastLines);
  const full = `${header}\n${logBlock}`;

  if (shouldSendAsDocument(full, DEFAULT_MAX_CHARS)) {
    const plain = [
      `${badge} Job ${job.id}`,
      `Workspace: ${job.workspace}`,
      `CWD: ${job.cwd}`,
      `Durasi: ${dur}`,
      '',
      'Log (60 baris terakhir):',
      lastLines,
    ].join('\n');
    // Use job.logFile directory's parent as storageDir fallback
    const storageDir = path.dirname(path.dirname(job.logFile));
    return writeTmpDoc(plain, storageDir, `Job ${job.id} — ${badge}`);
  }

  return textResult(full);
}

export function formatJobList(jobs: JobRecord[]): FormatterResult {
  if (jobs.length === 0) {
    return textResult('Belum ada job.');
  }
  const lines = jobs.map((j, i) => {
    const badge = statusBadge(j.status);
    const shortId = j.id.slice(0, 16);
    const dur = duration(j.startedAt, j.endedAt);
    return `${i + 1}. ${badge} ${htmlCode(shortId)} — ${htmlEscape(j.workspace)} (${htmlEscape(dur)})`;
  });
  return textResult('<b>Jobs:</b>\n' + lines.join('\n'));
}

export function formatLogPreview(jobId: string, log: string, storageDir: string, filter?: string): FormatterResult {
  let content = log;
  if (filter) {
    const lines = log.split('\n').filter((l) => l.includes(filter));
    content = lines.join('\n');
  }
  const body = `<b>Log:</b> ${htmlCode(jobId)}\n${htmlPre(content)}`;
  if (shouldSendAsDocument(body, DEFAULT_MAX_CHARS)) {
    return writeTmpDoc(content, storageDir, `Log: ${jobId}`);
  }
  return textResult(body);
}

export function formatSessions(sessions: SessionRecord[], activeId?: string): FormatterResult {
  if (sessions.length === 0) {
    return textResult('Belum ada sesi.');
  }
  const lines = sessions.map((s, i) => {
    const active = s.id === activeId;
    const title = htmlEscape(s.title);
    const id = htmlCode(s.id.slice(0, 12));
    return active ? `▶ ${i + 1}. <b>${title}</b> ${id}` : `${i + 1}. ${title} ${id}`;
  });
  return textResult('<b>Sessions:</b>\n' + lines.join('\n'));
}

export function formatSettings(settings: ChatSettings): FormatterResult {
  const lines = [
    '<b>⚙️ Settings</b>',
    `Workspace: ${htmlEscape(settings.activeWorkspace ?? '(belum dipilih)')}`,
    `CWD: ${htmlEscape(settings.cwd)}`,
    `Agent: ${htmlEscape(settings.defaultAgent)}`,
    `Mode: ${htmlEscape(settings.defaultMode)}`,
    `Model: ${settings.defaultModel ? htmlEscape(`${settings.defaultModel.providerID}/${settings.defaultModel.modelID}`) : '(default)'}`,
    `Session aktif: ${htmlEscape(settings.activeSessionId ?? '(tidak ada)')}`,
  ];
  return textResult(lines.join('\n'));
}

export function formatError(error: unknown): FormatterResult {
  let msg = 'Terjadi kesalahan.';
  if (error instanceof Error) {
    msg = `Terjadi kesalahan: ${htmlEscape(error.message)}`;
  } else if (typeof error === 'string') {
    msg = `Terjadi kesalahan: ${htmlEscape(error)}`;
  }
  return textResult(msg);
}
