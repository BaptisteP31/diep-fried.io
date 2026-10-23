#!/usr/bin/env node
// Lance le serveur de jeu (tsx watch) et le client (Vite) ensemble ; Ctrl+C arrête les deux.
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const tasks = [
  { name: 'server', workspace: '@diep-fried/server' },
  { name: 'client', workspace: '@diep-fried/client' },
];

const children = tasks.map(({ name, workspace }) => {
  const child = spawn(npm, ['run', 'dev', '-w', workspace], { stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      for (const line of chunk.toString().split('\n')) {
        if (line.trim()) process.stdout.write(`[${name}] ${line}\n`);
      }
    });
  }
  child.on('exit', (code) => {
    process.stdout.write(`[${name}] arrêté (code ${code ?? 'signal'})\n`);
    shutdown(code ?? 1);
  });
  return child;
});

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
