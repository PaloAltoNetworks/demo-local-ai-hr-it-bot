/**
 * Winston logger singleton - single logger for the chatbot backend
 */
const winston = require('winston');

let logger = null;

/**
 * Initialize the global logger (call once at application startup)
 * @param {string} serviceName - The name of the service/application
 * @returns {winston.Logger} Winston logger instance
 */
function initializeLogger(serviceName = 'chatbot-host') {
  if (logger) {
    return logger;
  }

  logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(({ level, message, timestamp, service }) => {
        return `${timestamp} [${service}] ${level}: ${message}`;
      })
    ),
    defaultMeta: { service: serviceName },
    transports: [
      new winston.transports.File({ filename: './logs/error.log', level: 'error' }),
      new winston.transports.File({ filename: './logs/combined.log' })
    ]
  });

  // Add console transport in development
  if (process.env.NODE_ENV !== 'production') {
    logger.add(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          winston.format.colorize(),
          winston.format.printf(({ level, message, timestamp, service }) => {
            return `${timestamp} [${service}] ${level}: ${message}`;
          })
        )
      })
    );
  }

  return logger;
}

/**
 * Get the global logger instance
 * @returns {winston.Logger} Winston logger instance
 */
function getLogger() {
  if (!logger) {
    throw new Error('Logger not initialized. Call initializeLogger() first.');
  }
  return logger;
}

module.exports = {
  initializeLogger,
  getLogger
};
