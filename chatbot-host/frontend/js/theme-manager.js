/**
 * Theme Manager for handling dark/light mode switching
 * Provides both manual user control and automatic system preference detection
 */
export class ThemeManager {
  constructor() {
    this.STORAGE_KEY = 'theme-preference';
    this.THEME_ATTRIBUTE = 'data-color-scheme';
    this.DARK_MODE = 'dark';
    this.LIGHT_MODE = 'light';
    this.htmlElement = document.documentElement;
    this.toggleButton = document.getElementById('themeToggle');
    this.toggleIcon = document.querySelector('.theme-toggle-icon');
    
    this.init();
  }

  /**
   * Initialize theme manager
   */
  init() {
    this.loadThemePreference();
    this.attachEventListeners();
    this.watchSystemPreference();
  }

  /**
   * Load theme preference from storage or system preference
   */
  loadThemePreference() {
    const savedTheme = this.getStoredTheme();
    
    if (savedTheme) {
      // User has explicitly set a preference
      this.setTheme(savedTheme);
    } else {
      // Use system preference
      const systemPreference = this.getSystemThemePreference();
      this.setTheme(systemPreference);
    }
  }

  /**
   * Get theme preference from localStorage
   */
  getStoredTheme() {
    return localStorage.getItem(this.STORAGE_KEY);
  }

  /**
   * Get system theme preference
   */
  getSystemThemePreference() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return this.DARK_MODE;
    }
    return this.LIGHT_MODE;
  }

  /**
   * Set theme and apply to DOM
   */
  setTheme(theme) {
    const validTheme = [this.DARK_MODE, this.LIGHT_MODE].includes(theme) ? theme : this.LIGHT_MODE;
    
    // Apply to HTML element
    this.htmlElement.setAttribute(this.THEME_ATTRIBUTE, validTheme);
    
    // Update icon
    this.updateToggleIcon(validTheme);
  }

  /**
   * Toggle between dark and light modes
   */
  toggleTheme() {
    const currentTheme = this.getCurrentTheme();
    const newTheme = currentTheme === this.DARK_MODE ? this.LIGHT_MODE : this.DARK_MODE;
    
    // Save user preference
    localStorage.setItem(this.STORAGE_KEY, newTheme);
    
    // Apply theme
    this.setTheme(newTheme);
  }

  /**
   * Get current theme
   */
  getCurrentTheme() {
    return this.htmlElement.getAttribute(this.THEME_ATTRIBUTE) || this.LIGHT_MODE;
  }

  /**
   * Update toggle button icon based on current theme
   */
  updateToggleIcon(theme) {
    if (!this.toggleIcon) return;
    
    // If dark mode is active, show light_mode icon (to indicate clicking will switch to light)
    // If light mode is active, show dark_mode icon (to indicate clicking will switch to dark)
    this.toggleIcon.textContent = theme === this.DARK_MODE ? 'light_mode' : 'dark_mode';
  }

  /**
   * Watch for system theme preference changes
   */
  watchSystemPreference() {
    if (!window.matchMedia) return;
    
    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    // Handle preference changes only if user hasn't set a manual preference
    darkModeQuery.addEventListener('change', (e) => {
      // Only apply if no stored preference exists
      if (!this.getStoredTheme()) {
        const newTheme = e.matches ? this.DARK_MODE : this.LIGHT_MODE;
        this.setTheme(newTheme);
      }
    });
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    if (this.toggleButton) {
      this.toggleButton.addEventListener('click', () => this.toggleTheme());
    }
  }
}
