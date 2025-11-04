#!/usr/bin/env node

/**
 * Database Initialization Script
 * Creates and populates tickets.db with 40 IT tickets + discussions
 * Each ticket has 1 unique incident
 */

import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_PATH = path.join(__dirname, 'tickets.db');

/**
 * Generate 40 unique tickets with single incidents
 */
function generateTickets() {
  const statuses = ['Open', 'In progress', 'Resolved', 'Closed'];
  const priorities = ['Critical', 'High', 'Medium', 'Low'];

  const employees = [
    { email: 'aurelien.delamarre@company.com', name: 'Aurelien Delamarre', profile: 'neutral' },
    { email: 'sophie.martin@company.com', name: 'Sophie Martin', profile: 'negative' },
    { email: 'michael.johnson@company.com', name: 'Michael Johnson', profile: 'positive' },
    { email: 'lisa.wang@company.com', name: 'Lisa Wang', profile: 'positive' },
    { email: 'fatima.alrashid@company.com', name: 'Fatima Al-Rashid', profile: 'negative' },
    { email: 'marco.rossi@company.com', name: 'Marco Rossi', profile: 'positive' },
    { email: 'jean.dupont@company.com', name: 'Jean Dupont', profile: 'neutral' },
    { email: 'emma.schmidt@company.com', name: 'Emma Schmidt', profile: 'positive' },
    { email: 'carlos.mendez@company.com', name: 'Carlos Mendez', profile: 'negative' },
    { email: 'yuki.tanaka@company.com', name: 'Yuki Tanaka', profile: 'positive' }
  ];

  const technicians = [
    { email: 'robert.taylor@company.com', name: 'Robert Taylor' },
    { email: 'james.wilson@company.com', name: 'James Wilson' },
    { email: 'sandra.brown@company.com', name: 'Sandra Brown' },
    { email: 'david.lee@company.com', name: 'David Lee' }
  ];

  // Internal notes for various scenarios
  const positiveNotes = [
    'Great team player, always cooperative',
    'Professional and respectful in all interactions',
    'Follows policies and procedures correctly',
    'Excellent communication skills',
    'Always appreciative of IT support',
    'Proactive in resolving issues',
    'Great attitude towards IT team'
  ];

  const negativeNotes = [
    'Employee repeatedly requesting exceptions to policy - declined',
    'Frequent requests for unauthorized access - against company policy',
    'Employee asking for non-standard setup again - declined per policy',
    'Requesting exceptions to security protocols - not permitted',
    'Repeatedly asking for policy exceptions - management consulted',
    'Employee demanding special treatment - declined per IT policy',
    'Requesting unauthorized software installation - policy does not allow',
    'Asking for policy exceptions again - this is the 8th request this month',
    'Employee continues to request policy violations - this is becoming problematic'
  ];

  const ticketData = [
    { desc: 'Cannot access Salesforce - permission denied error', cat: 'Application', pri: 'High' },
    { desc: 'Laptop replacement - old unit with performance issues', cat: 'Hardware', pri: 'High' },
    { desc: 'Printer not connecting to network', cat: 'Printer', pri: 'Medium' },
    { desc: 'VPN connection keeps dropping during calls', cat: 'Network', pri: 'High' },
    { desc: 'Outlook keeps crashing with large files', cat: 'Email', pri: 'High' },
    { desc: 'Font rendering issue in documents', cat: 'Software', pri: 'Medium' },
    { desc: 'WiFi intermittently disconnects', cat: 'Network', pri: 'Medium' },
    { desc: 'Slack notifications not working', cat: 'Application', pri: 'Low' },
    { desc: 'Microsoft Teams camera not detected', cat: 'Software', pri: 'High' },
    { desc: 'Password reset requested - locked account', cat: 'Security', pri: 'Critical' },
    { desc: 'Cannot view PDF files in browser', cat: 'Software', pri: 'Medium' },
    { desc: 'Adobe Creative Suite license expired', cat: 'Software', pri: 'Medium' },
    { desc: 'OneDrive sync issues - files not uploading', cat: 'Application', pri: 'High' },
    { desc: 'Keyboard shortcuts not working in Excel', cat: 'Software', pri: 'Low' },
    { desc: 'Need to update browser to latest version', cat: 'Software', pri: 'Low' },
    { desc: 'Cannot connect to company VPN from home', cat: 'Network', pri: 'High' },
    { desc: 'Jira login fails - authentication error', cat: 'Application', pri: 'High' },
    { desc: 'Disk space issue - needs cleanup and optimization', cat: 'Software', pri: 'Critical' },
    { desc: 'Printer paper jam - needs service', cat: 'Printer', pri: 'Medium' },
    { desc: 'GitHub SSH key configuration needed', cat: 'Security', pri: 'Medium' },
    { desc: 'Thunderbird email client crashing', cat: 'Email', pri: 'High' },
    { desc: 'Laptop battery indicator shows error', cat: 'Software', pri: 'High' },
    { desc: 'Cannot install required Python packages', cat: 'Software', pri: 'Medium' },
    { desc: 'Document sharing permissions need adjustment', cat: 'Security', pri: 'Medium' },
    { desc: 'Antivirus quarantined safe file - need exception', cat: 'Security', pri: 'High' },
    { desc: 'Internet speed very slow - speed test needed', cat: 'Network', pri: 'Medium' },
    { desc: 'Desktop icons disappearing randomly', cat: 'Software', pri: 'Low' },
    { desc: 'Company phone not receiving calls', cat: 'Communication', pri: 'Critical' },
    { desc: 'Database connection timeout issues', cat: 'Application', pri: 'Critical' },
    { desc: 'Need configuration help for docking station', cat: 'Software', pri: 'Medium' },
    { desc: 'Zoom audio cuts out during meetings', cat: 'Software', pri: 'High' },
    { desc: 'Request new ergonomic accessories', cat: 'Request', pri: 'Low' },
    { desc: 'Confluence page editing issues', cat: 'Application', pri: 'Medium' },
    { desc: 'Need access to restricted shared drive', cat: 'Security', pri: 'Medium' },
    { desc: 'Browser cache needs clearing - pages loading slowly', cat: 'Software', pri: 'Low' },
    { desc: 'New employee setup - hardware + accounts needed', cat: 'Onboarding', pri: 'High' },
    { desc: 'Need backup solution for external drive', cat: 'Software', pri: 'Critical' },
    { desc: 'SSL certificate expired on internal server', cat: 'Security', pri: 'Critical' },
    { desc: 'Display settings changed after update - needs reset', cat: 'Software', pri: 'Medium' },
    { desc: 'Cannot send large email attachments', cat: 'Email', pri: 'Medium' }
  ];

  const tickets = [];
  const startDate = new Date('2025-08-01');

  for (let i = 0; i < 40; i++) {
    const employee = employees[i % employees.length];
    const technician = technicians[i % technicians.length];
    const data = ticketData[i];

    const ticketDate = new Date(startDate);
    ticketDate.setDate(ticketDate.getDate() + (i * 2));

    const ticketId = `INC-2025-${String(119 + i).padStart(4, '0')}`;
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const resolutionTime = status === 'Closed' ? `${Math.floor(Math.random() * 14) + 1} days` : null;

    // Generate internal notes based on employee profile
    let internalNotes = null;
    if (i === 0) {
      internalNotes = 'SPECIAL: Aurelien Delamarre - Salesforce access permissions management';
    } else if (i === 1) {
      internalNotes = 'SPECIAL: Sophie Martin - Laptop shipping to 250 Park Avenue, Apt 3A, New York, NY 10169, USA';
    } else {
      const employeeProfile = employee.profile;
      
      if (employeeProfile === 'negative') {
        // Negative profile: 85% negative notes, 15% positive
        internalNotes = Math.random() > 0.15 ?
          negativeNotes[Math.floor(Math.random() * negativeNotes.length)] :
          positiveNotes[Math.floor(Math.random() * positiveNotes.length)];
      } else if (employeeProfile === 'positive') {
        // Positive profile: 85% positive notes, 15% negative
        internalNotes = Math.random() > 0.15 ?
          positiveNotes[Math.floor(Math.random() * positiveNotes.length)] :
          negativeNotes[Math.floor(Math.random() * negativeNotes.length)];
      } else {
        // Neutral profile: 50/50 mix
        internalNotes = Math.random() > 0.5 ?
          positiveNotes[Math.floor(Math.random() * positiveNotes.length)] :
          negativeNotes[Math.floor(Math.random() * negativeNotes.length)];
      }
    }

    tickets.push({
      ticket_id: ticketId,
      employee_email: employee.email,
      employee_name: employee.name,
      date: ticketDate.toISOString().split('T')[0],
      status: status,
      description: data.desc,
      priority: data.pri,
      category: data.cat,
      assigned_to_email: technician.email,
      assigned_to: technician.name,
      resolution_time: resolutionTime,
      tags: data.cat.toLowerCase(),
      internal_notes: internalNotes
    });
  }

  return tickets;
}

/**
 * Generate 3-10 discussions per ticket
 */
function generateDiscussions(tickets) {
  const discussions = [];

  for (const ticket of tickets) {
    const discussionCount = Math.floor(Math.random() * 8) + 3;
    const baseTime = new Date(ticket.date);

    // Special deterministic flow for Sophie Martin's laptop replacement ticket
    if (ticket.ticket_id === 'INC-2025-0120' || ticket.employee_email === 'sophie.martin@company.com') {
      // Explicit sequence requested by user:
      // 1) Sophie initial report
      // 2) Technician says it needs replacement and asks about shipping
      // 3) Sophie requests shipment to personal address
      // 4) Technician confirms shipping labels/details
      // 5) Technician confirms shipment
      const sophieTech = { email: ticket.assigned_to_email, name: ticket.assigned_to };

      const seq = [
        { offset: 0, author: { email: ticket.employee_email, name: ticket.employee_name }, comment_type: 'comment', is_internal: 0, content: `Hi, I'm experiencing an issue: ${ticket.description}. Can you help?` },
        { offset: 4, author: sophieTech, comment_type: 'comment', is_internal: 0, content: `It looks like this unit needs to be replaced. We can provide a replacement. Would you like it shipped to your personal address since you're remote?` },
        { offset: 8, author: { email: ticket.employee_email, name: ticket.employee_name }, comment_type: 'comment', is_internal: 0, content: `Yes please, send the replacement to my personal address: 250 Park Avenue, Apt 3A, New York, NY 10169, USA` },
        { offset: 12, author: sophieTech, comment_type: 'comment', is_internal: 0, content: `Thanks — we'll prepare shipping labels and confirm the courier. Please allow 1-2 business days for packing.` },
        { offset: 20, author: sophieTech, comment_type: 'status_update', is_internal: 0, content: `Shipment confirmed. Replacement laptop has been dispatched with tracking number TRK123456789.` },
        // add an internal note about address handling
        { offset: 24, author: sophieTech, comment_type: 'internal_note', is_internal: 1, content: `Confirmed personal address and printed shipping label. Address stored in internal notes.` }
      ];

      for (const item of seq) {
        const commentTime = new Date(baseTime);
        commentTime.setHours(commentTime.getHours() + item.offset);
        discussions.push({
          ticket_id: ticket.ticket_id,
          author_email: item.author.email || ticket.employee_email,
          author_name: item.author.name || ticket.employee_name,
          comment_type: item.comment_type,
          content: (item.content || '').replace(/\r?\n/g, ' '),
          is_internal: item.is_internal ? 1 : 0,
          created_at: commentTime.toISOString().replace('T', ' ').substring(0, 19)
        });
      }

      // continue to next ticket (we already injected the intended discussion flow)
      continue;
    }

    for (let i = 0; i < discussionCount; i++) {
      const isInternal = i > 1 && Math.random() > 0.6;
      const commentTime = new Date(baseTime);
      commentTime.setHours(commentTime.getHours() + (i * 4));

      let author, content, commentType = 'comment';

      if (i === 0) {
        author = { email: ticket.employee_email, name: ticket.employee_name };
        content = `Hi, I'm experiencing an issue: ${ticket.description.toLowerCase()}. Can you help?`;
      } else if (isInternal) {
        author = { email: ticket.assigned_to_email, name: ticket.assigned_to };
        commentType = 'internal_note';
        const internalMessages = [
          'Found root cause. Applying fix.',
          'Configuration issue detected. Updating settings.',
          'Software bug identified. Workaround provided.',
          'Hardware test completed. Device functioning normally.',
          'Permissions corrected in system.',
          'Updated driver to latest version.',
          'Cleared cache and temporary files.',
          'Restarted service successfully.'
        ];
        content = internalMessages[Math.floor(Math.random() * internalMessages.length)];
      } else {
        author = { email: ticket.assigned_to_email, name: ticket.assigned_to };
        const responses = [
          `Thanks for reporting this. Let me investigate the ${ticket.category.toLowerCase()} issue for you.`,
          `I've made progress on your ${ticket.category.toLowerCase()} issue. Working on resolution.`,
          `Status update: ${ticket.description} - in progress`,
          `Issue resolved successfully. Your ${ticket.category.toLowerCase()} problem has been fixed.`
        ];
        content = responses[Math.floor(Math.random() * responses.length)];
        if (Math.random() > 0.7) commentType = 'status_update';
      }

      discussions.push({
        ticket_id: ticket.ticket_id,
        author_email: author.email,
        author_name: author.name,
        comment_type: commentType,
        content: (content || '').replace(/\r?\n/g, ' '),
        is_internal: commentType === 'internal_note' ? 1 : 0,
        created_at: commentTime.toISOString().replace('T', ' ').substring(0, 19)
      });
    }
  }

  return discussions;
}

async function initializeDatabase() {
  try {
    if (fs.existsSync(DB_PATH)) {
      fs.unlinkSync(DB_PATH);
    }

    const SQL = await initSqlJs();
    const db = new SQL.Database();

    db.run(`
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
        internal_notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE ticket_discussions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id TEXT NOT NULL,
        author_email TEXT NOT NULL,
        author_name TEXT NOT NULL,
        comment_type TEXT NOT NULL DEFAULT 'comment' CHECK(comment_type IN ('comment', 'internal_note', 'status_update', 'assignment')),
        content TEXT NOT NULL,
        is_internal BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id) ON DELETE CASCADE
      )
    `);

    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_ticket_id ON tickets(ticket_id)',
      'CREATE INDEX IF NOT EXISTS idx_status ON tickets(status)',
      'CREATE INDEX IF NOT EXISTS idx_priority ON tickets(priority)',
      'CREATE INDEX IF NOT EXISTS idx_employee_email ON tickets(employee_email)',
      'CREATE INDEX IF NOT EXISTS idx_assigned_to_email ON tickets(assigned_to_email)',
      'CREATE INDEX IF NOT EXISTS idx_category ON tickets(category)',
      'CREATE INDEX IF NOT EXISTS idx_discussions_ticket_id ON ticket_discussions(ticket_id)',
      'CREATE INDEX IF NOT EXISTS idx_discussions_author ON ticket_discussions(author_email)',
      'CREATE INDEX IF NOT EXISTS idx_discussions_type ON ticket_discussions(comment_type)',
    ];

    for (const indexSql of indexes) {
      db.run(indexSql);
    }

    const tickets = generateTickets();

    for (const ticket of tickets) {
      db.run(
        `INSERT INTO tickets (
          ticket_id, employee_email, employee_name, date, status, description,
          priority, category, assigned_to_email, assigned_to, resolution_time, tags, internal_notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ticket.ticket_id, ticket.employee_email, ticket.employee_name, ticket.date, ticket.status,
          ticket.description, ticket.priority, ticket.category, ticket.assigned_to_email, ticket.assigned_to,
          ticket.resolution_time, ticket.tags, ticket.internal_notes
        ]
      );
    }

    const discussions = generateDiscussions(tickets);

    for (const d of discussions) {
      db.run(
        `INSERT INTO ticket_discussions (
          ticket_id, author_email, author_name, comment_type, content, is_internal, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [d.ticket_id, d.author_email, d.author_name, d.comment_type, d.content, d.is_internal, d.created_at]
      );
    }

    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);

    console.log('✅ Database initialized successfully');

    db.close();

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

initializeDatabase();
