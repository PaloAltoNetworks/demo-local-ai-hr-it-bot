/**
 * @fileoverview Theme Manager for handling dark/light mode switching
 * @responsibilities
 * - Toggle between dark and light color schemes
 * - Persist user theme preference in localStorage
 * - Detect and respond to system theme preference changes
 * - Update UI elements to reflect current theme state
 * @dependencies
 * - i18n (optional) - Internationalization service for translated labels
 * @events
 * - Listens: prefers-color-scheme media query changes
 * - Emits: None
 * @version 1.0.0
 */

// ═══════════════════════════════════════════════════════════════════════════
// MODULE CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** @type {string} localStorage key for theme preference */
const STORAGE_KEY = 'currentTheme';

/** @type {string} HTML attribute name for color scheme */
const THEME_ATTRIBUTE = 'data-color-scheme';

/** @type {string} Dark mode identifier */
const DARK_MODE = 'dark';

/** @type {string} Light mode identifier */
const LIGHT_MODE = 'light';

/** @type {Set<string>} Valid theme values for validation */
const VALID_THEMES = new Set([DARK_MODE, LIGHT_MODE]);

/** @type {string} Media query for dark mode preference */
const DARK_MODE_QUERY = '(prefers-color-scheme: dark)';

// ═══════════════════════════════════════════════════════════════════════════
// CLASS DEFINITION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @class ThemeManager
 * @description Manages application theme switching between dark and light modes.
 * Provides manual user control via toggle button and automatic detection of
 * system color scheme preferences.
 * @pattern Singleton-like manager with dependency injection
 * @example
 * const themeManager = new ThemeManager(i18n);
 * await themeManager.init();
 * // Cleanup when done:
 * themeManager.destroy();
 */
class ThemeManager {
  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE INSTANCE PROPERTIES
  // ═══════════════════════════════════════════════════════════════════════════

  /** @type {Object|null} @private Internationalization service */
  #i18n;

  /** @type {HTMLElement} @private Reference to document root element */
  #htmlElement;

  /** @type {MediaQueryList|null} @private Media query for dark mode preference */
  #darkModeQuery;

  /** @type {Object} @private Cached DOM element references */
  #elements;

  /** @type {Object} @private Bound event handler references for cleanup */
  #boundHandlers;

  // ═══════════════════════════════════════════════════════════════════════════
  // CONSTRUCTOR
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Creates a new ThemeManager instance
   * @param {Object|null} [i18n=null] - Internationalization service for translated labels
   */
  constructor(i18n = null) {
    this.#i18n = i18n;
    this.#htmlElement = document.documentElement;
    this.#darkModeQuery = window.matchMedia?.(DARK_MODE_QUERY) ?? null;
    this.#elements = {};
    this.#boundHandlers = {};
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Initializes the theme manager
   * @async
   * @returns {Promise<void>}
   */
  async init() {
    this.#cacheElements();
    this.#bindEventHandlers();
    this.#attachListeners();
    this.#applyInitialTheme();
    console.log('[ThemeManager] Initialized');
  }

  /**
   * Cleans up the theme manager and releases resources
   * @returns {void}
   */
  destroy() {
    this.#detachListeners();
    this.#elements = {};
    this.#boundHandlers = {};
    console.log('[ThemeManager] Destroyed');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Handles theme toggle button click
   * @private
   * @returns {void}
   */
  #onToggleClick() {
    const currentTheme = this.#htmlElement.getAttribute(THEME_ATTRIBUTE) || LIGHT_MODE;
    const newTheme = currentTheme === DARK_MODE ? LIGHT_MODE : DARK_MODE;
    localStorage.setItem(STORAGE_KEY, newTheme);
    this.#setTheme(newTheme);
  }

  /**
   * Handles system color scheme preference changes
   * @private
   * @param {MediaQueryListEvent} event - Media query change event
   * @returns {void}
   */
  #onSystemPreferenceChange(event) {
    if (!localStorage.getItem(STORAGE_KEY)) {
      this.#setTheme(event.matches ? DARK_MODE : LIGHT_MODE);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DOM OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Caches DOM element references
   * @private
   * @returns {void}
   */
  #cacheElements() {
    this.#elements = {
      toggleButton: document.getElementById('themeToggle'),
      toggleIcon: document.querySelector('.theme-toggle-icon'),
    };
  }

  /**
   * Updates the toggle button icon based on current theme
   * @private
   * @param {string} theme - Current theme identifier
   * @returns {void}
   */
  #updateToggleIcon(theme) {
    const { toggleIcon, toggleButton } = this.#elements;
    if (!toggleIcon) return;

    toggleIcon.textContent = theme === DARK_MODE ? 'dark_mode' : 'light_mode';

    if (toggleButton && this.#i18n?.t) {
      const actionLabel = theme === DARK_MODE
        ? this.#i18n.t('theme.switchToLightMode')
        : this.#i18n.t('theme.switchToDarkMode');

      toggleButton.title = actionLabel;
      toggleButton.setAttribute('aria-label', actionLabel);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT LISTENER MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Binds event handlers for proper cleanup
   * @private
   * @returns {void}
   */
  #bindEventHandlers() {
    this.#boundHandlers = {
      toggleClick: this.#onToggleClick.bind(this),
      systemPreferenceChange: this.#onSystemPreferenceChange.bind(this),
    };
  }

  /**
   * Attaches event listeners to DOM elements and media query
   * @private
   * @returns {void}
   */
  #attachListeners() {
    this.#elements.toggleButton?.addEventListener('click', this.#boundHandlers.toggleClick);
    this.#darkModeQuery?.addEventListener('change', this.#boundHandlers.systemPreferenceChange);
  }

  /**
   * Detaches all event listeners
   * @private
   * @returns {void}
   */
  #detachListeners() {
    this.#elements.toggleButton?.removeEventListener('click', this.#boundHandlers.toggleClick);
    this.#darkModeQuery?.removeEventListener('change', this.#boundHandlers.systemPreferenceChange);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Applies the initial theme based on stored preference or system setting
   * @private
   * @returns {void}
   */
  #applyInitialTheme() {
    const savedTheme = localStorage.getItem(STORAGE_KEY);
    const theme = savedTheme ?? (this.#darkModeQuery?.matches ? DARK_MODE : LIGHT_MODE);
    this.#setTheme(theme);
  }

  /**
   * Sets the theme and applies it to the DOM
   * @private
   * @param {string} theme - Theme to apply
   * @returns {void}
   */
  #setTheme(theme) {
    const validTheme = VALID_THEMES.has(theme) ? theme : LIGHT_MODE;
    this.#htmlElement.setAttribute(THEME_ATTRIBUTE, validTheme);
    this.#updateToggleIcon(validTheme);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export { ThemeManager };
