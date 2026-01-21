/**
 * @fileoverview LLM Provider Manager for handling LLM provider selection
 *
 * @responsibilities
 * - Manage LLM provider selection (AWS, Google Cloud, Azure, etc.)
 * - Handle provider dropdown UI interactions
 * - Cache provider preferences in localStorage
 * - Sync provider selection with backend API
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

/** @type {string} LocalStorage key for caching provider data */
const CACHE_KEY = 'llm-providers-cache';

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

  /** @type {string|null} Backend-defined default provider ID */
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
    await this.#loadProvidersFromBackend();
    this.#loadProviderPreference();
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
   * Sets the API service dependency
   * @param {Object} apiService - API service for backend communication
   * @returns {void}
   */
  setApiService(apiService) {
    this.#apiService = apiService;
  }

  /**
   * Sets the active provider and persists the selection
   * @param {string} provider - Provider ID to set as active
   * @returns {void}
   */
  setProvider(provider) {
    const supportedProviderIds = this.#providers.map(p => p.id);

    if (!supportedProviderIds.includes(provider)) {
      console.warn(`[LLMProviderManager] Invalid provider: ${provider}. Supported providers: ${supportedProviderIds.join(', ')}`);
      return;
    }

    console.log(`[LLMProviderManager] Setting provider to: ${provider}`);

    this.#updateCacheProvider(provider);
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
    const stored = this.#getStoredProvider();

    if (stored) {
      return stored;
    }

    return this.#backendDefaultProvider || (this.#providers.length > 0 ? this.#providers[0].id : DEFAULT_PROVIDER_ID);
  }

  /**
   * Gets metadata for a specific provider or the current provider
   * @param {string|null} providerId - Provider ID to get metadata for, or null for current
   * @returns {Object} Provider metadata object
   */
  getProviderMetadata(providerId = null) {
    const targetId = providerId || this.getCurrentProvider();
    return this.#providers.find(p => p.id === targetId) || this.#getDefaultProviderMetadata();
  }

  /**
   * Handles external provider change events
   * @param {CustomEvent} event - Event containing provider change details
   * @returns {void}
   */
  onChanged(event) {
    if (event?.detail?.provider) {
      this.#applyProviderChange(event.detail.provider);
    }
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
   * Loads providers from backend API with cache fallback
   * @private
   * @async
   * @returns {Promise<void>}
   */
  async #loadProvidersFromBackend() {
    try {
      const data = await this.#fetchProvidersFromAPI();

      if (data?.providers) {
        this.#providers = data.providers;

        if (data.default_provider) {
          this.#backendDefaultProvider = data.default_provider;
        }

        this.#cacheProviders(data);
        this.#populateDropdown();
        console.log('[LLMProviderManager] LLM providers loaded from backend and cached');
      }
    } catch (error) {
      console.error('[LLMProviderManager] Failed to load providers from backend:', error);
      this.#loadProvidersFromCache();
    }
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
   * Caches providers data to localStorage
   * @private
   * @param {Object} data - Provider data to cache
   * @returns {void}
   */
  #cacheProviders(data) {
    try {
      const existingCache = this.#getCache() || {};
      const cacheData = {
        providers: data.providers || [],
        default_provider: data.default_provider || null,
        selected_provider: existingCache.selected_provider || null,
        cached_at: new Date().toISOString()
      };

      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
      console.log('[LLMProviderManager] Providers cached locally');
    } catch (error) {
      console.warn('[LLMProviderManager] Failed to cache providers:', error);
    }
  }

  /**
   * Loads providers from localStorage cache
   * @private
   * @returns {boolean} True if cache was loaded successfully
   */
  #loadProvidersFromCache() {
    try {
      const cached = localStorage.getItem(CACHE_KEY);

      if (cached) {
        const cacheData = JSON.parse(cached);
        this.#providers = cacheData.providers || [];
        this.#backendDefaultProvider = cacheData.default_provider || null;
        this.#populateDropdown();
        console.log('[LLMProviderManager] LLM providers loaded from local cache');
        return true;
      }
    } catch (error) {
      console.warn('[LLMProviderManager] Failed to load providers from cache:', error);
    }

    return false;
  }

  /**
   * Loads provider preference from cache or uses default
   * @private
   * @returns {void}
   */
  #loadProviderPreference() {
    const cache = this.#getCache();
    const savedProvider = cache?.selected_provider;
    const supportedProviderIds = this.#providers.map(p => p.id);

    if (savedProvider && supportedProviderIds.includes(savedProvider)) {
      this.setProvider(savedProvider);
    } else if (this.#backendDefaultProvider) {
      this.setProvider(this.#backendDefaultProvider);
    }
  }

  /**
   * Gets cache object from localStorage
   * @private
   * @returns {Object|null} Cached data or null
   */
  #getCache() {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.warn('[LLMProviderManager] Failed to get cache:', error);
      return null;
    }
  }

  /**
   * Gets stored provider from cache
   * @private
   * @returns {string|null} Stored provider ID or null
   */
  #getStoredProvider() {
    const cache = this.#getCache();
    return cache?.selected_provider || null;
  }

  /**
   * Updates cache with selected provider
   * @private
   * @param {string} provider - Provider ID to store
   * @returns {void}
   */
  #updateCacheProvider(provider) {
    try {
      const cache = this.#getCache() || {};
      cache.selected_provider = provider;
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
      console.warn('[LLMProviderManager] Failed to update provider in cache:', error);
    }
  }

  /**
   * Applies provider change without triggering backend update
   * @private
   * @param {string} provider - Provider ID to apply
   * @returns {void}
   */
  #applyProviderChange(provider) {
    const supportedProviderIds = this.#providers.map(p => p.id);

    if (!supportedProviderIds.includes(provider)) {
      console.warn(`[LLMProviderManager] Invalid provider: ${provider}. Supported providers: ${supportedProviderIds.join(', ')}`);
      return;
    }

    console.log(`[LLMProviderManager] Applying provider change to: ${provider}`);

    this.#updateCacheProvider(provider);
    this.#updateButtonDisplay(provider);
    this.#updateMenuSelection(provider);

    if (this.#isMenuOpen) {
      this.#closeMenu();
    }

    if (this.#apiService) {
      this.#apiService.setAIProvider(provider);
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

  /**
   * Gets default provider metadata
   * @private
   * @returns {Object} Default provider metadata or empty object
   */
  #getDefaultProviderMetadata() {
    return this.#providers.find(p => p.id === this.#backendDefaultProvider) || {};
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export { LLMProviderManager };
