/**
 * Database Manager
 * Loads pre-seeded SQLite database
 * Uses sql.js - pure JavaScript SQLite (no compilation needed)
 */
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { getLogger } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class DatabaseManager {
  constructor(dbPath = null) {
    this.dbPath = dbPath || path.join(__dirname, 'employees.db');
    this.db = null;
    this.SQL = null;
    this.initialized = false;
  }

  async init() {
    try {
      this.SQL = await initSqlJs();

      if (!fs.existsSync(this.dbPath)) {
        throw new Error(`Database file not found at ${this.dbPath}. Please run npm run seed-db first.`);
      }

      const buffer = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(buffer);
      this.initialized = true;

      getLogger().info('Database loaded successfully');
      return this;
    } catch (error) {
      getLogger().error('Failed to load database:', error);
      throw error;
    }
  }

  run(sql, params = []) {
    try {
      this.db.run(sql, params);
      const changes = this.db.getRowsModified();
      this._saveDatabase();
      return { changes };
    } catch (error) {
      getLogger().error('Database run error:', error);
      throw error;
    }
  }

  get(sql, params = []) {
    try {
      const stmt = this.db.prepare(sql);
      stmt.bind(params);
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return row;
      }
      stmt.free();
      return undefined;
    } catch (error) {
      getLogger().error('Database get error:', error);
      throw error;
    }
  }

  all(sql, params = []) {
    try {
      const stmt = this.db.prepare(sql);
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();
      return rows;
    } catch (error) {
      getLogger().error('Database all error:', error);
      throw error;
    }
  }

  _saveDatabase() {
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    } catch (error) {
      getLogger().error('Error saving database:', error);
    }
  }

  async close() {
    try {
      if (this.db) {
        this._saveDatabase();
        this.db.close();
        this.db = null;
        this.initialized = false;
        getLogger().info('Database connection closed');
      }
    } catch (error) {
      getLogger().error('Error closing database:', error);
      throw error;
    }
  }
}

let instance = null;

export async function initializeDatabase(dbPath = null) {
  if (!instance) {
    instance = new DatabaseManager(dbPath);
    await instance.init();
  }
  return instance;
}

export function getDatabase() {
  if (!instance || !instance.initialized) {
    throw new Error('Database not initialized. Call initializeDatabase() first');
  }
  return instance;
}

export { DatabaseManager };
