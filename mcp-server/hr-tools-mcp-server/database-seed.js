#!/usr/bin/env node

/**
 * Database Initialization Script
 * Creates and populates employees.db with HR employee data.
 * Employee IDs follow the org chart (depth-first, top to bottom).
 */

import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_PATH = path.join(__dirname, 'employees.db');

function normalize(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// --- Employee data (ordered by org chart, depth-first) ---
// EMP-001 to EMP-003: Executive Office
// EMP-004 to EMP-031: Technology
// EMP-032 to EMP-049: Sales
// EMP-050 to EMP-067: Marketing
// EMP-068 to EMP-080: Human Resources
// EMP-081 to EMP-092: Finance
// EMP-093 to EMP-095: Operations
// EMP-096 to EMP-099: Customer Support
// EMP-100: Quality

const employees = [
  // ── Executive Office ──────────────────────────────────────────────────
  { employee_id: 'EMP-001', name: 'Sarah Chen', role: 'CEO', department: 'Executive', email: 'sarah.chen@company.com', phone: '+33 1 42 00 00 01', bank_account: 'FR76 1234 5678 9012 3456 7890 001', salary: '€150,000', remaining_leave: 25, total_leave: 30, leave_taken: 5, last_leave: 'March 15, 2025', manager_id: null, manager_comments: 'Exceptional leader with strategic vision' },
  { employee_id: 'EMP-002', name: 'Iris Kim', role: 'Executive Assistant', department: 'Executive', email: 'iris.kim@company.com', phone: '+33 1 42 00 00 90', bank_account: 'FR76 1234 5678 9012 3456 7890 090', salary: '€42,000', remaining_leave: 21, total_leave: 25, leave_taken: 4, last_leave: 'September 5, 2025', manager_id: 'EMP-001', manager_comments: 'Excellent organizational skills, very reliable' },
  { employee_id: 'EMP-003', name: 'Felix Santos', role: 'Legal Counsel', department: 'Legal', email: 'felix.santos@company.com', phone: '+33 1 42 00 00 91', bank_account: 'FR76 1234 5678 9012 3456 7890 091', salary: '€85,000', remaining_leave: 16, total_leave: 28, leave_taken: 12, last_leave: 'April 10, 2025', manager_id: 'EMP-001', manager_comments: 'Strong legal expertise, good strategic advice' },

  // ── Technology ─────────────────────────────────────────────────────────
  // CTO
  { employee_id: 'EMP-004', name: 'Michael Johnson', role: 'CTO', department: 'Technology', email: 'michael.johnson@company.com', phone: '+33 1 42 00 00 02', bank_account: 'FR76 1234 5678 9012 3456 7890 002', salary: '€120,000', remaining_leave: 18, total_leave: 28, leave_taken: 10, last_leave: 'April 22, 2025', manager_id: 'EMP-001', manager_comments: 'Strong technical expertise, excellent team builder' },

  //   └─ Engineering Manager
  { employee_id: 'EMP-005', name: 'James Wilson', role: 'Engineering Manager', department: 'Technology', email: 'james.wilson@company.com', phone: '+33 1 42 00 00 09', bank_account: 'FR76 1234 5678 9012 3456 7890 009', salary: '€65,000', remaining_leave: 16, total_leave: 25, leave_taken: 9, last_leave: 'August 3, 2025', manager_id: 'EMP-004', manager_comments: 'Skilled developer, takes initiative, sometimes needs better documentation' },
  { employee_id: 'EMP-006', name: 'Yuki Tanaka', role: 'Full Stack Developer', department: 'Technology', email: 'yuki.tanaka@company.com', phone: '+33 1 42 00 00 26', bank_account: 'FR76 1234 5678 9012 3456 7890 026', salary: '€56,000', remaining_leave: 14, total_leave: 25, leave_taken: 11, last_leave: 'June 12, 2025', manager_id: 'EMP-005', manager_comments: 'Versatile developer, good problem solver' },
  { employee_id: 'EMP-007', name: 'Aria Patel', role: 'Intern Developer', department: 'Technology', email: 'aria.patel@company.com', phone: '+33 1 42 00 00 80', bank_account: 'FR76 1234 5678 9012 3456 7890 080', salary: '€28,000', remaining_leave: 25, total_leave: 25, leave_taken: 0, last_leave: null, manager_id: 'EMP-006', manager_comments: 'Promising talent, needs mentoring' },
  { employee_id: 'EMP-008', name: 'Sebastian Andersson', role: 'Backend Developer', department: 'Technology', email: 'sebastian.andersson@company.com', phone: '+33 1 42 00 00 27', bank_account: 'FR76 1234 5678 9012 3456 7890 027', salary: '€54,000', remaining_leave: 18, total_leave: 25, leave_taken: 7, last_leave: 'July 18, 2025', manager_id: 'EMP-005', manager_comments: 'Solid backend expertise, good code quality' },
  { employee_id: 'EMP-009', name: 'Sophia Clarke', role: 'Junior Developer', department: 'Technology', email: 'sophia.clarke@company.com', phone: '+33 1 42 00 00 78', bank_account: 'FR76 1234 5678 9012 3456 7890 078', salary: '€42,000', remaining_leave: 16, total_leave: 25, leave_taken: 9, last_leave: 'August 1, 2025', manager_id: 'EMP-008', manager_comments: 'Fast learner, enthusiastic, needs more experience' },
  { employee_id: 'EMP-010', name: 'Elena Popov', role: 'Frontend Developer', department: 'Technology', email: 'elena.popov@company.com', phone: '+33 1 42 00 00 28', bank_account: 'FR76 1234 5678 9012 3456 7890 028', salary: '€52,000', remaining_leave: 21, total_leave: 25, leave_taken: 4, last_leave: 'August 25, 2025', manager_id: 'EMP-005', manager_comments: 'Creative UI solutions, some performance concerns' },
  { employee_id: 'EMP-011', name: "Liam O'Connor", role: 'Junior Frontend Developer', department: 'Technology', email: 'liam.oconnor@company.com', phone: '+33 1 42 00 00 79', bank_account: 'FR76 1234 5678 9012 3456 7890 079', salary: '€40,000', remaining_leave: 14, total_leave: 25, leave_taken: 11, last_leave: 'June 12, 2025', manager_id: 'EMP-010', manager_comments: 'Good at UI, sometimes struggles with complex logic' },
  { employee_id: 'EMP-012', name: 'Mohammed Benali', role: 'QA Engineer', department: 'Technology', email: 'mohammed.benali@company.com', phone: '+33 1 42 00 00 29', bank_account: 'FR76 1234 5678 9012 3456 7890 029', salary: '€49,000', remaining_leave: 17, total_leave: 25, leave_taken: 8, last_leave: 'May 8, 2025', manager_id: 'EMP-005', manager_comments: 'Thorough testing approach, identifies edge cases well' },
  { employee_id: 'EMP-013', name: 'Noah Kim', role: 'QA Intern', department: 'Technology', email: 'noah.kim@company.com', phone: '+33 1 42 00 00 81', bank_account: 'FR76 1234 5678 9012 3456 7890 081', salary: '€26,000', remaining_leave: 23, total_leave: 25, leave_taken: 2, last_leave: 'September 18, 2025', manager_id: 'EMP-012', manager_comments: 'Meticulous tester, good attention to detail' },
  { employee_id: 'EMP-014', name: 'Isabella Santos', role: 'Mobile Developer', department: 'Technology', email: 'isabella.santos@company.com', phone: '+33 1 42 00 00 30', bank_account: 'FR76 1234 5678 9012 3456 7890 030', salary: '€53,000', remaining_leave: 13, total_leave: 25, leave_taken: 12, last_leave: 'June 25, 2025', manager_id: 'EMP-005', manager_comments: 'Fast learner, excellent at mobile frameworks' },

  //   └─ Product Manager
  { employee_id: 'EMP-015', name: 'Maria Garcia', role: 'Product Manager', department: 'Technology', email: 'maria.garcia@company.com', phone: '+33 1 42 00 00 10', bank_account: 'FR76 1234 5678 9012 3456 7890 010', salary: '€70,000', remaining_leave: 19, total_leave: 28, leave_taken: 9, last_leave: 'July 28, 2025', manager_id: 'EMP-004', manager_comments: 'Strategic thinker, good at prioritization' },
  { employee_id: 'EMP-016', name: 'Felipe Silva', role: 'Product Owner', department: 'Technology', email: 'felipe.silva@company.com', phone: '+33 1 42 00 00 39', bank_account: 'FR76 1234 5678 9012 3456 7890 039', salary: '€58,000', remaining_leave: 14, total_leave: 25, leave_taken: 11, last_leave: 'April 25, 2025', manager_id: 'EMP-015', manager_comments: 'Visionary product thinking, good backlog prioritization' },
  { employee_id: 'EMP-017', name: 'Samantha Lee', role: 'Business Analyst', department: 'Technology', email: 'samantha.lee@company.com', phone: '+33 1 42 00 00 38', bank_account: 'FR76 1234 5678 9012 3456 7890 038', salary: '€52,000', remaining_leave: 22, total_leave: 25, leave_taken: 3, last_leave: 'July 30, 2025', manager_id: 'EMP-015', manager_comments: 'Logical thinker, good requirements gathering' },
  { employee_id: 'EMP-018', name: 'Nadia Kone', role: 'Scrum Master', department: 'Technology', email: 'nadia.kone@company.com', phone: '+33 1 42 00 00 40', bank_account: 'FR76 1234 5678 9012 3456 7890 040', salary: '€54,000', remaining_leave: 17, total_leave: 25, leave_taken: 8, last_leave: 'June 18, 2025', manager_id: 'EMP-015', manager_comments: 'Effective at removing blockers, good team facilitator' },
  { employee_id: 'EMP-019', name: 'Anton Kozlov', role: 'Data Scientist', department: 'Technology', email: 'anton.kozlov@company.com', phone: '+33 1 42 00 00 37', bank_account: 'FR76 1234 5678 9012 3456 7890 037', salary: '€64,000', remaining_leave: 18, total_leave: 25, leave_taken: 7, last_leave: 'May 18, 2025', manager_id: 'EMP-015', manager_comments: 'Strong statistical knowledge, good model development' },
  { employee_id: 'EMP-020', name: 'Ravi Sharma', role: 'Business Intelligence Analyst', department: 'Technology', email: 'ravi.sharma@company.com', phone: '+33 1 42 00 00 99', bank_account: 'FR76 1234 5678 9012 3456 7890 099', salary: '€55,000', remaining_leave: 11, total_leave: 25, leave_taken: 14, last_leave: 'March 25, 2025', manager_id: 'EMP-019', manager_comments: 'Excellent data visualization, good insights' },
  { employee_id: 'EMP-021', name: 'Maya Chen', role: 'Data Analyst Intern', department: 'Technology', email: 'maya.chen@company.com', phone: '+33 1 42 00 00 82', bank_account: 'FR76 1234 5678 9012 3456 7890 082', salary: '€30,000', remaining_leave: 20, total_leave: 25, leave_taken: 5, last_leave: 'July 28, 2025', manager_id: 'EMP-019', manager_comments: 'Analytical mindset, quick learner' },

  //   └─ Infrastructure Manager
  { employee_id: 'EMP-022', name: 'Robert Taylor', role: 'Infrastructure Manager', department: 'Technology', email: 'robert.taylor@company.com', phone: '+33 1 42 00 00 11', bank_account: 'FR76 1234 5678 9012 3456 7890 011', salary: '€58,000', remaining_leave: 14, total_leave: 25, leave_taken: 11, last_leave: 'May 22, 2025', manager_id: 'EMP-004', manager_comments: 'Reliable infrastructure expert, responds well to challenges' },
  { employee_id: 'EMP-023', name: 'Dmitri Volkov', role: 'System Administrator', department: 'Technology', email: 'dmitri.volkov@company.com', phone: '+33 1 42 00 00 31', bank_account: 'FR76 1234 5678 9012 3456 7890 031', salary: '€51,000', remaining_leave: 19, total_leave: 25, leave_taken: 6, last_leave: 'April 5, 2025', manager_id: 'EMP-022', manager_comments: 'Proactive infrastructure management, good security mindset' },
  { employee_id: 'EMP-024', name: 'Diego Martinez', role: 'IT Support Specialist', department: 'Technology', email: 'diego.martinez@company.com', phone: '+33 1 42 00 00 93', bank_account: 'FR76 1234 5678 9012 3456 7890 093', salary: '€41,000', remaining_leave: 19, total_leave: 25, leave_taken: 6, last_leave: 'August 8, 2025', manager_id: 'EMP-023', manager_comments: 'Patient with users, good troubleshooting' },
  { employee_id: 'EMP-025', name: 'Chloe Williams', role: 'Cloud Engineer', department: 'Technology', email: 'chloe.williams@company.com', phone: '+33 1 42 00 00 32', bank_account: 'FR76 1234 5678 9012 3456 7890 032', salary: '€57,000', remaining_leave: 16, total_leave: 25, leave_taken: 9, last_leave: 'July 2, 2025', manager_id: 'EMP-022', manager_comments: 'Expert in cloud platforms, good cost optimization' },
  { employee_id: 'EMP-026', name: 'Lars Eriksson', role: 'Security Engineer', department: 'Technology', email: 'lars.eriksson@company.com', phone: '+33 1 42 00 00 33', bank_account: 'FR76 1234 5678 9012 3456 7890 033', salary: '€62,000', remaining_leave: 11, total_leave: 25, leave_taken: 14, last_leave: 'March 22, 2025', manager_id: 'EMP-022', manager_comments: 'Security-first mindset, thorough vulnerability assessments' },

  //   └─ Design Lead
  { employee_id: 'EMP-027', name: 'Anna Kowalski', role: 'Design Lead', department: 'Technology', email: 'anna.kowalski@company.com', phone: '+33 1 42 00 00 12', bank_account: 'FR76 1234 5678 9012 3456 7890 012', salary: '€52,000', remaining_leave: 21, total_leave: 25, leave_taken: 4, last_leave: 'March 8, 2025', manager_id: 'EMP-004', manager_comments: 'Creative and detail-focused, excellent user empathy' },
  { employee_id: 'EMP-028', name: 'Giovanna Ferrari', role: 'UI/UX Designer', department: 'Technology', email: 'giovanna.ferrari@company.com', phone: '+33 1 42 00 00 34', bank_account: 'FR76 1234 5678 9012 3456 7890 034', salary: '€50,000', remaining_leave: 24, total_leave: 25, leave_taken: 1, last_leave: 'September 8, 2025', manager_id: 'EMP-027', manager_comments: 'Excellent design thinking, great user research' },
  { employee_id: 'EMP-029', name: 'Lila Nguyen', role: 'Product Designer', department: 'Technology', email: 'lila.nguyen@company.com', phone: '+33 1 42 00 00 36', bank_account: 'FR76 1234 5678 9012 3456 7890 036', salary: '€48,000', remaining_leave: 15, total_leave: 25, leave_taken: 10, last_leave: 'June 8, 2025', manager_id: 'EMP-027', manager_comments: 'Good design systems knowledge, collaborative spirit' },
  { employee_id: 'EMP-030', name: 'Ryan Mitchell', role: 'Graphic Designer', department: 'Technology', email: 'ryan.mitchell@company.com', phone: '+33 1 42 00 00 35', bank_account: 'FR76 1234 5678 9012 3456 7890 035', salary: '€44,000', remaining_leave: 20, total_leave: 25, leave_taken: 5, last_leave: 'August 15, 2025', manager_id: 'EMP-027', manager_comments: 'Talented artist, sometimes struggles with technical constraints' },
  { employee_id: 'EMP-031', name: 'Cora Nielsen', role: 'Design Intern', department: 'Technology', email: 'cora.nielsen@company.com', phone: '+33 1 42 00 00 84', bank_account: 'FR76 1234 5678 9012 3456 7890 084', salary: '€27,000', remaining_leave: 18, total_leave: 25, leave_taken: 7, last_leave: 'June 25, 2025', manager_id: 'EMP-030', manager_comments: 'Natural design talent, good eye for aesthetics' },

  // ── Sales ──────────────────────────────────────────────────────────────
  // VP Sales
  { employee_id: 'EMP-032', name: 'Emma Rodriguez', role: 'VP Sales', department: 'Sales', email: 'emma.rodriguez@company.com', phone: '+33 1 42 00 00 03', bank_account: 'FR76 1234 5678 9012 3456 7890 003', salary: '€110,000', remaining_leave: 22, total_leave: 30, leave_taken: 8, last_leave: 'May 10, 2025', manager_id: 'EMP-001', manager_comments: 'Outstanding sales performance, natural leader' },

  //   └─ Pre-Sales Director
  { employee_id: 'EMP-033', name: 'Sophie Martin', role: 'Pre-Sales Director', department: 'Sales', email: 'sophie.martin@company.com', phone: '+33 1 42 00 00 07', bank_account: 'FR76 1234 5678 9012 3456 7890 007', salary: '€75,000', remaining_leave: 27, total_leave: 30, leave_taken: 3, last_leave: 'January 25, 2025', manager_id: 'EMP-032', manager_comments: 'Excellent client relations, very knowledgeable' },
  { employee_id: 'EMP-034', name: 'Aurélien Delamarre', role: 'Pre-Sales Engineer', department: 'Sales', email: 'aurelien.delamarre@company.com', phone: '+33 1 42 00 00 08', bank_account: 'FR76 1234 5678 9012 3456 7890 008', salary: '€46,000', remaining_leave: 12, total_leave: 25, leave_taken: 13, last_leave: 'June 15, 2025', manager_id: 'EMP-033', manager_comments: 'High potential, proactive learner, could improve on deadline management' },
  { employee_id: 'EMP-035', name: 'Oliver Brown', role: 'Sales Engineer', department: 'Sales', email: 'oliver.brown@company.com', phone: '+33 1 42 00 00 41', bank_account: 'FR76 1234 5678 9012 3456 7890 041', salary: '€51,000', remaining_leave: 13, total_leave: 25, leave_taken: 12, last_leave: 'May 12, 2025', manager_id: 'EMP-033', manager_comments: 'Good technical knowledge, effective sales closer' },
  { employee_id: 'EMP-036', name: 'Valentina Rossi', role: 'Technical Writer', department: 'Sales', email: 'valentina.rossi@company.com', phone: '+33 1 42 00 00 42', bank_account: 'FR76 1234 5678 9012 3456 7890 042', salary: '€44,000', remaining_leave: 21, total_leave: 25, leave_taken: 4, last_leave: 'August 8, 2025', manager_id: 'EMP-033', manager_comments: 'Clear communicator, sometimes lacks technical depth' },
  { employee_id: 'EMP-037', name: 'Hiroshi Yamamoto', role: 'Solutions Architect', department: 'Sales', email: 'hiroshi.yamamoto@company.com', phone: '+33 1 42 00 00 43', bank_account: 'FR76 1234 5678 9012 3456 7890 043', salary: '€67,000', remaining_leave: 19, total_leave: 28, leave_taken: 9, last_leave: 'March 28, 2025', manager_id: 'EMP-033', manager_comments: 'Expert-level technical knowledge, excellent presentations' },

  //   └─ Sales Manager
  { employee_id: 'EMP-038', name: 'Jean-Pierre Moreau', role: 'Sales Manager', department: 'Sales', email: 'jp.moreau@company.com', phone: '+33 1 42 00 00 13', bank_account: 'FR76 1234 5678 9012 3456 7890 013', salary: '€68,000', remaining_leave: 17, total_leave: 28, leave_taken: 11, last_leave: 'April 12, 2025', manager_id: 'EMP-032', manager_comments: 'Motivating leader, good at sales strategy' },
  { employee_id: 'EMP-039', name: 'Alexandra Petrov', role: 'Account Executive', department: 'Sales', email: 'alexandra.petrov@company.com', phone: '+33 1 42 00 00 14', bank_account: 'FR76 1234 5678 9012 3456 7890 014', salary: '€48,000', remaining_leave: 23, total_leave: 25, leave_taken: 2, last_leave: 'September 5, 2025', manager_id: 'EMP-038', manager_comments: 'Great with clients, consistent performer' },
  { employee_id: 'EMP-040', name: 'Carlos Mendoza', role: 'Sales Development Rep', department: 'Sales', email: 'carlos.mendoza@company.com', phone: '+33 1 42 00 00 15', bank_account: 'FR76 1234 5678 9012 3456 7890 015', salary: '€38,000', remaining_leave: 11, total_leave: 25, leave_taken: 14, last_leave: 'June 20, 2025', manager_id: 'EMP-038', manager_comments: 'Energetic and driven, needs to improve follow-up' },
  { employee_id: 'EMP-041', name: 'Grace Adams', role: 'Customer Success Manager', department: 'Sales', email: 'grace.adams@company.com', phone: '+33 1 42 00 00 44', bank_account: 'FR76 1234 5678 9012 3456 7890 044', salary: '€49,000', remaining_leave: 16, total_leave: 25, leave_taken: 9, last_leave: 'July 5, 2025', manager_id: 'EMP-038', manager_comments: 'Empathetic customer advocate, good at retention' },
  { employee_id: 'EMP-042', name: 'Maxime Dubois', role: 'Account Manager', department: 'Sales', email: 'maxime.dubois@company.com', phone: '+33 1 42 00 00 45', bank_account: 'FR76 1234 5678 9012 3456 7890 045', salary: '€47,000', remaining_leave: 12, total_leave: 25, leave_taken: 13, last_leave: 'June 22, 2025', manager_id: 'EMP-038', manager_comments: 'Good relationship builder, average at upselling' },
  { employee_id: 'EMP-043', name: 'Zara Ahmed', role: 'Inside Sales Rep', department: 'Sales', email: 'zara.ahmed@company.com', phone: '+33 1 42 00 00 46', bank_account: 'FR76 1234 5678 9012 3456 7890 046', salary: '€39,000', remaining_leave: 25, total_leave: 25, leave_taken: 0, last_leave: null, manager_id: 'EMP-038', manager_comments: 'Persistent and motivated, needs to work on objection handling' },
  { employee_id: 'EMP-044', name: 'Jacob Miller', role: 'Sales Coordinator', department: 'Sales', email: 'jacob.miller@company.com', phone: '+33 1 42 00 00 47', bank_account: 'FR76 1234 5678 9012 3456 7890 047', salary: '€36,000', remaining_leave: 18, total_leave: 25, leave_taken: 7, last_leave: 'August 18, 2025', manager_id: 'EMP-038', manager_comments: 'Organized and efficient, good at supporting sales team' },
  { employee_id: 'EMP-045', name: 'Leon Muller', role: 'Sales Intern', department: 'Sales', email: 'leon.muller@company.com', phone: '+33 1 42 00 00 85', bank_account: 'FR76 1234 5678 9012 3456 7890 085', salary: '€24,000', remaining_leave: 22, total_leave: 25, leave_taken: 3, last_leave: 'September 8, 2025', manager_id: 'EMP-044', manager_comments: 'Enthusiastic, needs to develop sales skills' },

  //   └─ Regional Sales Manager
  { employee_id: 'EMP-046', name: 'Anya Volková', role: 'Regional Sales Manager', department: 'Sales', email: 'anya.volkova@company.com', phone: '+33 1 42 00 00 48', bank_account: 'FR76 1234 5678 9012 3456 7890 048', salary: '€62,000', remaining_leave: 11, total_leave: 28, leave_taken: 17, last_leave: 'April 15, 2025', manager_id: 'EMP-032', manager_comments: 'Aggressive sales targets, sometimes lacks team focus' },
  { employee_id: 'EMP-047', name: 'Lucas Garcia', role: 'Enterprise Sales Rep', department: 'Sales', email: 'lucas.garcia@company.com', phone: '+33 1 42 00 00 49', bank_account: 'FR76 1234 5678 9012 3456 7890 049', salary: '€52,000', remaining_leave: 20, total_leave: 25, leave_taken: 5, last_leave: 'September 2, 2025', manager_id: 'EMP-046', manager_comments: 'Strong closer, good at complex negotiations' },
  { employee_id: 'EMP-048', name: 'Emma Johnson', role: 'Channel Partner Manager', department: 'Sales', email: 'emma.johnson@company.com', phone: '+33 1 42 00 00 50', bank_account: 'FR76 1234 5678 9012 3456 7890 050', salary: '€48,000', remaining_leave: 14, total_leave: 25, leave_taken: 11, last_leave: 'May 28, 2025', manager_id: 'EMP-046', manager_comments: 'Excellent at partner relations, proactive' },

  //   └─ Partnership Manager
  { employee_id: 'EMP-049', name: 'Nora Larsson', role: 'Partnership Manager', department: 'Business Development', email: 'nora.larsson@company.com', phone: '+33 1 42 01 00 00', bank_account: 'FR76 1234 5678 9012 3456 7890 100', salary: '€53,000', remaining_leave: 17, total_leave: 25, leave_taken: 8, last_leave: 'June 2, 2025', manager_id: 'EMP-032', manager_comments: 'Strategic partner relations, good negotiations' },

  // ── Marketing ──────────────────────────────────────────────────────────
  // VP Marketing
  { employee_id: 'EMP-050', name: 'David Kim', role: 'VP Marketing', department: 'Marketing', email: 'david.kim@company.com', phone: '+33 1 42 00 00 04', bank_account: 'FR76 1234 5678 9012 3456 7890 004', salary: '€105,000', remaining_leave: 20, total_leave: 28, leave_taken: 8, last_leave: 'June 5, 2025', manager_id: 'EMP-001', manager_comments: 'Creative thinker, good communication skills' },

  //   └─ Marketing Manager
  { employee_id: 'EMP-051', name: 'Priya Patel', role: 'Marketing Manager', department: 'Marketing', email: 'priya.patel@company.com', phone: '+33 1 42 00 00 16', bank_account: 'FR76 1234 5678 9012 3456 7890 016', salary: '€55,000', remaining_leave: 18, total_leave: 25, leave_taken: 7, last_leave: 'July 8, 2025', manager_id: 'EMP-050', manager_comments: 'Results-oriented, good campaign management' },
  { employee_id: 'EMP-052', name: 'Marco Rossi', role: 'Content Manager', department: 'Marketing', email: 'marco.rossi@company.com', phone: '+33 1 42 00 00 17', bank_account: 'FR76 1234 5678 9012 3456 7890 017', salary: '€45,000', remaining_leave: 13, total_leave: 25, leave_taken: 12, last_leave: 'May 15, 2025', manager_id: 'EMP-051', manager_comments: 'Creative writer, some delays in deliverables' },
  { employee_id: 'EMP-053', name: 'Igor Petrov', role: 'Video Producer', department: 'Marketing', email: 'igor.petrov@company.com', phone: '+33 1 42 00 00 57', bank_account: 'FR76 1234 5678 9012 3456 7890 057', salary: '€48,000', remaining_leave: 21, total_leave: 25, leave_taken: 4, last_leave: 'September 10, 2025', manager_id: 'EMP-052', manager_comments: 'Creative vision, sometimes over-budget' },
  { employee_id: 'EMP-054', name: 'Charlotte Davis', role: 'Copywriter', department: 'Marketing', email: 'charlotte.davis@company.com', phone: '+33 1 42 00 00 58', bank_account: 'FR76 1234 5678 9012 3456 7890 058', salary: '€42,000', remaining_leave: 14, total_leave: 25, leave_taken: 11, last_leave: 'July 25, 2025', manager_id: 'EMP-052', manager_comments: 'Excellent storytelling, persuasive writing' },
  { employee_id: 'EMP-055', name: 'Mateo Lopez', role: 'Content Creator', department: 'Marketing', email: 'mateo.lopez@company.com', phone: '+33 1 42 00 00 59', bank_account: 'FR76 1234 5678 9012 3456 7890 059', salary: '€38,000', remaining_leave: 18, total_leave: 25, leave_taken: 7, last_leave: 'August 5, 2025', manager_id: 'EMP-052', manager_comments: 'Engaging content, sometimes inconsistent quality' },
  { employee_id: 'EMP-056', name: 'Nicole Thompson', role: 'Social Media Manager', department: 'Marketing', email: 'nicole.thompson@company.com', phone: '+33 1 42 00 00 18', bank_account: 'FR76 1234 5678 9012 3456 7890 018', salary: '€42,000', remaining_leave: 20, total_leave: 25, leave_taken: 5, last_leave: 'August 10, 2025', manager_id: 'EMP-051', manager_comments: 'Engaging content creator, good audience engagement' },
  { employee_id: 'EMP-057', name: 'Hannah Wilson', role: 'Community Manager', department: 'Marketing', email: 'hannah.wilson@company.com', phone: '+33 1 42 00 00 60', bank_account: 'FR76 1234 5678 9012 3456 7890 060', salary: '€40,000', remaining_leave: 22, total_leave: 25, leave_taken: 3, last_leave: 'September 15, 2025', manager_id: 'EMP-056', manager_comments: 'Genuine engagement, good at fostering community' },
  { employee_id: 'EMP-058', name: 'Alex Thompson', role: 'Influencer Manager', department: 'Marketing', email: 'alex.thompson@company.com', phone: '+33 1 42 00 00 61', bank_account: 'FR76 1234 5678 9012 3456 7890 061', salary: '€44,000', remaining_leave: 13, total_leave: 25, leave_taken: 12, last_leave: 'June 5, 2025', manager_id: 'EMP-056', manager_comments: 'Good relationship builder, decent negotiator' },
  { employee_id: 'EMP-059', name: 'Zoe Martin', role: 'Social Media Coordinator', department: 'Marketing', email: 'zoe.martin@company.com', phone: '+33 1 42 00 00 62', bank_account: 'FR76 1234 5678 9012 3456 7890 062', salary: '€37,000', remaining_leave: 25, total_leave: 25, leave_taken: 0, last_leave: null, manager_id: 'EMP-056', manager_comments: 'Good at routine tasks, limited strategic thinking' },
  { employee_id: 'EMP-060', name: 'Hans Mueller', role: 'Digital Marketing Lead', department: 'Marketing', email: 'hans.mueller@company.com', phone: '+33 1 42 00 00 19', bank_account: 'FR76 1234 5678 9012 3456 7890 019', salary: '€40,000', remaining_leave: 24, total_leave: 25, leave_taken: 1, last_leave: 'September 12, 2025', manager_id: 'EMP-051', manager_comments: 'Analytical thinker, good ROI optimization' },
  { employee_id: 'EMP-061', name: 'Mia Andersson', role: 'SEO Specialist', department: 'Marketing', email: 'mia.andersson@company.com', phone: '+33 1 42 00 00 52', bank_account: 'FR76 1234 5678 9012 3456 7890 052', salary: '€41,000', remaining_leave: 23, total_leave: 25, leave_taken: 2, last_leave: 'August 28, 2025', manager_id: 'EMP-060', manager_comments: 'Expert in SEO strategies, consistent results' },
  { employee_id: 'EMP-062', name: 'Daniel Park', role: 'PPC Specialist', department: 'Marketing', email: 'daniel.park@company.com', phone: '+33 1 42 00 00 53', bank_account: 'FR76 1234 5678 9012 3456 7890 053', salary: '€43,000', remaining_leave: 15, total_leave: 25, leave_taken: 10, last_leave: 'July 12, 2025', manager_id: 'EMP-060', manager_comments: 'Good at budget optimization, data-driven' },
  { employee_id: 'EMP-063', name: 'Sofia Hernandez', role: 'Email Marketing Specialist', department: 'Marketing', email: 'sofia.hernandez@company.com', phone: '+33 1 42 00 00 54', bank_account: 'FR76 1234 5678 9012 3456 7890 054', salary: '€39,000', remaining_leave: 19, total_leave: 25, leave_taken: 6, last_leave: 'June 28, 2025', manager_id: 'EMP-060', manager_comments: 'Creative email campaigns, good segmentation' },
  { employee_id: 'EMP-064', name: 'Rafael Costa', role: 'Brand Manager', department: 'Marketing', email: 'rafael.costa@company.com', phone: '+33 1 42 00 00 51', bank_account: 'FR76 1234 5678 9012 3456 7890 051', salary: '€50,000', remaining_leave: 17, total_leave: 25, leave_taken: 8, last_leave: 'June 10, 2025', manager_id: 'EMP-051', manager_comments: 'Good brand strategy, creative campaigns' },
  { employee_id: 'EMP-065', name: 'Benjamin White', role: 'Marketing Analyst', department: 'Marketing', email: 'benjamin.white@company.com', phone: '+33 1 42 00 00 55', bank_account: 'FR76 1234 5678 9012 3456 7890 055', salary: '€45,000', remaining_leave: 12, total_leave: 25, leave_taken: 13, last_leave: 'April 8, 2025', manager_id: 'EMP-051', manager_comments: 'Detail-oriented, good at reporting' },
  { employee_id: 'EMP-066', name: 'Ethan Wright', role: 'Marketing Intern', department: 'Marketing', email: 'ethan.wright@company.com', phone: '+33 1 42 00 00 83', bank_account: 'FR76 1234 5678 9012 3456 7890 083', salary: '€25,000', remaining_leave: 24, total_leave: 25, leave_taken: 1, last_leave: 'August 30, 2025', manager_id: 'EMP-065', manager_comments: 'Eager to learn, needs more confidence' },
  { employee_id: 'EMP-067', name: 'Katarina Novak', role: 'Event Manager', department: 'Marketing', email: 'katarina.novak@company.com', phone: '+33 1 42 00 00 56', bank_account: 'FR76 1234 5678 9012 3456 7890 056', salary: '€47,000', remaining_leave: 16, total_leave: 25, leave_taken: 9, last_leave: 'May 20, 2025', manager_id: 'EMP-051', manager_comments: 'Excellent event coordination, good logistics' },

  // ── Human Resources ────────────────────────────────────────────────────
  // HR Director
  { employee_id: 'EMP-068', name: 'Lisa Wang', role: 'HR Director', department: 'Human Resources', email: 'lisa.wang@company.com', phone: '+33 1 42 00 00 05', bank_account: 'FR76 1234 5678 9012 3456 7890 005', salary: '€95,000', remaining_leave: 15, total_leave: 25, leave_taken: 10, last_leave: 'July 12, 2025', manager_id: 'EMP-001', manager_comments: 'Empathetic and fair, advocates for employee wellbeing' },

  //   └─ HR Manager
  { employee_id: 'EMP-069', name: 'Camille Laurent', role: 'HR Manager', department: 'Human Resources', email: 'camille.laurent@company.com', phone: '+33 1 42 00 00 20', bank_account: 'FR76 1234 5678 9012 3456 7890 020', salary: '€50,000', remaining_leave: 16, total_leave: 25, leave_taken: 9, last_leave: 'April 28, 2025', manager_id: 'EMP-068', manager_comments: 'Fair and consistent, good conflict resolution' },
  { employee_id: 'EMP-070', name: "Kevin O'Brien", role: 'Recruiter', department: 'Human Resources', email: 'kevin.obrien@company.com', phone: '+33 1 42 00 00 21', bank_account: 'FR76 1234 5678 9012 3456 7890 021', salary: '€43,000', remaining_leave: 22, total_leave: 25, leave_taken: 3, last_leave: 'July 22, 2025', manager_id: 'EMP-069', manager_comments: 'Excellent talent sourcing skills' },
  { employee_id: 'EMP-071', name: 'Isabella Brown', role: 'Talent Acquisition Specialist', department: 'Human Resources', email: 'isabella.brown@company.com', phone: '+33 1 42 00 00 68', bank_account: 'FR76 1234 5678 9012 3456 7890 068', salary: '€43,000', remaining_leave: 20, total_leave: 25, leave_taken: 5, last_leave: 'September 20, 2025', manager_id: 'EMP-070', manager_comments: 'Good source quality, needs to improve interview skills' },
  { employee_id: 'EMP-072', name: 'Oscar Lindqvist', role: 'Senior Recruiter', department: 'Human Resources', email: 'oscar.lindqvist@company.com', phone: '+33 1 42 00 00 69', bank_account: 'FR76 1234 5678 9012 3456 7890 069', salary: '€47,000', remaining_leave: 12, total_leave: 25, leave_taken: 13, last_leave: 'May 5, 2025', manager_id: 'EMP-070', manager_comments: 'Experienced and strategic, excellent placement rates' },
  { employee_id: 'EMP-073', name: 'Fatima Al-Rashid', role: 'HR Business Partner', department: 'Human Resources', email: 'fatima.alrashid@company.com', phone: '+33 1 42 00 00 22', bank_account: 'FR76 1234 5678 9012 3456 7890 022', salary: '€47,000', remaining_leave: 19, total_leave: 25, leave_taken: 6, last_leave: 'June 3, 2025', manager_id: 'EMP-069', manager_comments: 'Strategic HR thinking, good stakeholder management' },
  { employee_id: 'EMP-074', name: 'Jasmine Taylor', role: 'Employee Relations Specialist', department: 'Human Resources', email: 'jasmine.taylor@company.com', phone: '+33 1 42 00 00 66', bank_account: 'FR76 1234 5678 9012 3456 7890 066', salary: '€48,000', remaining_leave: 16, total_leave: 25, leave_taken: 9, last_leave: 'June 30, 2025', manager_id: 'EMP-073', manager_comments: 'Diplomatic, good at conflict resolution' },
  { employee_id: 'EMP-075', name: 'Julian Schmidt', role: 'Training Manager', department: 'Human Resources', email: 'julian.schmidt@company.com', phone: '+33 1 42 00 00 63', bank_account: 'FR76 1234 5678 9012 3456 7890 063', salary: '€52,000', remaining_leave: 17, total_leave: 25, leave_taken: 8, last_leave: 'May 25, 2025', manager_id: 'EMP-069', manager_comments: 'Good at training design, poor at follow-up' },
  { employee_id: 'EMP-076', name: 'Marcus Johnson', role: 'L&D Specialist', department: 'Human Resources', email: 'marcus.johnson@company.com', phone: '+33 1 42 00 00 67', bank_account: 'FR76 1234 5678 9012 3456 7890 067', salary: '€45,000', remaining_leave: 14, total_leave: 25, leave_taken: 11, last_leave: 'August 12, 2025', manager_id: 'EMP-075', manager_comments: 'Passionate about learning, good facilitator' },
  { employee_id: 'EMP-077', name: 'Zara Wilson', role: 'HR Intern', department: 'Human Resources', email: 'zara.wilson@company.com', phone: '+33 1 42 00 00 86', bank_account: 'FR76 1234 5678 9012 3456 7890 086', salary: '€26,000', remaining_leave: 19, total_leave: 25, leave_taken: 6, last_leave: 'August 15, 2025', manager_id: 'EMP-076', manager_comments: 'Organized, good at administrative tasks' },
  { employee_id: 'EMP-078', name: 'Leila Mansouri', role: 'Compensation Analyst', department: 'Human Resources', email: 'leila.mansouri@company.com', phone: '+33 1 42 00 00 64', bank_account: 'FR76 1234 5678 9012 3456 7890 064', salary: '€46,000', remaining_leave: 19, total_leave: 25, leave_taken: 6, last_leave: 'July 15, 2025', manager_id: 'EMP-069', manager_comments: 'Analytical, good at compensation benchmarking' },
  { employee_id: 'EMP-079', name: 'Victor Ivanov', role: 'HRIS Specialist', department: 'Human Resources', email: 'victor.ivanov@company.com', phone: '+33 1 42 00 00 65', bank_account: 'FR76 1234 5678 9012 3456 7890 065', salary: '€44,000', remaining_leave: 11, total_leave: 25, leave_taken: 14, last_leave: 'April 2, 2025', manager_id: 'EMP-069', manager_comments: 'Technical expertise, good system management' },

  //   └─ D&I Specialist
  { employee_id: 'EMP-080', name: 'Maya Singh', role: 'Diversity & Inclusion Specialist', department: 'Human Resources', email: 'maya.singh@company.com', phone: '+33 1 42 00 00 70', bank_account: 'FR76 1234 5678 9012 3456 7890 070', salary: '€49,000', remaining_leave: 18, total_leave: 25, leave_taken: 7, last_leave: 'July 8, 2025', manager_id: 'EMP-068', manager_comments: 'Committed to inclusion, good program management' },

  // ── Finance ────────────────────────────────────────────────────────────
  // Finance Director
  { employee_id: 'EMP-081', name: 'Thomas Dubois', role: 'Finance Director', department: 'Finance', email: 'thomas.dubois@company.com', phone: '+33 1 42 00 00 06', bank_account: 'FR76 1234 5678 9012 3456 7890 006', salary: '€98,000', remaining_leave: 28, total_leave: 30, leave_taken: 2, last_leave: 'February 18, 2025', manager_id: 'EMP-001', manager_comments: 'Meticulous with numbers, detail-oriented' },

  //   └─ Accounting
  { employee_id: 'EMP-082', name: 'Pierre Lefevre', role: 'Accountant', department: 'Finance', email: 'pierre.lefevre@company.com', phone: '+33 1 42 00 00 23', bank_account: 'FR76 1234 5678 9012 3456 7890 023', salary: '€48,000', remaining_leave: 15, total_leave: 25, leave_taken: 10, last_leave: 'May 30, 2025', manager_id: 'EMP-081', manager_comments: 'Accurate and dependable, good attention to detail' },
  { employee_id: 'EMP-083', name: 'Fernando Gutierrez', role: 'Senior Accountant', department: 'Finance', email: 'fernando.gutierrez@company.com', phone: '+33 1 42 00 00 71', bank_account: 'FR76 1234 5678 9012 3456 7890 071', salary: '€52,000', remaining_leave: 15, total_leave: 25, leave_taken: 10, last_leave: 'June 18, 2025', manager_id: 'EMP-082', manager_comments: 'Expert accountant, good mentorship' },
  { employee_id: 'EMP-084', name: 'Christina Wong', role: 'Accounts Payable Specialist', department: 'Finance', email: 'christina.wong@company.com', phone: '+33 1 42 00 00 72', bank_account: 'FR76 1234 5678 9012 3456 7890 072', salary: '€38,000', remaining_leave: 22, total_leave: 25, leave_taken: 3, last_leave: 'August 22, 2025', manager_id: 'EMP-082', manager_comments: 'Efficient at payables, sometimes slow at problem solving' },
  { employee_id: 'EMP-085', name: 'Adam Foster', role: 'Finance Intern', department: 'Finance', email: 'adam.foster@company.com', phone: '+33 1 42 00 00 87', bank_account: 'FR76 1234 5678 9012 3456 7890 087', salary: '€25,000', remaining_leave: 15, total_leave: 25, leave_taken: 10, last_leave: 'July 20, 2025', manager_id: 'EMP-084', manager_comments: 'Good with numbers, needs to improve communication' },
  { employee_id: 'EMP-086', name: 'Gabriel Morin', role: 'Accounts Receivable Specialist', department: 'Finance', email: 'gabriel.morin@company.com', phone: '+33 1 42 00 00 73', bank_account: 'FR76 1234 5678 9012 3456 7890 073', salary: '€39,000', remaining_leave: 13, total_leave: 25, leave_taken: 12, last_leave: 'April 30, 2025', manager_id: 'EMP-082', manager_comments: 'Good at collections, persistent follow-up' },

  //   └─ Financial Analysis
  { employee_id: 'EMP-087', name: 'Rachel Green', role: 'Financial Analyst', department: 'Finance', email: 'rachel.green@company.com', phone: '+33 1 42 00 00 24', bank_account: 'FR76 1234 5678 9012 3456 7890 024', salary: '€45,000', remaining_leave: 12, total_leave: 25, leave_taken: 13, last_leave: 'April 18, 2025', manager_id: 'EMP-081', manager_comments: 'Good analytical skills, sometimes lacks initiative' },
  { employee_id: 'EMP-088', name: 'Natasha Ivanova', role: 'Budget Analyst', department: 'Finance', email: 'natasha.ivanova@company.com', phone: '+33 1 42 00 00 74', bank_account: 'FR76 1234 5678 9012 3456 7890 074', salary: '€47,000', remaining_leave: 17, total_leave: 25, leave_taken: 8, last_leave: 'July 3, 2025', manager_id: 'EMP-087', manager_comments: 'Good forecasting skills, accurate projections' },

  //   └─ Controller
  { employee_id: 'EMP-089', name: 'Ahmed Hassan', role: 'Controller', department: 'Finance', email: 'ahmed.hassan@company.com', phone: '+33 1 42 00 00 25', bank_account: 'FR76 1234 5678 9012 3456 7890 025', salary: '€55,000', remaining_leave: 25, total_leave: 28, leave_taken: 3, last_leave: 'February 28, 2025', manager_id: 'EMP-081', manager_comments: 'Strong leadership in finance, excellent control systems' },
  { employee_id: 'EMP-090', name: 'Pablo Rodriguez', role: 'Treasury Analyst', department: 'Finance', email: 'pablo.rodriguez@company.com', phone: '+33 1 42 00 00 75', bank_account: 'FR76 1234 5678 9012 3456 7890 075', salary: '€50,000', remaining_leave: 19, total_leave: 25, leave_taken: 6, last_leave: 'May 15, 2025', manager_id: 'EMP-089', manager_comments: 'Good cash management, proactive risk mitigation' },
  { employee_id: 'EMP-091', name: 'Elena Martinez', role: 'Risk Analyst', department: 'Finance', email: 'elena.martinez@company.com', phone: '+33 1 42 00 00 76', bank_account: 'FR76 1234 5678 9012 3456 7890 076', salary: '€51,000', remaining_leave: 11, total_leave: 25, leave_taken: 14, last_leave: 'March 12, 2025', manager_id: 'EMP-089', manager_comments: 'Thorough risk assessment, good at compliance' },
  { employee_id: 'EMP-092', name: 'Kai Nakamura', role: 'Compliance Officer', department: 'Finance', email: 'kai.nakamura@company.com', phone: '+33 1 42 00 00 77', bank_account: 'FR76 1234 5678 9012 3456 7890 077', salary: '€54,000', remaining_leave: 21, total_leave: 25, leave_taken: 4, last_leave: 'September 3, 2025', manager_id: 'EMP-089', manager_comments: 'Strict compliance mindset, sometimes rigid' },

  // ── Operations ─────────────────────────────────────────────────────────
  { employee_id: 'EMP-093', name: 'Luna Rodriguez', role: 'Operations Manager', department: 'Operations', email: 'luna.rodriguez@company.com', phone: '+33 1 42 00 00 88', bank_account: 'FR76 1234 5678 9012 3456 7890 088', salary: '€58,000', remaining_leave: 13, total_leave: 25, leave_taken: 12, last_leave: 'May 8, 2025', manager_id: 'EMP-001', manager_comments: 'Excellent operational efficiency, good organizer' },
  { employee_id: 'EMP-094', name: 'Theo Andersson', role: 'Facilities Manager', department: 'Operations', email: 'theo.andersson@company.com', phone: '+33 1 42 00 00 89', bank_account: 'FR76 1234 5678 9012 3456 7890 089', salary: '€45,000', remaining_leave: 17, total_leave: 25, leave_taken: 8, last_leave: 'June 15, 2025', manager_id: 'EMP-093', manager_comments: 'Proactive maintenance approach, good cost control' },
  { employee_id: 'EMP-095', name: 'Vera Popov', role: 'Procurement Specialist', department: 'Operations', email: 'vera.popov@company.com', phone: '+33 1 42 00 00 92', bank_account: 'FR76 1234 5678 9012 3456 7890 092', salary: '€46,000', remaining_leave: 14, total_leave: 25, leave_taken: 11, last_leave: 'July 18, 2025', manager_id: 'EMP-093', manager_comments: 'Good negotiator, excellent vendor relations' },

  // ── Customer Support ───────────────────────────────────────────────────
  { employee_id: 'EMP-096', name: 'Stella Johnson', role: 'Customer Support Manager', department: 'Customer Support', email: 'stella.johnson@company.com', phone: '+33 1 42 00 00 94', bank_account: 'FR76 1234 5678 9012 3456 7890 094', salary: '€48,000', remaining_leave: 12, total_leave: 25, leave_taken: 13, last_leave: 'May 22, 2025', manager_id: 'EMP-001', manager_comments: 'Excellent at customer satisfaction, good leader' },
  { employee_id: 'EMP-097', name: 'Arthur Wilson', role: 'Senior Support Agent', department: 'Customer Support', email: 'arthur.wilson@company.com', phone: '+33 1 42 00 00 95', bank_account: 'FR76 1234 5678 9012 3456 7890 095', salary: '€38,000', remaining_leave: 18, total_leave: 25, leave_taken: 7, last_leave: 'June 8, 2025', manager_id: 'EMP-096', manager_comments: 'Empathetic listener, excellent problem solver' },
  { employee_id: 'EMP-098', name: 'Ivan Petrov', role: 'Technical Support Agent', department: 'Customer Support', email: 'ivan.petrov@company.com', phone: '+33 1 42 00 00 97', bank_account: 'FR76 1234 5678 9012 3456 7890 097', salary: '€37,000', remaining_leave: 15, total_leave: 25, leave_taken: 10, last_leave: 'July 5, 2025', manager_id: 'EMP-097', manager_comments: 'Good technical knowledge, good at explaining' },
  { employee_id: 'EMP-099', name: 'Layla Hassan', role: 'Support Agent', department: 'Customer Support', email: 'layla.hassan@company.com', phone: '+33 1 42 00 00 96', bank_account: 'FR76 1234 5678 9012 3456 7890 096', salary: '€35,000', remaining_leave: 23, total_leave: 25, leave_taken: 2, last_leave: 'September 12, 2025', manager_id: 'EMP-096', manager_comments: 'Friendly and helpful, sometimes impatient' },

  // ── Quality ────────────────────────────────────────────────────────────
  { employee_id: 'EMP-100', name: 'Amara Diallo', role: 'Quality Assurance Manager', department: 'Quality', email: 'amara.diallo@company.com', phone: '+33 1 42 00 00 98', bank_account: 'FR76 1234 5678 9012 3456 7890 098', salary: '€52,000', remaining_leave: 20, total_leave: 25, leave_taken: 5, last_leave: 'August 20, 2025', manager_id: 'EMP-001', manager_comments: 'High standards, good quality culture' },
];

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
    CREATE TABLE employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      name_normalized TEXT NOT NULL,
      role TEXT NOT NULL,
      department TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      bank_account TEXT,
      salary TEXT,
      remaining_leave INTEGER,
      total_leave INTEGER,
      leave_taken INTEGER,
      last_leave TEXT,
      manager_id TEXT,
      manager_comments TEXT,
      FOREIGN KEY (manager_id) REFERENCES employees(employee_id)
    )
  `);

  // -- Indexes --
  const indexes = [
    'CREATE INDEX idx_employee_id ON employees(employee_id)',
    'CREATE INDEX idx_employee_email ON employees(email)',
    'CREATE INDEX idx_employee_name ON employees(name)',
    'CREATE INDEX idx_employee_name_normalized ON employees(name_normalized)',
    'CREATE INDEX idx_employee_department ON employees(department)',
    'CREATE INDEX idx_employee_manager ON employees(manager_id)',
  ];
  for (const sql of indexes) db.run(sql);

  // -- Seed employees --
  for (const emp of employees) {
    db.run(`
      INSERT INTO employees (
        employee_id, name, name_normalized, role, department, email, phone, bank_account,
        salary, remaining_leave, total_leave, leave_taken, last_leave, manager_id, manager_comments
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      emp.employee_id,
      emp.name,
      normalize(emp.name),
      emp.role,
      emp.department,
      emp.email,
      emp.phone,
      emp.bank_account,
      emp.salary,
      emp.remaining_leave,
      emp.total_leave,
      emp.leave_taken,
      emp.last_leave,
      emp.manager_id,
      emp.manager_comments,
    ]);
  }
  console.log(`Seeded ${employees.length} employees`);

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
