/**
 * Migration Script: CSV to SQLite3
 * Imports tickets from CSV file into SQLite3 database
 */
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { initializeDatabase } from './db-init.js';
import { initializeTicketService } from './ticket-db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Parse CSV line handling quoted fields
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim().replace(/^"|"$/g, ''));
  return result;
}

/**
 * Main migration function
 */
async function migrate() {
  try {
    console.log('🚀 Starting migration from CSV to SQLite3...\n');

    // Initialize database
    console.log('📦 Initializing database...');
    await initializeDatabase();
    const ticketService = await initializeTicketService();
    console.log('✅ Database initialized\n');

    // Read CSV file
    console.log('📖 Reading CSV file...');
    const csvPath = path.join(__dirname, 'tickets.csv');
    const csvContent = await fs.readFile(csvPath, 'utf8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    console.log(`✅ Read ${lines.length} lines from CSV\n`);

    // Parse header
    const header = parseCSVLine(lines[0]);
    console.log('📋 CSV Headers:', header);
    console.log(`📊 Found ${lines.length - 1} tickets to migrate\n`);

    // Map header to field names
    const fieldMap = {
      'ticket_id': 0,
      'employee_name': 1,
      'date': 2,
      'status': 3,
      'description': 4,
      'priority': 5,
      'category': 6,
      'assigned_to': 7,
      'resolution_time': 8,
      'tags': 9
    };

    // Helper function to generate email from name
    const generateEmail = (name) => {
      return name
        .toLowerCase()
        .trim()
        .replace(/[àâä]/g, 'a')
        .replace(/[èêë]/g, 'e')
        .replace(/[ìîï]/g, 'i')
        .replace(/[òôö]/g, 'o')
        .replace(/[ùûü]/g, 'u')
        .replace(/[ç]/g, 'c')
        .replace(/\s+/g, '.')
        + '@company.com';
    };

    // Import tickets
    console.log('💾 Importing tickets...');
    let imported = 0;
    let errors = 0;

    for (let i = 1; i < lines.length; i++) {
      try {
        const fields = parseCSVLine(lines[i]);
        
        const employeeName = fields[fieldMap.employee_name];
        const assignedToName = fields[fieldMap.assigned_to];
        
        const ticketData = {
          ticket_id: fields[fieldMap.ticket_id],
          employee_name: employeeName,
          employee_email: generateEmail(employeeName),
          date: fields[fieldMap.date],
          status: fields[fieldMap.status],
          description: fields[fieldMap.description],
          priority: fields[fieldMap.priority],
          category: fields[fieldMap.category],
          assigned_to: assignedToName,
          assigned_to_email: generateEmail(assignedToName),
          resolution_time: fields[fieldMap.resolution_time] || null,
          tags: fields[fieldMap.tags] || null
        };

        ticketService.createTicket(ticketData);
        imported++;

        if (imported % 10 === 0) {
          process.stdout.write(`\r  Progress: ${imported}/${lines.length - 1} tickets imported`);
        }
      } catch (error) {
        console.error(`\n⚠️  Error importing line ${i}:`, error.message);
        errors++;
      }
    }

    console.log(`\r  Progress: ${imported}/${lines.length - 1} tickets imported`);
    console.log(`\n✅ Migration completed!\n`);

    // Display statistics
    const stats = ticketService.getStatistics();
    console.log('📊 DATABASE STATISTICS:');
    console.log(`  Total Tickets: ${stats.total}`);
    console.log(`\n  By Status:`);
    stats.byStatus.forEach(s => {
      console.log(`    - ${s.status}: ${s.count}`);
    });
    console.log(`\n  By Priority:`);
    stats.byPriority.forEach(p => {
      console.log(`    - ${p.priority}: ${p.count}`);
    });
    console.log(`\n  By Category:`);
    stats.byCategory.slice(0, 10).forEach(c => {
      console.log(`    - ${c.category}: ${c.count}`);
    });
    console.log(`\n  By Assigned Technician:`);
    stats.byAssignee.forEach(a => {
      console.log(`    - ${a.assigned_to}: ${a.count}`);
    });

    if (errors > 0) {
      console.log(`\n⚠️  Migration completed with ${errors} errors`);
    } else {
      console.log(`\n🎉 Migration completed successfully!`);
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrate().then(() => {
  process.exit(0);
}).catch(error => {
  console.error('Migration error:', error);
  process.exit(1);
});
