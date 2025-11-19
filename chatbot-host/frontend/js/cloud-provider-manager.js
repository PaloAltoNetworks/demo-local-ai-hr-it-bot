/**
 * Cloud Provider Manager for handling cloud provider selection
 * Supports AWS, Google Cloud (GCP), and Azure with custom dropdown
 * Handles integration with API service for cloud provider updates
 */
export class CloudProviderManager {
  constructor(i18nService = null, apiService = null) {
    this.STORAGE_KEY = 'cloud-provider-preference';
    
    // Dropdown elements
    this.dropdownElement = document.getElementById('cloudProviderDropdown');
    this.buttonElement = document.getElementById('cloudProviderButton');
    this.menuElement = document.getElementById('cloudProviderMenu');
    this.logoElement = document.getElementById('cloudProviderLogo');
    
    this.i18nService = i18nService;
    this.apiService = apiService;
    this.changeCallbacks = [];
    this.providers = [];
    this.backendDefaultProvider = null;
    this.isMenuOpen = false;
    
    this.init();
  }

  /**
   * Initialize cloud provider manager
   */
  async init() {
    await this.loadProvidersFromBackend();
    this.loadProviderPreference();
    this.attachEventListeners();
  }

  /**
   * Fetch providers from backend API
   */
  async loadProvidersFromBackend() {
    if (!this.apiService) {
      console.warn('No API service available for loading cloud providers');
      return;
    }

    try {
      const data = await this.apiService.getCloudProviders();
      if (data && data.providers) {
        this.providers = data.providers;
        // Store the backend's default provider
        if (data.default_provider) {
          this.backendDefaultProvider = data.default_provider;
        }
        this.populateDropdown();
      }
    } catch (error) {
      console.error('Failed to load providers from backend:', error);
    }
  }

  /**
   * Set API service
   */
  setApiService(apiService) {
    this.apiService = apiService;
  }

  /**
   * Set i18n service (can be called after instantiation)
   */
  setI18nService(i18nService) {
    this.i18nService = i18nService;
  }

  /**
   * Load cloud provider preference from storage
   */
  loadProviderPreference() {
    const savedProvider = this.getStoredProvider();
    const supportedProviderIds = this.providers.map(p => p.id);
    
    // Use saved preference if available, otherwise use backend's default
    if (savedProvider && supportedProviderIds.includes(savedProvider)) {
      this.setProvider(savedProvider, false);
    } else if (this.backendDefaultProvider) {
      this.setProvider(this.backendDefaultProvider, false);
    }
  }

  /**
   * Get provider preference from localStorage
   */
  getStoredProvider() {
    return localStorage.getItem(this.STORAGE_KEY);
  }

  /**
   * Set provider and apply to storage
   */
  setProvider(provider, notifyChange = true) {
    const supportedProviderIds = this.providers.map(p => p.id);
    if (!supportedProviderIds.includes(provider)) {
      console.warn(`Invalid provider: ${provider}. Supported providers: ${supportedProviderIds.join(', ')}`);
      return;
    }
    
    // Save user preference
    localStorage.setItem(this.STORAGE_KEY, provider);
    
    // Update button display
    this.updateButtonDisplay(provider);
    
    // Mark selected in menu
    this.updateMenuSelection(provider);
    
    // Close menu after selection
    if (this.isMenuOpen) {
      this.closeMenu();
    }
    
    // Notify backend API service of provider change
    if (notifyChange && this.apiService) {
      this.apiService.setCloudProvider(provider);
    }
    
    // Trigger change callbacks
    if (notifyChange) {
      this.notifyChange(provider);
    }
  }

  /**
   * Get current provider
   */
  getCurrentProvider() {
    return localStorage.getItem(this.STORAGE_KEY) || this.DEFAULT_PROVIDER;
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
      button.className = 'cloud-provider-option';
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
    
    this.menuElement.querySelectorAll('.cloud-provider-option').forEach(option => {
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
   * Attach event listeners
   */
  attachEventListeners() {
    if (this.buttonElement) {
      this.buttonElement.addEventListener('click', () => this.toggleMenu());
    }
    
    if (this.dropdownElement) {
      // Close menu when clicking outside
      document.addEventListener('click', (e) => {
        if (!this.dropdownElement.contains(e.target) && this.isMenuOpen) {
          this.closeMenu();
        }
      });
    }
  }

  /**
   * Register a callback to be notified when provider changes
   */
  onProviderChange(callback) {
    if (typeof callback === 'function') {
      this.changeCallbacks.push(callback);
    }
  }

  /**
   * Handle cloud provider change event
   * This method can be bound as an event listener for external notifications
   */
  onChanged(event) {
    // This method handles external cloud provider change notifications
    // If called as event listener, extract provider from event detail
    if (event && event.detail && event.detail.provider) {
      const provider = event.detail.provider;
      // Apply the provider change
      this.setProvider(provider, false); // false to avoid recursive event dispatch
    }
  }

  /**
   * Notify all registered callbacks of provider change
   */
  notifyChange(provider) {
    // Dispatch global event for app-level listeners and external systems
    window.dispatchEvent(new CustomEvent('cloudProviderChanged', { detail: { provider } }));
    
    // Call registered callbacks
    this.changeCallbacks.forEach(callback => {
      try {
        callback(provider);
      } catch (error) {
        console.error('Error in cloud provider change callback:', error);
      }
    });
  }

  /**
   * Get cloud provider metadata by ID
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
