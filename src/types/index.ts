export type ChatId = number & { readonly __brand: 'ChatId' };
export type JobId = string & { readonly __brand: 'JobId' };

export function makeChatId(n: number): ChatId {
  return n as ChatId;
}

export function makeJobId(): JobId {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` as JobId;
}

export interface WorkspaceRef {
  name: string;
  absolutePath: string;
  relativePath: string;
}

export type JobStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'failed'
  | 'timeout'
  | 'cancelled'
  | 'interrupted';

export type JobType = 'opencode.cli' | 'opencode.session' | 'omo';

export interface JobRecord {
  id: JobId;
  chatId: ChatId;
  type: JobType;
  workspace: string;
  cwd: string;
  command: string;
  args: string[];
  status: JobStatus;
  exitCode?: number;
  startedAt: string;
  endedAt?: string;
  logFile: string;
  promptPreview?: string;
  sessionId?: string;
}

export type Mode = 'plan' | 'build' | 'deep' | 'ultrawork';

export type Agent =
  | 'build'
  | 'plan'
  | 'deep'
  | 'ultrabrain'
  | 'oracle'
  | 'librarian'
  | 'metis'
  | 'momus'
  | string;

export interface ModelRef {
  providerID: string;
  modelID: string;
}

export interface SessionRecord {
  id: string;
  chatId: ChatId;
  title: string;
  opencodeSessionId?: string;
  agent?: Agent;
  model?: ModelRef;
  mode?: Mode;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'aborted' | 'archived' | 'pending-api';
}

export interface ChatSettings {
  chatId: ChatId;
  activeWorkspace?: string;
  cwd: string;
  activeSessionId?: string;
  defaultAgent: Agent;
  defaultMode: Mode;
  defaultModel?: ModelRef;
}
