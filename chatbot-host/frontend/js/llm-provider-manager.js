/**
 * @fileoverview LLM Provider Manager for handling LLM provider selection
 *
 * @responsibilities
 * - Manage LLM provider selection (AWS, Google Cloud, Azure, etc.)
 * - Handle provider dropdown UI interactions
 * - Persist provider preference in localStorage
 * - Dispatch provider change events to the application
 *
 * @dependencies
 * - apiService: API communication service for fetching providers
 *
 * @events
 * - Listens: None
 * - Dispatches: 'llmProviderChanged' - When user selects a different provider
 *
 * @version 1.0.0
 */

// ═══════════════════════════════════════════════════════════════════════════
// MODULE CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** @type {string} LocalStorage key for storing current provider */
const STORAGE_KEY = 'currentLLMProvider';

/** @type {string} Default fallback provider ID */
const DEFAULT_PROVIDER_ID = 'aws';

// ═══════════════════════════════════════════════════════════════════════════
// CLASS DEFINITION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @class LLMProviderManager
 * @description Manages LLM provider selection with dropdown UI, caching, and API integration.
 * Supports multiple cloud providers (AWS, Google Cloud, Azure) with custom dropdown interface.
 *
 * @pattern Singleton-like Manager
 *
 * @example
 * const llmProviderManager = new LLMProviderManager(apiService);
 * await llmProviderManager.init();
 * const currentProvider = llmProviderManager.getCurrentProvider();
 */
class LLMProviderManager {
  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE INSTANCE PROPERTIES
  // ═══════════════════════════════════════════════════════════════════════════

  /** @type {Object|null} API service for backend communication */
  #apiService;

  /** @type {Array<Object>} Available LLM providers from backend */
  #providers;

  /** @type {string|null} Currently active provider ID */
  #currentProvider;

  /** @type {string|null} Backend default provider ID */
  #backendDefaultProvider;

  /** @type {boolean} Current state of dropdown menu */
  #isMenuOpen;

  /** @type {Object} Cached DOM element references */
  #elements;

  /** @type {Object} Bound event handler references for cleanup */
  #boundHandlers;

  // ═══════════════════════════════════════════════════════════════════════════
  // CONSTRUCTOR
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Creates a new LLMProviderManager instance
   * @param {Object|null} apiService - API service for backend communication
   */
  constructor(apiService = null) {
    this.#apiService = apiService;
    this.#providers = [];
    this.#currentProvider = null;
    this.#backendDefaultProvider = null;
    this.#isMenuOpen = false;
    this.#elements = {};
    this.#boundHandlers = {};
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Initializes the LLM provider manager
   * @async
   * @returns {Promise<void>}
   */
  async init() {
    this.#cacheElements();
    this.#bindEventHandlers();

    await this.#fetchLLMProviders();
    this.#currentProvider = this.#detectProvider();

    this.#populateDropdown();
    this.setProvider(this.#currentProvider, true);

    this.#attachListeners();

    console.log('[LLMProviderManager] Initialized');
  }

  /**
   * Destroys the manager and cleans up resources
   * @returns {void}
   */
  destroy() {
    this.#detachListeners();
    if (this.#elements.menu) {
      this.#elements.menu.innerHTML = '';
    }
    this.#providers = [];
    this.#currentProvider = null;
    this.#backendDefaultProvider = null;
    this.#isMenuOpen = false;
    this.#elements = {};
    this.#boundHandlers = {};
    console.log('[LLMProviderManager] Destroyed');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Sets the active provider and persists the selection
   * @param {string} provider - Provider ID to set as active
   * @returns {void}
   */
  setProvider(provider, forceRender = false) {
    const supportedProviderIds = this.#providers.map(p => p.id);

    if (!supportedProviderIds.includes(provider)) {
      console.warn(`[LLMProviderManager] Invalid provider: ${provider}. Supported providers: ${supportedProviderIds.join(', ')}`);
      return;
    }

    if (provider === this.#currentProvider && !forceRender) {
      return;
    }

    console.log(`[LLMProviderManager] Setting provider to: ${provider}`);

    this.#currentProvider = provider;
    this.#saveProviderToLocalStorage();
    this.#updateButtonDisplay(provider);
    this.#updateMenuSelection(provider);

    if (this.#isMenuOpen) {
      this.#closeMenu();
    }

    this.#notifyChange(provider);
  }

  /**
   * Gets the currently selected provider ID
   * @returns {string} Current provider ID
   */
  getCurrentProvider() {
    return this.#currentProvider || DEFAULT_PROVIDER_ID;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT HANDLERS (PRIVATE)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Handles button click to toggle dropdown menu
   * @private
   * @returns {void}
   */
  #onButtonClick() {
    this.#toggleMenu();
  }

  /**
   * Handles clicks outside the dropdown to close it
   * @private
   * @param {MouseEvent} event - Click event
   * @returns {void}
   */
  #onOutsideClick(event) {
    if (!this.#elements.dropdown?.contains(event.target) && this.#isMenuOpen) {
      this.#closeMenu();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DOM OPERATIONS (PRIVATE)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Caches DOM element references
   * @private
   * @returns {void}
   */
  #cacheElements() {
    this.#elements = {
      dropdown: document.getElementById('llmProviderDropdown'),
      button: document.getElementById('llmProviderButton'),
      menu: document.getElementById('llmProviderMenu'),
      logo: document.getElementById('llmProviderLogo')
    };
  }

  /**
   * Populates dropdown menu with provider options
   * @private
   * @returns {void}
   */
  #populateDropdown() {
    if (!this.#elements.menu || this.#providers.length === 0) {
      return;
    }

    this.#elements.menu.innerHTML = '';

    this.#providers.forEach(provider => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'llm-provider-option';
      button.dataset.provider = provider.id;
      button.title = provider.name;

      const img = document.createElement('img');
      img.src = provider.logo;
      img.alt = provider.name;
      img.className = 'provider-logo';

      button.appendChild(img);
      button.addEventListener('click', () => this.setProvider(provider.id));

      this.#elements.menu.appendChild(button);
    });

    const currentProvider = this.getCurrentProvider();
    this.#updateMenuSelection(currentProvider);
  }

  /**
   * Updates the button display with selected provider info
   * @private
   * @param {string} providerId - Provider ID to display
   * @returns {void}
   */
  #updateButtonDisplay(providerId) {
    const provider = this.#providers.find(p => p.id === providerId);

    if (!provider) {
      return;
    }

    if (this.#elements.logo) {
      this.#elements.logo.src = provider.logo;
      this.#elements.logo.alt = provider.name;
    }

    if (this.#elements.button) {
      this.#elements.button.title = provider.name;
    }
  }

  /**
   * Updates menu selection styling
   * @private
   * @param {string} providerId - Selected provider ID
   * @returns {void}
   */
  #updateMenuSelection(providerId) {
    if (!this.#elements.menu) {
      return;
    }

    this.#elements.menu.querySelectorAll('.llm-provider-option').forEach(option => {
      option.classList.toggle('selected', option.dataset.provider === providerId);
    });
  }

  /**
   * Toggles dropdown menu visibility
   * @private
   * @returns {void}
   */
  #toggleMenu() {
    if (this.#isMenuOpen) {
      this.#closeMenu();
    } else {
      this.#openMenu();
    }
  }

  /**
   * Opens the dropdown menu
   * @private
   * @returns {void}
   */
  #openMenu() {
    if (!this.#elements.menu || !this.#elements.button) {
      return;
    }

    this.#elements.menu.classList.add('show');
    this.#elements.button.setAttribute('aria-expanded', 'true');
    this.#isMenuOpen = true;

    const currentProvider = this.getCurrentProvider();
    const focusedOption = this.#elements.menu.querySelector(`[data-provider="${currentProvider}"]`);

    if (focusedOption) {
      focusedOption.focus();
    }
  }

  /**
   * Closes the dropdown menu
   * @private
   * @returns {void}
   */
  #closeMenu() {
    if (!this.#elements.menu || !this.#elements.button) {
      return;
    }

    this.#elements.menu.classList.remove('show');
    this.#elements.button.setAttribute('aria-expanded', 'false');
    this.#isMenuOpen = false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT LISTENER MANAGEMENT (PRIVATE)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Binds event handlers to preserve context
   * @private
   * @returns {void}
   */
  #bindEventHandlers() {
    this.#boundHandlers = {
      buttonClick: this.#onButtonClick.bind(this),
      outsideClick: this.#onOutsideClick.bind(this)
    };
  }

  /**
   * Attaches all event listeners
   * @private
   * @returns {void}
   */
  #attachListeners() {
    this.#elements.button?.addEventListener('click', this.#boundHandlers.buttonClick);
    document.addEventListener('click', this.#boundHandlers.outsideClick);
  }

  /**
   * Detaches all event listeners
   * @private
   * @returns {void}
   */
  #detachListeners() {
    this.#elements.button?.removeEventListener('click', this.#boundHandlers.buttonClick);
    document.removeEventListener('click', this.#boundHandlers.outsideClick);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Fetches LLM providers from backend API
   * @private
   * @async
   * @returns {Promise<void>}
   */
  async #fetchLLMProviders() {
    try {
      const data = await this.#fetchProvidersFromAPI();

      if (data?.providers) {
        this.#providers = data.providers;
        
        // Store backend default for detection
        if (data.default_provider) {
          this.#backendDefaultProvider = data.default_provider;
        }

        console.log('[LLMProviderManager] LLM providers fetched from backend');
      }
    } catch (error) {
      console.error('[LLMProviderManager] Failed to fetch providers from backend:', error);
    }
  }

  /**
   * Detects which provider to use based on localStorage and backend default
   * @private
   * @returns {string} Provider ID to use
   */
  #detectProvider() {
    const savedProvider = this.#loadProviderFromLocalStorage();
    const supportedProviderIds = this.#providers.map(p => p.id);

    if (savedProvider && supportedProviderIds.includes(savedProvider)) {
      return savedProvider;
    }

    if (this.#backendDefaultProvider && supportedProviderIds.includes(this.#backendDefaultProvider)) {
      return this.#backendDefaultProvider;
    }

    if (this.#providers.length > 0) {
      return this.#providers[0].id;
    }

    if (savedProvider) {
      console.warn(`[LLMProviderManager] Saved provider '${savedProvider}' is no longer available, using default`);
    }

    return DEFAULT_PROVIDER_ID;
  }

  /**
   * Fetches LLM providers from API endpoint
   * @private
   * @async
   * @returns {Promise<Object>} Provider data from API
   * @throws {Error} When API service is unavailable or request fails
   */
  async #fetchProvidersFromAPI() {
    if (!this.#apiService) {
      throw new Error('API service not available');
    }

    try {
      return await this.#apiService.get('/api/llm-providers');
    } catch (error) {
      console.error('[LLMProviderManager] Failed to fetch LLM providers:', error);
      throw error;
    }
  }

  /**
   * Saves provider to localStorage
   * @private
   * @returns {void}
   */
  #saveProviderToLocalStorage() {
    try {
      if (!this.#currentProvider) {
        throw new Error('[LLMProviderManager] Cannot save provider: currentProvider is not set');
      }
      localStorage.setItem(STORAGE_KEY, this.#currentProvider);
    } catch (error) {
      console.error('[LLMProviderManager] Error saving provider to localStorage:', error);
    }
  }

  /**
   * Loads provider from localStorage
   * @private
   * @returns {string|null} Saved provider ID or null
   */
  #loadProviderFromLocalStorage() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      console.error('[LLMProviderManager] Error loading provider from localStorage:', error);
      return null;
    }
  }

  /**
   * Notifies listeners of provider change
   * @private
   * @param {string} provider - New provider ID
   * @returns {void}
   */
  #notifyChange(provider) {
    window.dispatchEvent(new CustomEvent('llmProviderChanged', { detail: { provider } }));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export { LLMProviderManager };
