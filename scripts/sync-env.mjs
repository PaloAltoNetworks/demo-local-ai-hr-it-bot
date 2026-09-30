#!/usr/bin/env node
/**
 * Rebuilds .env from .env.example, the template that dictates which variables exist, their order
 * and their comments. Each variable keeps its current .env value; variables new to the template
 * take the example value. Variables only in .env are kept, not lost, in a trailing section to
 * review, or dropped with --prune. Writes .env.bak first and prints variable names only, never
 * values.
 *
 * Usage: node scripts/sync-env.mjs [--prune]
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const envPath = path.join(root, '.env');
const examplePath = path.join(root, '.env.example');
const LINE = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

const parse = (text) => text.split('\n').map((line) => {
  const m = line.match(LINE);
  return m ? { key: m[1], value: m[2] } : { raw: line };
});

const example = parse(fs.readFileSync(examplePath, 'utf8'));
const envText = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const envValues = new Map(parse(envText).filter((l) => l.key).map((l) => [l.key, l.value]));

const fromExample = [];
const out = example.map((l) => {
  if (!l.key) return l.raw;
  if (envValues.has(l.key)) return `${l.key}=${envValues.get(l.key)}`;
  fromExample.push(l.key);
  return `${l.key}=${l.value}`;
});

const exampleKeys = new Set(example.filter((l) => l.key).map((l) => l.key));
const extra = [...envValues.keys()].filter((k) => !exampleKeys.has(k));
const prune = process.argv.includes('--prune');
if (extra.length && !prune) {
  while (out.at(-1) === '') out.pop();
  out.push('','# Not in .env.example: add them to the template or delete them', ...extra.map((k) => `${k}=${envValues.get(k)}`));
}

if (envText) fs.copyFileSync(envPath, `${envPath}.bak`);
fs.writeFileSync(envPath, out.join('\n').replace(/\n*$/, '\n'));
console.log(`taken from .env.example (check the value): ${fromExample.join(', ') || 'none'}`);
console.log(`only in .env (${prune ? 'dropped' : 'kept at the end'}): ${extra.join(', ') || 'none'}`);
