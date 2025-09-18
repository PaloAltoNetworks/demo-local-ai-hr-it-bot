// English language file (unified for frontend and backend)
module.exports = {
  // Language metadata
  _meta: {
    code: 'en',
    name: 'English',
    englishName: 'English',
    countryCode: 'US'
  },

  // ========================================
  // BACKEND TRANSLATIONS (Server-side only)
  // ========================================
  
  // Server messages
  server: {
    started: 'La Loutre HR/IT Assistant started on port',
    webInterface: 'Web interface',
    newConnection: 'New WebSocket connection',
    connectionClosed: 'WebSocket connection closed',
    healthCheck: {
      status: 'ok',
      service: 'La Loutre HR/IT Assistant',
      version: '1.0.0'
    }
  },

  // API error messages  
  errors: {
    textRequired: 'Text required',
    employeeNotFound: 'Employee not found',
    queryRequired: 'Query required',
    internalError: 'Internal error',
    tooManyRequests: 'Too many requests',
    messageProcessingError: 'Message processing error'
  },

  // General messages
  general: {
    greeting: 'Hello! I am La Loutre, your HR/IT assistant. How can I help you?',
    error: 'Sorry, an error occurred. Please try again.',
    notFound: 'Information not found.',
    processing: 'Processing...',
    unauthorized: 'Unauthorized access.',
    invalidRequest: 'Invalid request.',
    serviceUnavailable: 'Service temporarily unavailable.'
  },

  // Employee data
  employee: {
    departments: {
      hr: 'Human Resources',
      it: 'Information Technology',
      itSupport: 'IT Support'
    },
    positions: {
      hrManager: 'HR Manager',
      seniorDeveloper: 'Senior Developer',
      systemAdministrator: 'System Administrator'
    },
    relationships: {
      husband: 'Husband',
      wife: 'Wife',
      spouse: 'Spouse'
    },
    status: {
      active: 'active'
    }
  },

  // HR/IT Knowledge Base
  knowledgeBase: {
    policies: {
      vacation: 'Vacation Policy: Employees are entitled to 30 days of paid vacation per year. Requests must be submitted at least 2 weeks in advance.',
      sickLeave: 'Sick Leave: Each employee has 10 sick days per year. Medical certificate required for absences longer than 3 days.',
      workFromHome: 'Work from Home: Remote work is allowed up to 3 days per week with manager approval.',
      equipment: 'IT Equipment: IT equipment requests must be submitted via IT portal with business justification.',
      password: 'Password Policy: Passwords must contain at least 8 characters with uppercase, lowercase, numbers, and symbols.',
      support: 'IT Support: For technical assistance, contact IT support at support@company.com or +33 1 23 45 67 90.'
    },
    procedures: {
      leaveRequest: 'To request leave: 1) Log into HR portal, 2) Fill out request form, 3) Submit for manager approval.',
      passwordReset: 'Password Reset: 1) Go to self-service portal, 2) Click "Forgot Password", 3) Follow email instructions.',
      equipmentRequest: 'Equipment Request: 1) IT Portal, 2) Equipment category, 3) Justification, 4) Budget approval if needed.',
      newEmployee: 'New Employee Onboarding: 1) HR welcome kit, 2) IT access creation, 3) Security training, 4) Buddy system assignment.'
    }
  },

  // Intent keywords
  intentKeywords: {
    vacation: ['vacation', 'leave', 'time off', 'holiday', 'pto'],
    sickLeave: ['sick', 'medical', 'illness', 'health'],
    password: ['password', 'login', 'access', 'authentication'],
    equipment: ['computer', 'equipment', 'laptop', 'hardware'],
    support: ['help', 'support', 'issue', 'problem', 'assistance'],
    employee: ['employee', 'colleague', 'staff', 'team'],
    policy: ['policy', 'rule', 'procedure', 'regulation'],
    workFromHome: ['work from home', 'remote', 'wfh', 'telework']
  },

  // Quick actions
  quickActions: {
    vacation: '💡 Quick Action: Access HR portal at hr.company.com to submit your request.',
    support: '🔧 Quick Action: Contact IT support at support@company.com or +33 1 23 45 67 90',
    equipment: '📱 Quick Action: Submit equipment request via IT portal at it.company.com'
  },

  // Statistics
  statistics: {
    organization: 'Organization: {totalEmployees} employees, {departments} departments'
  },

  // Employee information responses
  employeeInfo: {
    vacationBalance: 'Vacation balance for {firstName} {lastName}: {remaining} days remaining out of {total} total days.',
    contactInfo: '{firstName} {lastName} - {position} in {department}. Email: {email}, Phone: {phone}',
    generalInfo: 'Employee found: {firstName} {lastName}, {position} in {department}.',
    notFoundInSystem: 'Employee not found in the system.'
  },

  // Ollama service
  ollama: {
    systemPrompt: `You are La Loutre, an AI assistant specialized in HR and IT automation for enterprises.
You help employees with their human resources and information technology questions.
Respond professionally, clearly and concisely in English only.

Areas of expertise:
- Leave and absence management
- HR policies and procedures
- IT support
- Account and access management
- Training and professional development
- IT equipment`,
    fallback: {
      greeting: 'Hello! I am La Loutre, your HR/IT assistant. The AI service is temporarily unavailable, but I can help with basic information.',
      help: 'I can help you with common HR and IT requests. The full AI service will be available soon.',
      error: 'Sorry, the AI service is currently unavailable. Please contact HR/IT directly for immediate assistance.'
    }
  },

  // Language detection indicators
  languageIndicators: [
    'the ', 'a ', 'an ', 'and ', 'or ', 'but ', 'in ', 'on ', 'at ', 'to ', 'for ', 'of ', 'with ', 'by ',
    'what ', 'when ', 'where ', 'why ', 'how ', 'who ', 'which ',
    'i ', 'you ', 'he ', 'she ', 'we ', 'they ', 'it ',
    'my ', 'your ', 'his ', 'her ', 'our ', 'their ',
    'vacation', 'work', 'office', 'computer', 'help', 'hello', 'thank', 'hi'
  ],

  // Prompt templates
  prompts: {
    enhanced: `Context Information:
{context}

Employee Question: {query}

Please provide a helpful, professional response based on the context above. If the information isn't available in the context, provide general guidance and suggest contacting HR/IT directly.`,
    fallbackGeneral: 'I can help you with HR and IT questions. Please contact HR at hr@company.com or IT support at support@company.com for specific assistance.'
  },

  // ========================================
  // FRONTEND TRANSLATIONS (Client-side UI)
  // ========================================
  
  frontend: {
    // Page metadata
    pageTitle: 'La Loutre - HR/IT Assistant',
    
    // Header
    logoTitle: 'La Loutre',
    
    // Chat interface
    chatTitle: 'Secure HR/IT Assistant', 
    chatSubtitle: 'Local processing with Ollama • On-premise secure data',
    welcomeText: 'Welcome to La Loutre! I am your secure HR/IT assistant. How can I help you today?',
    placeholder: 'Type your HR or IT question...',
    sendButton: 'Send',
    
    // Connection status
    connecting: 'Connecting...',
    connected: 'Connected', 
    disconnected: 'Disconnected',
    typing: 'La Loutre is typing...',
    
    // Sidebar
    sidebarStats: 'Organization Statistics',
    sidebarFeatures: 'Features',
    sidebarHelp: 'Quick Help',
    employees: 'Employees',
    departments: 'Departments',
    
    // Features list
    features: {
      realTime: 'Real-time chat with AI assistant',
      secure: 'Secure local processing (no cloud)',
      multilingual: 'Automatic language detection',
      integration: 'Integration with HR/IT systems'
    },
    
    // Quick actions
    quickActions: {
      title: 'Quick Actions',
      vacation: 'How many vacation days do I have left?',
      password: 'How do I reset my password?', 
      equipment: 'How do I request IT equipment?',
      remote: 'What is the work from home policy?'
    },
    
    // Status indicators
    status: {
      ollamaConnected: 'AI Service: Connected',
      ollamaDisconnected: 'AI Service: Disconnected', 
      ollamaError: 'AI Service: Error'
    },
    
    // Error messages
    errors: {
      connectionFailed: 'Connection failed. Retrying...',
      messageError: 'Failed to send message. Please try again.',
      loadError: 'Failed to load data.'
    },
    
    // Footer
    footerText: 'La Loutre v1.0 • Palo Alto Networks • Secure HR/IT Assistant',
    
    // Accessibility
    accessibility: {
      sendMessage: 'Send message',
      toggleLanguage: 'Toggle language',
      selectLanguage: 'Select language',
      chatHistory: 'Chat history'
    }
  }
};