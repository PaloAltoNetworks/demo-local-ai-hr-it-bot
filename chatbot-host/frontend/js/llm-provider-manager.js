/**
 * llm provider Manager for handling llm provider selection
 * Supports AWS, Google Cloud (GCP), and Azure with custom dropdown
 * Handles integration with API service for llm provider updates
 */
export class LLMProviderManager {
  constructor(apiService = null) {
    this.CACHE_KEY = 'llm-providers-cache';

    // Dropdown elements
    this.dropdownElement = document.getElementById('llmProviderDropdown');
    this.buttonElement = document.getElementById('llmProviderButton');
    this.menuElement = document.getElementById('llmProviderMenu');
    this.logoElement = document.getElementById('llmProviderLogo');

    this.apiService = apiService;
    this.providers = [];
    this.backendDefaultProvider = null;
    this.isMenuOpen = false;
  }

  /**
   * Initialize llm provider manager
   */
  async init() {
    await this.loadProvidersFromBackend();
    this.loadProviderPreference();
    this.attachListeners();
  }

  /**
   * Fetch providers from backend API with cache fallback
   */
  async loadProvidersFromBackend() {
    try {
      const data = await this.fetchProvidersFromAPI();
      if (data && data.providers) {
        this.providers = data.providers;
        // Store the backend's default provider
        if (data.default_provider) {
          this.backendDefaultProvider = data.default_provider;
        }
        // Cache the successful response
        this.cacheProviders(data);
        this.populateDropdown();
        console.log('LLM providers loaded from backend and cached');
      }
    } catch (error) {
      console.error('Failed to load providers from backend:', error);
      // Fallback to cached providers
      this.loadProvidersFromCache();
    }
  }

  /**
   * Fetch LLM providers from API endpoint
   */
  async fetchProvidersFromAPI() {
    if (!this.apiService) {
      throw new Error('API service not available');
    }

    try {
      const data = await this.apiService.get('/api/llm-providers');
      return data;
    } catch (error) {
      console.error('❌ Failed to fetch llm providers:', error);
      throw error;
    }
  }

  /**
   * Cache providers data to localStorage (only providers and defaults, not selected_provider)
   */
  cacheProviders(data) {
    try {
      const existingCache = this.getCache() || {};
      const cacheData = {
        providers: data.providers || [],
        default_provider: data.default_provider || null,
        selected_provider: existingCache.selected_provider || null,
        cached_at: new Date().toISOString()
      };
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(cacheData));
      console.log('Providers cached locally');
    } catch (error) {
      console.warn('Failed to cache providers:', error);
    }
  }

  /**
   * Load providers from localStorage cache
   */
  loadProvidersFromCache() {
    try {
      const cached = localStorage.getItem(this.CACHE_KEY);
      if (cached) {
        const cacheData = JSON.parse(cached);
        this.providers = cacheData.providers || [];
        this.backendDefaultProvider = cacheData.default_provider || null;
        this.populateDropdown();
        console.log('LLM providers loaded from local cache');
        return true;
      }
    } catch (error) {
      console.warn('Failed to load providers from cache:', error);
    }
    return false;
  }

  /**
   * Set API service
   */
  setApiService(apiService) {
    this.apiService = apiService;
  }

  /**
   * Load llm provider preference from cache or use default
   */
  loadProviderPreference() {
    const cache = this.getCache();
    const savedProvider = cache?.selected_provider;
    const supportedProviderIds = this.providers.map(p => p.id);

    // Use saved preference if available, otherwise use backend's default
    if (savedProvider && supportedProviderIds.includes(savedProvider)) {
      this.setProvider(savedProvider);
    } else if (this.backendDefaultProvider) {
      this.setProvider(this.backendDefaultProvider);
    }
  }

  /**
   * Get cache object from localStorage
   */
  getCache() {
    try {
      const cached = localStorage.getItem(this.CACHE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.warn('Failed to get cache:', error);
      return null;
    }
  }

  /**
   * Get provider preference from cache
   */
  getStoredProvider() {
    const cache = this.getCache();
    return cache?.selected_provider || null;
  }

  /**
   * Set provider and apply to storage (user-initiated change)
   */
  setProvider(provider) {
    const supportedProviderIds = this.providers.map(p => p.id);
    if (!supportedProviderIds.includes(provider)) {
      console.warn(`Invalid provider: ${provider}. Supported providers: ${supportedProviderIds.join(', ')}`);
      return;
    }

    console.log(`[LLMProviderManager] Setting provider to: ${provider}`);

    // Update cache
    this.updateCacheProvider(provider);

    // Update UI
    this.updateButtonDisplay(provider);
    this.updateMenuSelection(provider);

    // Close menu if open
    if (this.isMenuOpen) {
      this.closeMenu();
    }

    this.notifyChange(provider);
  }

  /**
   * Update cache with selected provider
   */
  updateCacheProvider(provider) {
    try {
      const cache = this.getCache() || {};
      cache.selected_provider = provider;
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
      console.warn('Failed to update provider in cache:', error);
    }
  }

  /**
   * Get current provider
   */
  getCurrentProvider() {
    const stored = this.getStoredProvider();
    if (stored) {
      return stored;
    }
    // Fallback to backend default or first available provider
    return this.backendDefaultProvider || (this.providers.length > 0 ? this.providers[0].id : 'aws');
  }

  /**
   * Populate dropdown menu with provider options from backend
   */
  populateDropdown() {
    if (!this.menuElement || this.providers.length === 0) return;

    this.menuElement.innerHTML = '';

    this.providers.forEach(provider => {
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

      button.addEventListener('click', () => {
        this.setProvider(provider.id);
      });

      this.menuElement.appendChild(button);
    });

    // Mark current selection
    const currentProvider = this.getCurrentProvider();
    this.updateMenuSelection(currentProvider);
  }

  /**
   * Update button display with selected provider info
   */
  updateButtonDisplay(providerId) {
    const provider = this.providers.find(p => p.id === providerId);
    if (!provider) return;

    if (this.logoElement) {
      this.logoElement.src = provider.logo;
      this.logoElement.alt = provider.name;
    }

    // Update button title for hover tooltip
    if (this.buttonElement) {
      this.buttonElement.title = provider.name;
    }
  }

  /**
   * Update menu selection styling
   */
  updateMenuSelection(providerId) {
    if (!this.menuElement) return;

    this.menuElement.querySelectorAll('.llm-provider-option').forEach(option => {
      if (option.dataset.provider === providerId) {
        option.classList.add('selected');
      } else {
        option.classList.remove('selected');
      }
    });
  }

  /**
   * Toggle dropdown menu
   */
  toggleMenu() {
    if (this.isMenuOpen) {
      this.closeMenu();
    } else {
      this.openMenu();
    }
  }

  /**
   * Open dropdown menu
   */
  openMenu() {
    if (!this.menuElement || !this.buttonElement) return;

    this.menuElement.classList.add('show');
    this.buttonElement.setAttribute('aria-expanded', 'true');
    this.isMenuOpen = true;

    // Focus on the default provider option
    const currentProvider = this.getCurrentProvider();
    const focusedOption = this.menuElement.querySelector(`[data-provider="${currentProvider}"]`);
    if (focusedOption) {
      focusedOption.focus();
    }
  }

  /**
   * Close dropdown menu
   */
  closeMenu() {
    if (!this.menuElement || !this.buttonElement) return;

    this.menuElement.classList.remove('show');
    this.buttonElement.setAttribute('aria-expanded', 'false');
    this.isMenuOpen = false;
  }

  /**
   * Attach all event listeners (UI and global)
   */
  attachListeners() {
    // UI: Button click to toggle menu
    if (this.buttonElement) {
      this.buttonElement.addEventListener('click', () => this.toggleMenu());
    }

    // UI: Close menu when clicking outside
    if (this.dropdownElement) {
      document.addEventListener('click', (e) => {
        if (!this.dropdownElement.contains(e.target) && this.isMenuOpen) {
          this.closeMenu();
        }
      });
    }
  }

  /**
   * Handle llm provider change event from external sources
   * This method can be bound as an event listener for external notifications
   */
  onChanged(event) {
    // This method handles external llm provider change notifications
    // If called as event listener, extract provider from event detail
    if (event && event.detail && event.detail.provider) {
      const provider = event.detail.provider;
      // Apply the provider change without backend update
      this.applyProviderChange(provider);
    }
  }

  /**
   * Apply provider change without triggering backend update (for external events)
   */
  applyProviderChange(provider) {
    const supportedProviderIds = this.providers.map(p => p.id);
    if (!supportedProviderIds.includes(provider)) {
      console.warn(`Invalid provider: ${provider}. Supported providers: ${supportedProviderIds.join(', ')}`);
      return;
    }

    console.log(`[LLMProviderManager] Applying provider change to: ${provider}`);

    // Update cache
    this.updateCacheProvider(provider);

    // Update UI
    this.updateButtonDisplay(provider);
    this.updateMenuSelection(provider);

    // Close menu if open
    if (this.isMenuOpen) {
      this.closeMenu();
    }

    // Update API service
    if (this.apiService) {
      this.apiService.setAIProvider(provider);
    }
  }

  /**
   * Notify all registered callbacks of provider change
   */
  notifyChange(provider) {
    // Dispatch global event for app-level listeners and external systems
    window.dispatchEvent(new CustomEvent('llmProviderChanged', { detail: { provider } }));
  }

  /**
   * Get llm provider metadata by ID
   */
  getProviderMetadata(providerId = null) {
    providerId = providerId || this.getCurrentProvider();
    return this.providers.find(p => p.id === providerId) || this.getDefaultProviderMetadata();
  }

  /**
   * Get default provider metadata
   */
  getDefaultProviderMetadata() {
    return this.providers.find(p => p.id === this.backendDefaultProvider) || {};
  }
}
