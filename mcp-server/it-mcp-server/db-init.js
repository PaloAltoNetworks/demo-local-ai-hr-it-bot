/**
 * Database Initialization Module
 * Sets up SQLite database schema for IT ticketing system
 * Uses sql.js - pure JavaScript SQLite (no compilation needed)
 */
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class DatabaseManager {
  constructor(dbPath = null) {
    this.dbPath = dbPath || path.join(__dirname, 'tickets.db');
    this.db = null;
    this.SQL = null;
    this.initialized = false;
  }

  /**
   * Initialize database and create schema
   */
  async init() {
    try {
      // Initialize sql.js
      this.SQL = await initSqlJs();

      // Load existing database or create new one
      const dbExists = fs.existsSync(this.dbPath);
      if (dbExists) {
        const buffer = fs.readFileSync(this.dbPath);
        this.db = new this.SQL.Database(buffer);
        console.log('✅ Loaded existing database');
      } else {
        this.db = new this.SQL.Database();
        console.log('✅ Created new database');
      }

      // Create schema
      await this._createSchema();

      this.initialized = true;
      
      // Only save if this is a new database (no file existed before)
      if (!dbExists) {
        this._saveDatabase();
      }
      
      console.log('✅ Database initialized successfully');
      return this;
    } catch (error) {
      console.error('❌ Failed to initialize database:', error);
      throw error;
    }
  }

  /**
   * Create database schema
   */
  async _createSchema() {
    try {
      // Check if table exists to avoid re-creating
      const tables = this.db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='tickets'");
      if (tables.length > 0) {
        console.log('✅ Database schema already exists');
        return;
      }

      // Main tickets table
      this.db.run(`
        CREATE TABLE tickets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ticket_id TEXT UNIQUE NOT NULL,
          employee_email TEXT NOT NULL,
          employee_name TEXT NOT NULL,
          date TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('Open', 'In progress', 'Resolved', 'Closed')),
          description TEXT NOT NULL,
          priority TEXT NOT NULL CHECK(priority IN ('Critical', 'High', 'Medium', 'Low')),
          category TEXT NOT NULL,
          assigned_to_email TEXT NOT NULL,
          assigned_to TEXT NOT NULL,
          resolution_time TEXT,
          tags TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes for better query performance
      const indexes = [
        'CREATE INDEX idx_ticket_id ON tickets(ticket_id)',
        'CREATE INDEX idx_status ON tickets(status)',
        'CREATE INDEX idx_priority ON tickets(priority)',
        'CREATE INDEX idx_employee_email ON tickets(employee_email)',
        'CREATE INDEX idx_assigned_to_email ON tickets(assigned_to_email)',
        'CREATE INDEX idx_category ON tickets(category)',
        'CREATE INDEX idx_employee_name ON tickets(employee_name)',
        'CREATE INDEX idx_date ON tickets(date)'
      ];

      for (const indexSql of indexes) {
        this.db.run(indexSql);
      }

      console.log('✅ Database schema created successfully');
    } catch (error) {
      console.error('❌ Failed to create schema:', error);
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
      console.error('Error saving database:', error);
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
      console.error('Database run error:', error);
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
      console.error('Database get error:', error);
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
      console.error('Database all error:', error);
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
        console.log('✅ Database connection closed');
      }
    } catch (error) {
      console.error('Error closing database:', error);
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
      console.error('Failed to get statistics:', error);
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

