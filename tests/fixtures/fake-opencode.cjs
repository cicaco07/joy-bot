#!/usr/bin/env node
'use strict';
const args = process.argv.slice(2);
if (args[0] === '--help') {
  process.stdout.write('fake opencode help\n');
  process.exit(0);
}
if (args[0] === 'run') {
  process.stdout.write('stdout: ' + args.slice(1).join(' ') + '\n');
  process.stderr.write('stderr: done\n');
  process.exit(0);
}
process.exit(1);
