/**
 * Logger utility with consistent formatting and agent context
 */
class Logger {
  constructor(agentName) {
    this.agentName = agentName;
  }

  _getTimestamp() {
    const now = new Date();
    return now.toISOString();
  }

  _formatMessage(message) {
    return `[${this._getTimestamp()}] [${this.agentName.toUpperCase()}] ${message}`;
  }

  debug(message, data = null) {
    console.log(`${this._formatMessage(message)}`, data || '');
  }

  info(message, data = null) {
    console.log(`ℹ️  ${this._formatMessage(message)}`, data || '');
  }

  success(message, data = null) {
    console.log(`${this._formatMessage(message)}`, data || '');
  }

  warn(message, data = null) {
    console.warn(`⚠️  ${this._formatMessage(message)}`, data || '');
  }

  error(message, error = null) {
    console.error(`❌ ${this._formatMessage(message)}`, error?.message || error || '');
    if (error?.stack) {
      console.error(`   Stack: ${error.stack}`);
    }
  }

  thinking(message) {
    console.log(`💭 ${this._formatMessage(message)}`);
  }

  request(method, url) {
    console.log(`${this._formatMessage(`${method} ${url}`)}`);
  }

  divider(title) {
    console.log(`\n${title ? '=== ' + title + ' ===' : '================================'}`);
  }
}

export { Logger };
