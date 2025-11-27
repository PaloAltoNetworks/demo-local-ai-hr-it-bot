export class GeneralService {
  constructor() {
    this.policies = this._getPolicies();
  }

  async init() {
    // No async data loading needed for general agent
  }

  _getPolicies() {
    return `WORKPLACE POLICIES AND GENERAL INFORMATION

WORKING HOURS:
- Standard hours: 9:00 AM - 5:00 PM, Monday to Friday
- Flexible hours available with manager approval
- Remote work options available

LEAVE POLICIES:
- Annual leave: 20 days per year
- Sick leave: 10 days per year
- Personal days: 3 days per year
- Maternity/Paternity leave: As per local regulations

DRESS CODE:
- Business casual attire
- Casual Fridays
- Professional attire for client meetings

COMMUNICATION:
- Email for formal communications
- Slack for team communications
- Phone for urgent matters

OFFICE FACILITIES:
- Kitchen facilities available
- Parking available on-site
- Gym membership discount available

EMERGENCY CONTACTS:
- General Support: support@company.com
- HR Department: hr@company.com
- IT Support: it@company.com
- Facilities: facilities@company.com`;
  }

  getPolicies() {
    return this.policies;
  }

  searchPolicies(query) {
    const policiesLower = this.policies.toLowerCase();
    const queryLower = query.toLowerCase();
    
    if (policiesLower.includes(queryLower)) {
      // Return relevant section
      const lines = this.policies.split('\n');
      const results = [];
      
      lines.forEach((line, idx) => {
        if (line.toLowerCase().includes(queryLower)) {
          const start = Math.max(0, idx - 1);
          const end = Math.min(lines.length, idx + 3);
          results.push(...lines.slice(start, end));
        }
      });
      
      return results.length > 0 ? results.join('\n') : this.policies;
    }
    
    return this.policies;
  }
}
