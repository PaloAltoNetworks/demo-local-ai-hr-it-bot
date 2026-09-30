/**
 * Rebuilds employees.db from employees.sql, the committed demo data, replacing any existing file.
 * Runs at image build and on `npm run seed-db` to get back to a clean base.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(dir, 'employees.db');

fs.rmSync(dbPath, { force: true });
const db = new DatabaseSync(dbPath);
db.exec(fs.readFileSync(path.join(dir, 'employees.sql'), 'utf8'));
db.close();
console.log(`Seeded ${dbPath}`);
