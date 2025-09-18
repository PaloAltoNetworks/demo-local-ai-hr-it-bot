// French language file
module.exports = {
  // Language metadata
  _meta: {
    code: 'fr',
    name: 'Français',
    englishName: 'French',
    countryCode: 'FR'
  },

  // Server messages
  server: {
    started: 'La Loutre HR/IT Assistant démarré sur le port',
    webInterface: 'Interface web',
    newConnection: 'Nouvelle connexion WebSocket',
    connectionClosed: 'Connexion WebSocket fermée',
    healthCheck: {
      status: 'ok',
      service: 'La Loutre HR/IT Assistant',
      version: '1.0.0'
    }
  },

  // API error messages  
  errors: {
    textRequired: 'Texte requis',
    employeeNotFound: 'Employé non trouvé',
    queryRequired: 'Requête requise',
    internalError: 'Erreur interne',
    tooManyRequests: 'Trop de requêtes',
    messageProcessingError: 'Erreur de traitement du message'
  },

  // General messages
  general: {
    greeting: 'Bonjour! Je suis La Loutre, votre assistant RH/IT. Comment puis-je vous aider?',
    error: 'Désolé, une erreur s\'est produite. Veuillez réessayer.',
    notFound: 'Information non trouvée.',
    processing: 'Traitement en cours...',
    unauthorized: 'Accès non autorisé.',
    invalidRequest: 'Demande invalide.',
    serviceUnavailable: 'Service temporairement indisponible.'
  },

  // Employee data
  employee: {
    departments: {
      hr: 'Ressources Humaines',
      it: 'Informatique',
      itSupport: 'Support IT'
    },
    positions: {
      hrManager: 'Responsable RH',
      seniorDeveloper: 'Développeur Senior',
      systemAdministrator: 'Administrateur Système'
    },
    relationships: {
      husband: 'Mari',
      wife: 'Épouse',
      spouse: 'Époux/Épouse'
    },
    status: {
      active: 'actif'
    }
  },

  // HR/IT Knowledge Base
  knowledgeBase: {
    policies: {
      vacation: 'Politique de congés: Les employés ont droit à 30 jours de congés payés par an. Les demandes doivent être soumises au moins 2 semaines à l\'avance.',
      sickLeave: 'Congés maladie: Chaque employé dispose de 10 jours de congés maladie par an. Un certificat médical est requis pour les absences de plus de 3 jours.',
      workFromHome: 'Télétravail: Le télétravail est autorisé jusqu\'à 3 jours par semaine avec l\'accord du manager.',
      equipment: 'Équipement IT: Les demandes d\'équipement informatique doivent être soumises via le portail IT avec justification professionnelle.',
      password: 'Politique de mots de passe: Les mots de passe doivent contenir au moins 8 caractères avec majuscules, minuscules, chiffres et symboles.',
      support: 'Support IT: Pour toute assistance technique, contactez le service IT à support@company.com ou au +33 1 23 45 67 90.'
    },
    procedures: {
      leaveRequest: 'Pour demander des congés: 1) Connectez-vous au portail RH, 2) Remplissez le formulaire de demande, 3) Soumettez pour approbation managériale.',
      passwordReset: 'Réinitialisation mot de passe: 1) Allez sur le portail self-service, 2) Cliquez sur "Mot de passe oublié", 3) Suivez les instructions par email.',
      equipmentRequest: 'Demande d\'équipement: 1) Portail IT, 2) Catégorie équipement, 3) Justification, 4) Approbation budgétaire si nécessaire.',
      newEmployee: 'Intégration nouvel employé: 1) Kit de bienvenue RH, 2) Création des accès IT, 3) Formation sécurité, 4) Assignation buddy système.'
    }
  },

  // Intent keywords
  intentKeywords: {
    vacation: ['congé', 'vacances', 'repos', 'absence', 'rtc'],
    sickLeave: ['maladie', 'arrêt', 'médical', 'santé'],
    password: ['mot de passe', 'password', 'connexion', 'accès'],
    equipment: ['ordinateur', 'équipement', 'matériel', 'laptop'],
    support: ['aide', 'problème', 'panne', 'assistance', 'support'],
    employee: ['employé', 'collègue', 'personnel', 'équipe'],
    policy: ['politique', 'règle', 'procédure', 'règlement'],
    workFromHome: ['télétravail', 'remote', 'distance', 'maison']
  },

  // Quick actions
  quickActions: {
    vacation: '💡 Action rapide: Accédez au portail RH sur hr.company.com pour soumettre votre demande.',
    support: '🔧 Action rapide: Contactez le support IT à support@company.com ou +33 1 23 45 67 90',
    equipment: '📱 Action rapide: Soumettez votre demande d\'équipement via le portail IT sur it.company.com'
  },

  // Statistics
  statistics: {
    organization: 'Organisation: {totalEmployees} employés, {departments} départements'
  },

  // Employee information responses
  employeeInfo: {
    vacationBalance: 'Solde de congés pour {firstName} {lastName}: {remaining} jours restants sur {total} jours au total.',
    contactInfo: '{firstName} {lastName} - {position} dans le département {department}. Email: {email}, Téléphone: {phone}',
    generalInfo: 'Employé trouvé: {firstName} {lastName}, {position} dans le département {department}.',
    notFoundInSystem: 'Employé non trouvé dans le système.'
  },

  // Ollama service
  ollama: {
    systemPrompt: `Vous êtes La Loutre, un assistant IA spécialisé dans l'automatisation RH et IT pour les entreprises. 
Vous aidez les employés avec leurs questions concernant les ressources humaines et l'informatique.
Répondez de manière professionnelle, claire et concise en français uniquement.

Domaines d'expertise:
- Gestion des congés et absences
- Politique RH et procédures
- Support informatique
- Gestion des comptes et accès
- Formation et développement professionnel
- Équipement informatique`,
    fallback: {
      greeting: 'Bonjour! Je suis La Loutre, votre assistant RH/IT. Le service IA est temporairement indisponible, mais je peux vous aider avec des informations de base.',
      help: 'Je peux vous aider avec les demandes RH et IT courantes. Le service IA complet sera bientôt disponible.',
      error: 'Désolé, le service IA n\'est pas disponible actuellement. Veuillez contacter directement le service RH/IT pour une assistance immédiate.'
    }
  },

  // Language detection indicators
  languageIndicators: [
    'le ', 'la ', 'les ', 'un ', 'une ', 'des ', 'du ', 'de ', 'et ', 'à ', 'dans ', 'pour ', 'avec ', 'sur ', 'par ',
    'que ', 'qui ', 'quoi ', 'où ', 'quand ', 'comment ', 'pourquoi ',
    'je ', 'tu ', 'il ', 'elle ', 'nous ', 'vous ', 'ils ', 'elles ',
    'mon ', 'ma ', 'mes ', 'ton ', 'ta ', 'tes ', 'son ', 'sa ', 'ses ',
    'congé', 'travail', 'bureau', 'ordinateur', 'aide', 'bonjour', 'merci', 'salut'
  ],

  // Prompt templates
  prompts: {
    enhanced: `Informations contextuelles:
{context}

Question employé: {query}

Veuillez fournir une réponse professionnelle et utile basée sur le contexte ci-dessus. Si l'information n'est pas disponible dans le contexte, donnez des conseils généraux et suggérez de contacter directement les RH/IT.`,
    fallbackGeneral: 'Je peux vous aider avec les questions RH et IT. Veuillez contacter les RH à hr@company.com ou le support IT à support@company.com pour une assistance spécifique.'
  },

  // ========================================
  // FRONTEND TRANSLATIONS (Client-side UI)
  // ========================================
  
  frontend: {
    // Page metadata
    pageTitle: 'La Loutre - Assistant RH/IT',
    
    // Header
    logoTitle: 'La Loutre',
    
    // Chat interface
    chatTitle: 'Assistant RH/IT Sécurisé',
    chatSubtitle: 'Traitement local avec Ollama • Données sécurisées sur site',
    welcomeText: 'Bienvenue dans La Loutre! Je suis votre assistant RH/IT sécurisé. Comment puis-je vous aider aujourd\'hui?',
    placeholder: 'Tapez votre question RH ou IT...',
    sendButton: 'Envoyer',
    
    // Connection status
    connecting: 'Connexion...',
    connected: 'Connecté',
    disconnected: 'Déconnecté', 
    typing: 'La Loutre tape...',
    
    // Sidebar
    sidebarStats: 'Statistiques Organisation',
    sidebarFeatures: 'Fonctionnalités',
    sidebarHelp: 'Aide Rapide',
    employees: 'Employés',
    departments: 'Départements',
    
    // Features list
    features: {
      realTime: 'Chat en temps réel avec assistant IA',
      secure: 'Traitement local sécurisé (pas de cloud)', 
      multilingual: 'Détection automatique de langue',
      integration: 'Intégration avec systèmes RH/IT'
    },
    
    // Quick actions
    quickActions: {
      title: 'Actions Rapides',
      vacation: 'Combien de jours de congés me reste-t-il?',
      password: 'Comment réinitialiser mon mot de passe?',
      equipment: 'Comment faire une demande d\'équipement IT?', 
      remote: 'Quelle est la politique de télétravail?'
    },
    
    // Status indicators
    status: {
      ollamaConnected: 'Service IA: Connecté',
      ollamaDisconnected: 'Service IA: Déconnecté',
      ollamaError: 'Service IA: Erreur'
    },
    
    // Error messages
    errors: {
      connectionFailed: 'Connexion échouée. Nouvelle tentative...',
      messageError: 'Échec d\'envoi du message. Veuillez réessayer.',
      loadError: 'Échec de chargement des données.'
    },
    
    // Footer
    footerText: 'La Loutre v1.0 • Palo Alto Networks • Assistant RH/IT Sécurisé',
    
    // Accessibility
    accessibility: {
      sendMessage: 'Envoyer le message',
      toggleLanguage: 'Changer de langue',
      selectLanguage: 'Sélectionner la langue',
      chatHistory: 'Historique des conversations'
    }
  }
};