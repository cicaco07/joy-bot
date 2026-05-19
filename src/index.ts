import { checkConfig } from './config/env.js';

if (process.argv.includes('--check-config')) {
  try {
    checkConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}

export {};
