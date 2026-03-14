#!/usr/bin/env node

/**
 * Database Initialization Script
 * Creates and populates tickets.db with IT tickets, discussions, assets, and IT processes.
 */

import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_PATH = path.join(__dirname, 'tickets.db');

// --- Employees (sourced from HR CSV) ---

const employees = [
  { email: 'sarah.chen@company.com', name: 'Sarah Chen' },
  { email: 'michael.johnson@company.com', name: 'Michael Johnson' },
  { email: 'emma.rodriguez@company.com', name: 'Emma Rodriguez' },
  { email: 'david.kim@company.com', name: 'David Kim' },
  { email: 'lisa.wang@company.com', name: 'Lisa Wang' },
  { email: 'thomas.dubois@company.com', name: 'Thomas Dubois' },
  { email: 'sophie.martin@company.com', name: 'Sophie Martin' },
  { email: 'aurelien.delamarre@company.com', name: 'Aurelien Delamarre' },
  { email: 'james.wilson@company.com', name: 'James Wilson' },
  { email: 'maria.garcia@company.com', name: 'Maria Garcia' },
  { email: 'robert.taylor@company.com', name: 'Robert Taylor' },
  { email: 'anna.kowalski@company.com', name: 'Anna Kowalski' },
  { email: 'jp.moreau@company.com', name: 'Jean-Pierre Moreau' },
  { email: 'alexandra.petrov@company.com', name: 'Alexandra Petrov' },
  { email: 'carlos.mendoza@company.com', name: 'Carlos Mendoza' },
  { email: 'priya.patel@company.com', name: 'Priya Patel' },
  { email: 'marco.rossi@company.com', name: 'Marco Rossi' },
  { email: 'nicole.thompson@company.com', name: 'Nicole Thompson' },
  { email: 'hans.mueller@company.com', name: 'Hans Mueller' },
  { email: 'camille.laurent@company.com', name: 'Camille Laurent' },
  { email: 'kevin.obrien@company.com', name: "Kevin O'Brien" },
  { email: 'fatima.alrashid@company.com', name: 'Fatima Al-Rashid' },
  { email: 'pierre.lefevre@company.com', name: 'Pierre Lefevre' },
  { email: 'rachel.green@company.com', name: 'Rachel Green' },
  { email: 'ahmed.hassan@company.com', name: 'Ahmed Hassan' },
  { email: 'yuki.tanaka@company.com', name: 'Yuki Tanaka' },
  { email: 'sebastian.andersson@company.com', name: 'Sebastian Andersson' },
  { email: 'elena.popov@company.com', name: 'Elena Popov' },
  { email: 'mohammed.benali@company.com', name: 'Mohammed Benali' },
  { email: 'isabella.santos@company.com', name: 'Isabella Santos' },
  { email: 'dmitri.volkov@company.com', name: 'Dmitri Volkov' },
  { email: 'chloe.williams@company.com', name: 'Chloe Williams' },
  { email: 'lars.eriksson@company.com', name: 'Lars Eriksson' },
  { email: 'giovanna.ferrari@company.com', name: 'Giovanna Ferrari' },
  { email: 'ryan.mitchell@company.com', name: 'Ryan Mitchell' },
  { email: 'lila.nguyen@company.com', name: 'Lila Nguyen' },
  { email: 'anton.kozlov@company.com', name: 'Anton Kozlov' },
  { email: 'samantha.lee@company.com', name: 'Samantha Lee' },
  { email: 'felipe.silva@company.com', name: 'Felipe Silva' },
  { email: 'nadia.kone@company.com', name: 'Nadia Kone' },
  { email: 'oliver.brown@company.com', name: 'Oliver Brown' },
  { email: 'valentina.rossi@company.com', name: 'Valentina Rossi' },
  { email: 'hiroshi.yamamoto@company.com', name: 'Hiroshi Yamamoto' },
  { email: 'grace.adams@company.com', name: 'Grace Adams' },
  { email: 'maxime.dubois@company.com', name: 'Maxime Dubois' },
  { email: 'zara.ahmed@company.com', name: 'Zara Ahmed' },
  { email: 'jacob.miller@company.com', name: 'Jacob Miller' },
  { email: 'anya.volkova@company.com', name: 'Anya Volkova' },
  { email: 'lucas.garcia@company.com', name: 'Lucas Garcia' },
  { email: 'emma.johnson@company.com', name: 'Emma Johnson' },
  { email: 'rafael.costa@company.com', name: 'Rafael Costa' },
  { email: 'mia.andersson@company.com', name: 'Mia Andersson' },
  { email: 'daniel.park@company.com', name: 'Daniel Park' },
  { email: 'sofia.hernandez@company.com', name: 'Sofia Hernandez' },
  { email: 'benjamin.white@company.com', name: 'Benjamin White' },
  { email: 'katarina.novak@company.com', name: 'Katarina Novak' },
  { email: 'igor.petrov@company.com', name: 'Igor Petrov' },
  { email: 'charlotte.davis@company.com', name: 'Charlotte Davis' },
  { email: 'mateo.lopez@company.com', name: 'Mateo Lopez' },
  { email: 'hannah.wilson@company.com', name: 'Hannah Wilson' },
  { email: 'alex.thompson@company.com', name: 'Alex Thompson' },
  { email: 'zoe.martin@company.com', name: 'Zoe Martin' },
  { email: 'julian.schmidt@company.com', name: 'Julian Schmidt' },
  { email: 'leila.mansouri@company.com', name: 'Leila Mansouri' },
  { email: 'victor.ivanov@company.com', name: 'Victor Ivanov' },
  { email: 'jasmine.taylor@company.com', name: 'Jasmine Taylor' },
  { email: 'marcus.johnson@company.com', name: 'Marcus Johnson' },
  { email: 'isabella.brown@company.com', name: 'Isabella Brown' },
  { email: 'oscar.lindqvist@company.com', name: 'Oscar Lindqvist' },
  { email: 'maya.singh@company.com', name: 'Maya Singh' },
  { email: 'fernando.gutierrez@company.com', name: 'Fernando Gutierrez' },
  { email: 'christina.wong@company.com', name: 'Christina Wong' },
  { email: 'gabriel.morin@company.com', name: 'Gabriel Morin' },
  { email: 'natasha.ivanova@company.com', name: 'Natasha Ivanova' },
  { email: 'pablo.rodriguez@company.com', name: 'Pablo Rodriguez' },
  { email: 'elena.martinez@company.com', name: 'Elena Martinez' },
  { email: 'kai.nakamura@company.com', name: 'Kai Nakamura' },
  { email: 'sophia.clarke@company.com', name: 'Sophia Clarke' },
  { email: 'liam.oconnor@company.com', name: "Liam O'Connor" },
  { email: 'aria.patel@company.com', name: 'Aria Patel' },
  { email: 'noah.kim@company.com', name: 'Noah Kim' },
  { email: 'maya.chen@company.com', name: 'Maya Chen' },
  { email: 'ethan.wright@company.com', name: 'Ethan Wright' },
  { email: 'cora.nielsen@company.com', name: 'Cora Nielsen' },
  { email: 'leon.muller@company.com', name: 'Leon Muller' },
  { email: 'zara.wilson@company.com', name: 'Zara Wilson' },
  { email: 'adam.foster@company.com', name: 'Adam Foster' },
  { email: 'luna.rodriguez@company.com', name: 'Luna Rodriguez' },
  { email: 'theo.andersson@company.com', name: 'Theo Andersson' },
  { email: 'iris.kim@company.com', name: 'Iris Kim' },
  { email: 'felix.santos@company.com', name: 'Felix Santos' },
  { email: 'vera.popov@company.com', name: 'Vera Popov' },
  { email: 'diego.martinez@company.com', name: 'Diego Martinez' },
  { email: 'stella.johnson@company.com', name: 'Stella Johnson' },
  { email: 'arthur.wilson@company.com', name: 'Arthur Wilson' },
  { email: 'layla.hassan@company.com', name: 'Layla Hassan' },
  { email: 'ivan.petrov@company.com', name: 'Ivan Petrov' },
  { email: 'amara.diallo@company.com', name: 'Amara Diallo' },
  { email: 'ravi.sharma@company.com', name: 'Ravi Sharma' },
  { email: 'nora.larsson@company.com', name: 'Nora Larsson' },
];

const technicians = [
  { email: 'robert.taylor@company.com', name: 'Robert Taylor' },
  { email: 'james.wilson@company.com', name: 'James Wilson' },
  { email: 'diego.martinez@company.com', name: 'Diego Martinez' },
  { email: 'dmitri.volkov@company.com', name: 'Dmitri Volkov' },
];

// --- Ticket generation ---

function generateTickets() {
  const statuses = ['Open', 'In Progress', 'Resolved', 'Closed'];
  const priorities = ['Critical', 'High', 'Medium', 'Low'];

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
    { desc: 'Cannot send large email attachments', cat: 'Email', pri: 'Medium' },
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

    tickets.push({
      ticket_id: ticketId,
      employee_email: employee.email,
      employee_name: employee.name,
      date: ticketDate.toISOString().split('T')[0],
      status,
      description: data.desc,
      priority: data.pri,
      category: data.cat,
      assigned_to_email: technician.email,
      assigned_to: technician.name,
      resolution_time: resolutionTime,
      tags: data.cat.toLowerCase(),
      internal_notes: null,
    });
  }

  return tickets;
}

// --- Discussion generation ---

function generateDiscussions(tickets) {
  const discussions = [];

  for (const ticket of tickets) {
    const count = Math.floor(Math.random() * 8) + 3;
    const baseTime = new Date(ticket.date);

    for (let i = 0; i < count; i++) {
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
        const notes = [
          'Found root cause. Applying fix.',
          'Configuration issue detected. Updating settings.',
          'Software bug identified. Workaround provided.',
          'Hardware test completed. Device functioning normally.',
          'Permissions corrected in system.',
          'Updated driver to latest version.',
          'Cleared cache and temporary files.',
          'Restarted service successfully.',
        ];
        content = notes[Math.floor(Math.random() * notes.length)];
      } else {
        author = { email: ticket.assigned_to_email, name: ticket.assigned_to };
        const responses = [
          `Thanks for reporting this. Let me investigate the ${ticket.category.toLowerCase()} issue for you.`,
          `I've made progress on your ${ticket.category.toLowerCase()} issue. Working on resolution.`,
          `Status update: ${ticket.description} - in progress`,
          `Issue resolved successfully. Your ${ticket.category.toLowerCase()} problem has been fixed.`,
        ];
        content = responses[Math.floor(Math.random() * responses.length)];
        if (Math.random() > 0.7) commentType = 'status_update';
      }

      discussions.push({
        ticket_id: ticket.ticket_id,
        author_email: author.email,
        author_name: author.name,
        comment_type: commentType,
        content: content.replace(/\r?\n/g, ' '),
        is_internal: commentType === 'internal_note' ? 1 : 0,
        created_at: commentTime.toISOString().replace('T', ' ').substring(0, 19),
      });
    }
  }

  return discussions;
}

// --- Asset generation ---

function generateAssets() {
  const laptopModels = [
    { brand: 'Dell', model: 'Latitude 5550', os: 'Windows 11 Pro' },
    { brand: 'Dell', model: 'Latitude 7450', os: 'Windows 11 Pro' },
    { brand: 'Apple', model: 'MacBook Pro 14" M4', os: 'macOS Sequoia 15' },
    { brand: 'Apple', model: 'MacBook Air 15" M3', os: 'macOS Sequoia 15' },
    { brand: 'Lenovo', model: 'ThinkPad X1 Carbon Gen 12', os: 'Windows 11 Pro' },
    { brand: 'Lenovo', model: 'ThinkPad T14s Gen 6', os: 'Windows 11 Pro' },
    { brand: 'HP', model: 'EliteBook 840 G11', os: 'Windows 11 Pro' },
    { brand: 'HP', model: 'EliteBook 860 G11', os: 'Windows 11 Pro' },
  ];

  const assets = [];
  let assetCounter = 1;

  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    const laptop = laptopModels[i % laptopModels.length];
    const assignedDate = new Date('2024-01-15');
    assignedDate.setDate(assignedDate.getDate() + (i * 3));

    assets.push({
      asset_id: `ASSET-${String(assetCounter++).padStart(5, '0')}`,
      employee_email: emp.email,
      employee_name: emp.name,
      type: 'Laptop',
      brand: laptop.brand,
      model: laptop.model,
      serial_number: `SN-${laptop.brand.toUpperCase().slice(0, 3)}-${String(10000 + i).padStart(6, '0')}`,
      hostname: `${emp.email.split('@')[0].replace(/\./g, '-')}-01`,
      os: laptop.os,
      status: 'Active',
      assigned_date: assignedDate.toISOString().split('T')[0],
      usb_enabled: 0,
    });

    // Aurelien Delamarre gets a second laptop (demo scenario)
    if (emp.email === 'aurelien.delamarre@company.com') {
      const secondLaptop = laptopModels[(i + 3) % laptopModels.length];
      assets.push({
        asset_id: `ASSET-${String(assetCounter++).padStart(5, '0')}`,
        employee_email: emp.email,
        employee_name: emp.name,
        type: 'Laptop',
        brand: secondLaptop.brand,
        model: secondLaptop.model,
        serial_number: `SN-${secondLaptop.brand.toUpperCase().slice(0, 3)}-${String(20000 + i).padStart(6, '0')}`,
        hostname: `${emp.email.split('@')[0].replace(/\./g, '-')}-02`,
        os: secondLaptop.os,
        status: 'Active',
        assigned_date: '2025-06-01',
        usb_enabled: 0,
      });
    }
  }

  return assets;
}

// --- IT Processes ---

function getITProcesses() {
  return [
    {
      name: 'USB Device Access Request',
      category: 'Security',
      description: 'Request temporary or permanent USB storage device access on a company laptop. USB ports are disabled by default as a security measure.',
      steps: JSON.stringify([
        'Employee submits a request specifying the laptop (asset ID) and the business justification.',
        'IT creates a ticket with category "USB Access" and status "Pending Approval".',
        'The employee\'s direct manager must approve the request.',
        'Once approved, IT enables USB access on the specified laptop and updates the ticket.',
        'Access is granted for a maximum of 30 days, after which it is automatically revoked.',
      ]),
      required_info: JSON.stringify([
        'Employee email address',
        'Asset ID of the target laptop',
        'Business justification for USB access',
        'Requested duration (max 30 days)',
      ]),
      approval_required: 1,
      approver_role: 'direct_manager',
      keywords: 'usb,usb drive,usb stick,flash drive,thumb drive,removable storage,external storage,usb access,usb port',
    },
    {
      name: 'Software Installation Request',
      category: 'Software',
      description: 'Request installation of new software or upgrade of existing software on a company device.',
      steps: JSON.stringify([
        'Employee submits a request specifying the software name, version, and business need.',
        'IT verifies the software is on the approved list or evaluates it for security compliance.',
        'If the software is not pre-approved, manager approval is required.',
        'IT installs the software and verifies functionality.',
        'Ticket is updated and closed.',
      ]),
      required_info: JSON.stringify([
        'Software name and version',
        'Business justification',
        'Target device asset ID',
      ]),
      approval_required: 1,
      approver_role: 'direct_manager',
      keywords: 'software,install,application,program,upgrade,license',
    },
    {
      name: 'Laptop Replacement',
      category: 'Hardware',
      description: 'Request a replacement laptop due to hardware failure, performance degradation, or end-of-life cycle.',
      steps: JSON.stringify([
        'Employee reports the issue with their current laptop.',
        'IT runs diagnostics to confirm replacement is needed.',
        'IT selects a replacement model and prepares it with the standard image.',
        'Data migration is performed from the old device.',
        'New laptop is shipped or handed to the employee. Old device is decommissioned.',
      ]),
      required_info: JSON.stringify([
        'Current laptop asset ID',
        'Description of the issue',
        'Preferred shipping address (for remote employees)',
      ]),
      approval_required: 0,
      approver_role: null,
      keywords: 'laptop,replacement,new laptop,broken laptop,slow laptop,hardware failure,end of life',
    },
    {
      name: 'VPN Access Request',
      category: 'Network',
      description: 'Request VPN access for remote work or access to internal resources from outside the office.',
      steps: JSON.stringify([
        'Employee submits a request with their employee ID and the resources they need to access.',
        'IT verifies employment status and access requirements.',
        'VPN client is deployed to the employee\'s device.',
        'Access credentials are provisioned and sent securely.',
        'Employee tests the connection and confirms.',
      ]),
      required_info: JSON.stringify([
        'Employee email',
        'Device asset ID',
        'Resources to access',
      ]),
      approval_required: 0,
      approver_role: null,
      keywords: 'vpn,remote access,work from home,remote work,connect remotely',
    },
    {
      name: 'Password Reset',
      category: 'Security',
      description: 'Request a password reset for a locked or compromised account.',
      steps: JSON.stringify([
        'Employee contacts IT via chat or phone with identity verification.',
        'IT verifies the employee\'s identity through security questions or manager confirmation.',
        'Password is reset and a temporary password is provided via secure channel.',
        'Employee must change the temporary password on first login.',
      ]),
      required_info: JSON.stringify([
        'Employee email',
        'Account to reset (Active Directory, email, application)',
        'Reason for reset (forgotten, locked, compromised)',
      ]),
      approval_required: 0,
      approver_role: null,
      keywords: 'password,reset,locked,account locked,forgot password,compromised,change password',
    },
    {
      name: 'New Employee Onboarding',
      category: 'Onboarding',
      description: 'IT setup for new employees including hardware provisioning, account creation, and access configuration.',
      steps: JSON.stringify([
        'HR submits onboarding request with employee details and start date.',
        'IT provisions a laptop with the standard image and required software.',
        'Active Directory, email, and application accounts are created.',
        'Access permissions are configured based on role and department.',
        'Equipment is shipped or prepared for Day 1. Welcome email is sent.',
      ]),
      required_info: JSON.stringify([
        'Employee name and email',
        'Department and role',
        'Start date',
        'Manager name',
        'Required software and access levels',
      ]),
      approval_required: 1,
      approver_role: 'hr_manager',
      keywords: 'onboarding,new employee,new hire,new starter,setup,provisioning',
    },
    {
      name: 'Access Permission Change',
      category: 'Security',
      description: 'Request to add, modify, or revoke access permissions to internal systems, shared drives, or applications.',
      steps: JSON.stringify([
        'Employee or manager submits a request specifying the target system and desired access level.',
        'IT verifies the request against the employee\'s role-based access matrix.',
        'Manager approval is required for elevated or cross-department access.',
        'IT applies the permission change and verifies access.',
        'Change is logged in the access audit trail.',
      ]),
      required_info: JSON.stringify([
        'Employee email',
        'Target system or resource',
        'Requested access level (read, write, admin)',
        'Business justification',
      ]),
      approval_required: 1,
      approver_role: 'direct_manager',
      keywords: 'access,permissions,shared drive,folder access,system access,elevated access,admin access',
    },
    {
      name: 'Data Recovery Request',
      category: 'Software',
      description: 'Request recovery of accidentally deleted or corrupted files from backups.',
      steps: JSON.stringify([
        'Employee reports the lost data with file paths and approximate date of loss.',
        'IT checks available backup snapshots for the relevant period.',
        'If data is found, IT restores it to a temporary location for employee review.',
        'Employee confirms the recovered data is correct.',
        'Files are moved to the original location or a designated folder.',
      ]),
      required_info: JSON.stringify([
        'File or folder path',
        'Approximate date of deletion or corruption',
        'Description of the data',
      ]),
      approval_required: 0,
      approver_role: null,
      keywords: 'data recovery,deleted files,lost data,restore,backup,corrupted files',
    },
  ];
}

// --- Main seed function ---

async function seed() {
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
    console.log('Removed existing database');
  }

  const SQL = await initSqlJs();
  const db = new SQL.Database();

  // -- Schema --

  db.run(`
    CREATE TABLE tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT UNIQUE NOT NULL,
      employee_email TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Open', 'In Progress', 'Pending Approval', 'Approved', 'Rejected', 'Resolved', 'Closed')),
      description TEXT NOT NULL,
      priority TEXT NOT NULL CHECK(priority IN ('Critical', 'High', 'Medium', 'Low')),
      category TEXT NOT NULL,
      assigned_to_email TEXT NOT NULL,
      assigned_to TEXT NOT NULL,
      resolution_time TEXT,
      tags TEXT,
      internal_notes TEXT,
      asset_id TEXT,
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
      comment_type TEXT NOT NULL DEFAULT 'comment' CHECK(comment_type IN ('comment', 'internal_note', 'status_update', 'assignment', 'approval')),
      content TEXT NOT NULL,
      is_internal BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id TEXT UNIQUE NOT NULL,
      employee_email TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'Laptop',
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      serial_number TEXT UNIQUE NOT NULL,
      hostname TEXT NOT NULL,
      os TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active', 'Decommissioned', 'In Repair', 'In Stock')),
      assigned_date TEXT NOT NULL,
      usb_enabled BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE it_processes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      steps TEXT NOT NULL,
      required_info TEXT NOT NULL,
      approval_required BOOLEAN DEFAULT 0,
      approver_role TEXT,
      keywords TEXT
    )
  `);

  // -- Indexes --
  const indexes = [
    'CREATE INDEX idx_ticket_id ON tickets(ticket_id)',
    'CREATE INDEX idx_ticket_status ON tickets(status)',
    'CREATE INDEX idx_ticket_priority ON tickets(priority)',
    'CREATE INDEX idx_ticket_employee ON tickets(employee_email)',
    'CREATE INDEX idx_ticket_category ON tickets(category)',
    'CREATE INDEX idx_disc_ticket ON ticket_discussions(ticket_id)',
    'CREATE INDEX idx_disc_author ON ticket_discussions(author_email)',
    'CREATE INDEX idx_asset_id ON assets(asset_id)',
    'CREATE INDEX idx_asset_employee ON assets(employee_email)',
    'CREATE INDEX idx_process_category ON it_processes(category)',
  ];
  for (const sql of indexes) db.run(sql);

  // -- Seed tickets --
  const tickets = generateTickets();
  for (const t of tickets) {
    db.run(`
      INSERT INTO tickets (ticket_id, employee_email, employee_name, date, status, description, priority, category, assigned_to_email, assigned_to, resolution_time, tags, internal_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [t.ticket_id, t.employee_email, t.employee_name, t.date, t.status, t.description, t.priority, t.category, t.assigned_to_email, t.assigned_to, t.resolution_time, t.tags, t.internal_notes]);
  }
  console.log(`Seeded ${tickets.length} tickets`);

  // -- Seed discussions --
  const discussions = generateDiscussions(tickets);
  for (const d of discussions) {
    db.run(`
      INSERT INTO ticket_discussions (ticket_id, author_email, author_name, comment_type, content, is_internal, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [d.ticket_id, d.author_email, d.author_name, d.comment_type, d.content, d.is_internal, d.created_at]);
  }
  console.log(`Seeded ${discussions.length} discussions`);

  // -- Seed assets --
  const assets = generateAssets();
  for (const a of assets) {
    db.run(`
      INSERT INTO assets (asset_id, employee_email, employee_name, type, brand, model, serial_number, hostname, os, status, assigned_date, usb_enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [a.asset_id, a.employee_email, a.employee_name, a.type, a.brand, a.model, a.serial_number, a.hostname, a.os, a.status, a.assigned_date, a.usb_enabled]);
  }
  console.log(`Seeded ${assets.length} assets (Aurelien Delamarre has 2 laptops)`);

  // -- Seed IT processes --
  const processes = getITProcesses();
  for (const p of processes) {
    db.run(`
      INSERT INTO it_processes (name, category, description, steps, required_info, approval_required, approver_role, keywords)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [p.name, p.category, p.description, p.steps, p.required_info, p.approval_required, p.approver_role, p.keywords]);
  }
  console.log(`Seeded ${processes.length} IT processes`);

  // -- Write to disk --
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  db.close();

  console.log(`Database written to ${DB_PATH}`);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
