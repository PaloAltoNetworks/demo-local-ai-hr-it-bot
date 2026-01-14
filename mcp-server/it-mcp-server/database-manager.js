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
    this.dbPath = dbPath || path.join(__dirname, 'tickets.db');
    this.db = null;
    this.SQL = null;
    this.initialized = false;
    this.logger = getLogger();
  }

  /**
   * Load database from disk
   */
  async init() {
    try {
      // Initialize sql.js
      this.SQL = await initSqlJs();

      // Load database from file
      if (!fs.existsSync(this.dbPath)) {
        throw new Error(`Database file not found at ${this.dbPath}. Please run seed-discussions.js first.`);
      }

      const buffer = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(buffer);
      this.initialized = true;
      
      this.logger.info('Database loaded successfully');
      return this;
    } catch (error) {
      this.logger.error('Failed to load database:', error);
      throw error;
    }
  }

  /**
   * Save database to disk
   */
  _saveDatabase() {
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    } catch (error) {
      this.logger.error('Error saving database:', error);
    }
  }

  /**
   * Run a query that modifies data (INSERT, UPDATE, DELETE)
   */
  run(sql, params = []) {
    try {
      this.db.run(sql, params);
      this._saveDatabase();
      return { changes: this.db.getRowsModified() };
    } catch (error) {
      this.logger.error('Database run error:', error);
      throw error;
    }
  }

  /**
   * Get a single row
   */
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
      this.logger.error('Database get error:', error);
      throw error;
    }
  }

  /**
   * Get all matching rows
   */
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
      this.logger.error('Database all error:', error);
      throw error;
    }
  }

  /**
   * Close database connection
   */
  async close() {
    try {
      if (this.db) {
        this._saveDatabase();
        this.db.close();
        this.db = null;
        this.initialized = false;
        this.logger.info('Database connection closed');
      }
    } catch (error) {
      this.logger.error('Error closing database:', error);
      throw error;
    }
  }

  /**
   * Get database statistics
   */
  getStats() {
    try {
      const countRow = this.get('SELECT COUNT(*) as count FROM tickets');
      const total = countRow?.count || 0;

      const byStatus = this.all(`
        SELECT status, COUNT(*) as count FROM tickets GROUP BY status ORDER BY status
      `);

      const byPriority = this.all(`
        SELECT priority, COUNT(*) as count FROM tickets GROUP BY priority 
        ORDER BY CASE priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END
      `);

      const byCategory = this.all(`
        SELECT category, COUNT(*) as count FROM tickets GROUP BY category ORDER BY count DESC
      `);

      const byAssignee = this.all(`
        SELECT assigned_to_email as email, assigned_to as name, COUNT(*) as count FROM tickets 
        GROUP BY assigned_to_email ORDER BY count DESC
      `);

      return {
        total,
        byStatus,
        byPriority,
        byCategory,
        byAssignee
      };
    } catch (error) {
      this.logger.error('Failed to get statistics:', error);
      throw error;
    }
  }
}

// Export singleton instance management
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

