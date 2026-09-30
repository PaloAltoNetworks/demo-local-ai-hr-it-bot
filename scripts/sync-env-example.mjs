#!/usr/bin/env node
/**
 * Rewrites .env.example so it has exactly the variables of .env, in .env's order and with its
 * comments. Values never come from .env unless the variable is plain configuration (URLs, provider
 * slugs, model ids, ports, log level): variables already in .env.example keep their example value,
 * new ones get a `<set-me>` placeholder, and so do commented-out assignments. Prints variable
 * names only, never values.
 *
 * Usage: node scripts/sync-env-example.mjs   (then review `git diff .env.example` before committing)
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const envPath = path.join(root, '.env');
const examplePath = path.join(root, '.env.example');

/** Plain configuration whose .env value is safe to publish as the example value. */
const COPYABLE = /(_URL|_BASE|_PROVIDER|_FAST|_POWERFUL|_MODEL|_PORT|^LOG_LEVEL|^DEFAULT_LANGUAGE)$/;
const LINE = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

const parse = (text) => text.split('\n').map((line) => {
  const m = line.match(LINE);
  return m ? { key: m[1], value: m[2] } : { raw: line };
});

const env = parse(fs.readFileSync(envPath, 'utf8'));
const example = parse(fs.existsSync(examplePath) ? fs.readFileSync(examplePath, 'utf8') : '');
const exampleValues = new Map(example.filter((l) => l.key).map((l) => [l.key, l.value]));

/** Commented-out assignments (`# KEY=value`) may hold old secrets: their values are masked too. */
const COMMENTED = /^(\s*#\s*)([A-Za-z_][A-Za-z0-9_]*)\s*=.*$/;

const added = [];
const out = env.map((l) => {
  if (!l.key) {
    const m = l.raw.match(COMMENTED);
    return m && !COPYABLE.test(m[2]) ? `${m[1]}${m[2]}=<set-me>` : l.raw;
  }
  if (exampleValues.has(l.key)) return `${l.key}=${exampleValues.get(l.key)}`;
  added.push(l.key);
  return `${l.key}=${COPYABLE.test(l.key) ? l.value : '<set-me>'}`;
});

const envKeys = new Set(env.filter((l) => l.key).map((l) => l.key));
const removed = [...exampleValues.keys()].filter((k) => !envKeys.has(k));

fs.writeFileSync(examplePath, out.join('\n').replace(/\n*$/, '\n'));
console.log(`added:   ${added.join(', ') || 'none'}`);
console.log(`removed: ${removed.join(', ') || 'none'}`);
console.log('Review with: git diff .env.example');
