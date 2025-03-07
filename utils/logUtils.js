const path = require("path");
const fs = require("fs").promises;
const fileUtils = require("./fileUtils");
const pathUtils = require("./pathUtils");
const properties = require("./properties");
const { Readable } = require("stream");

/**
 * Configuration for the logging system
 */
const config = {
  LOG_LIMIT: properties.IN_MEMORY_LOG_LIMIT,
  LOG_FILE_MAX_SIZE: 5 * 1024 * 1024, // 5MB
  LOG_DIRECTORY: properties.CATEGORIES.LOGS,
  DEFAULT_LOG_FILE: "server.log",
  ROTATION_COUNT: 5, // Number of rotated log files to keep
  LOG_LEVELS: {
    ERROR: 0,
    WARNING: 1,
    INFO: 2,
    DEBUG: 3,
    SUCCESS: 4
  },
  CURRENT_LOG_LEVEL: properties.LOG_LEVEL || 'INFO'
};

// In-memory storage for recent logs
const logBuffer = {
  entries: [],
  listeners: []
};

/**
 * Formats a log message with timestamp and level
 * @param {string} level - Log level (ERROR, WARNING, INFO, DEBUG)
 * @param {string} message - Log message
 * @param {Error|null} error - Optional error object
 * @returns {Object} - Formatted log entry
 */
function formatLogEntry(level, message, error = null) {
  const timestamp = new Date().toISOString();
  
  const logEntry = {
    timestamp,
    level: level.toUpperCase(),
    message
  };

  if (error) {
    logEntry.error = {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  return logEntry;
}

/**
 * Adds a log entry to the in-memory buffer and notifies listeners
 * @param {Object} logEntry - The log entry to add
 */
function addToBuffer(logEntry) {
  // Add to the buffer
  logBuffer.entries.push(logEntry);
  
  // Trim buffer if it exceeds the limit
  if (logBuffer.entries.length > config.LOG_LIMIT) {
    logBuffer.entries.shift();
  }
  
  // Notify all listeners
  logBuffer.listeners.forEach(listener => {
    try {
      listener(logEntry);
    } catch (err) {
      console.error("Error in log listener:", err);
    }
  });
}

/**
 * Checks if the log file needs rotation
 * @param {string} filePath - Path to the log file
 * @returns {Promise<boolean>} - Whether rotation is needed
 */
async function needsRotation(filePath) {
  let fileHandle = null;
  try {
    fileHandle = await fs.open(filePath, 'r');
    const stats = await fileHandle.stat();
    return stats.size >= config.LOG_FILE_MAX_SIZE;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false; // File doesn't exist, no rotation needed
    }
    throw error;
  } finally {
    if (fileHandle) {
      try {
        await fileHandle.close();
      } catch (error) {
        console.error("Failed to close file handle:", error);
      }
    }
  }
}

/**
 * Rotates log files when they reach the size limit
 * @param {string} category - Log category/directory
 * @param {string} fileName - Log file name
 * @returns {Promise<void>}
 */
async function rotateLogFile(category, fileName) {
  try {
    const dirPath = pathUtils.getSafeCategoryPath(category);
    const filePath = path.join(dirPath, fileName);
    
    // Check if rotation is needed
    if (!(await needsRotation(filePath))) {
      return;
    }
    
    // Delete the oldest log file if it exists
    const oldestLogPath = path.join(dirPath, `${fileName}.${config.ROTATION_COUNT}`);
    try {
      await fs.unlink(oldestLogPath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`Failed to delete oldest log file: ${oldestLogPath}`, error);
      }
    }
    
    // Shift all existing log files
    for (let i = config.ROTATION_COUNT - 1; i >= 1; i--) {
      const oldPath = path.join(dirPath, `${fileName}.${i}`);
      const newPath = path.join(dirPath, `${fileName}.${i + 1}`);
      
      try {
        await fs.rename(oldPath, newPath);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.error(`Failed to rotate log file from ${oldPath} to ${newPath}`, error);
        }
      }
    }
    
    // Rename the current log file
    try {
      await fs.rename(filePath, path.join(dirPath, `${fileName}.1`));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`Failed to rename current log file: ${filePath}`, error);
      }
    }
  } catch (error) {
    console.error("Log rotation failed:", error);
  }
}

/**
 * Logs a message with specified level
 * @param {string} level - Log level (ERROR, WARNING, INFO, DEBUG, SUCCESS)
 * @param {string} message - The message to log
 * @param {Error|null} error - Optional error object
 * @returns {Promise<void>}
 */
async function log(level, message, error = null) {
  // Convert level to uppercase for consistency
  const upperLevel = level.toUpperCase();
  
  // Check if this log level should be processed
  if (config.LOG_LEVELS[upperLevel] > config.LOG_LEVELS[config.CURRENT_LOG_LEVEL]) {
    return;
  }
  
  // Format the log entry
  const logEntry = formatLogEntry(upperLevel, message, error);
  
  // Add to in-memory buffer and notify listeners
  addToBuffer(logEntry);
  
  // Console output with colors
  const consoleColors = {
    ERROR: '\x1b[31m', // Red
    WARNING: '\x1b[33m', // Yellow
    INFO: '\x1b[36m', // Cyan
    DEBUG: '\x1b[90m', // Gray
    RESET: '\x1b[0m', // Reset
    SUCCESS: '\x1b[32m' // Green
  };
  
  let consoleMessage = `${logEntry.timestamp} [${consoleColors[upperLevel]}${upperLevel}${consoleColors.RESET}] ${message}`;
  
  if (upperLevel === 'ERROR') {
    console.error(consoleMessage, error || '');
  } else if (upperLevel === 'WARNING') {
    console.warn(consoleMessage);
  } else if (upperLevel === 'DEBUG') {
    console.debug(consoleMessage);
  } else if (upperLevel === 'SUCCESS') {
    console.log(consoleMessage);
  } else {
    console.log(consoleMessage);
  }
  
  try {
    // Check if log rotation is needed
    await rotateLogFile(config.LOG_DIRECTORY, config.DEFAULT_LOG_FILE);
    
    // Format log for file (we use a simpler format for files)
    let fileLogText = `${logEntry.timestamp} [${upperLevel}] ${message}`;
    
    // Add error details if present
    if (error) {
      fileLogText += `\n  Error: ${error.message}`;
      if (error.stack) {
        fileLogText += `\n  Stack: ${error.stack}`;
      }
    }
    
    fileLogText += '\n';
    
    // Write to log file using manual file writing to avoid circular dependency
    // This replaces the call to fileUtils.saveDataToFile
    const dirPath = pathUtils.getSafeCategoryPath(config.LOG_DIRECTORY);
    const filePath = path.join(dirPath, config.DEFAULT_LOG_FILE);
    
    // Ensure directory exists
    await fs.mkdir(dirPath, { recursive: true }).catch(err => {
      if (err.code !== 'EEXIST') throw err;
    });
    
    // Write log with explicit file handle
    let fileHandle = null;
    try {
      fileHandle = await fs.open(filePath, 'a');
      await fileHandle.writeFile(fileLogText, 'utf8');
    } finally {
      if (fileHandle) {
        await fileHandle.close().catch(err => 
          console.error("Error closing log file handle:", err)
        );
      }
    }
  } catch (err) {
    console.error("Failed to write to log file:", err);
  }
}

/**
 * Convenience methods for different log levels
 */
  const logger = {
  error: (message, error) => log('ERROR', message, error),
  warning: (message, error) => log('WARNING', message, error),
  info: (message, error) => log('INFO', message, error),
  debug: (message, error) => log('DEBUG', message, error),
  success: (message, error) => log('SUCCESS', message, error),
  
  /**
   * Sets the current log level
   * @param {string} level - New log level (ERROR, WARNING, INFO, DEBUG)
   */
  setLogLevel: (level) => {
    const upperLevel = level.toUpperCase();
    if (config.LOG_LEVELS[upperLevel] !== undefined) {
      config.CURRENT_LOG_LEVEL = upperLevel;
      logger.info(`Log level set to ${upperLevel}`);
    } else {
      logger.warning(`Invalid log level: ${level}. Using ${config.CURRENT_LOG_LEVEL} instead.`);
    }
  },
  
  /**
   * Gets all logs stored in memory
   * @param {Object} options - Options for filtering logs
   * @param {string} options.level - Filter by log level
   * @param {number} options.limit - Limit number of logs returned
   * @param {string} options.search - Search text in log messages
   * @returns {Array} - Array of log entries
   */
  getLogs: (options = {}) => {
    let filteredLogs = [...logBuffer.entries];
    
    // Filter by level if specified
    if (options.level) {
      const upperLevel = options.level.toUpperCase();
      const levelValue = config.LOG_LEVELS[upperLevel];
      
      if (levelValue !== undefined) {
        filteredLogs = filteredLogs.filter(entry => 
          config.LOG_LEVELS[entry.level] <= levelValue
        );
      }
    }
    
    // Filter by search text
    if (options.search) {
      const searchText = options.search.toLowerCase();
      filteredLogs = filteredLogs.filter(entry =>
        entry.message.toLowerCase().includes(searchText) ||
        (entry.error && entry.error.message.toLowerCase().includes(searchText))
      );
    }
    
    // Apply limit
    if (options.limit && options.limit > 0) {
      filteredLogs = filteredLogs.slice(-options.limit);
    }
    
    return filteredLogs;
  },
  
  /**
   * Adds a listener for new log entries
   * @param {Function} callback - Function to call with new log entries
   * @returns {Function} - Function to remove the listener
   */
  addListener: (callback) => {
    if (typeof callback !== 'function') {
      throw new Error('Listener must be a function');
    }
    
    logBuffer.listeners.push(callback);
    
    // Return a function to remove this listener
    return () => {
      const index = logBuffer.listeners.indexOf(callback);
      if (index !== -1) {
        logBuffer.listeners.splice(index, 1);
      }
    };
  },
  
  /**
   * Creates a readable stream of log entries
   * @param {Object} options - Stream options
   * @returns {Readable} - Readable stream of log entries
   */
  createLogStream: (options = {}) => {
    // Create a list of existing logs that match the criteria
    const initialLogs = logger.getLogs(options);
    
    // Create a readable stream
    const logStream = new Readable({
      objectMode: true,
      read() {} // No-op since we push manually
    });
    
    // Push existing logs to the stream
    initialLogs.forEach(log => {
      logStream.push(log);
    });
    
    // Add a listener for new logs
    const removeListener = logger.addListener(newLog => {
      // Filter based on level if needed
      if (options.level) {
        const upperLevel = options.level.toUpperCase();
        const levelValue = config.LOG_LEVELS[upperLevel];
        
        if (levelValue !== undefined && config.LOG_LEVELS[newLog.level] > levelValue) {
          return; // Skip logs with higher (less severe) levels
        }
      }
      
      // Filter based on search if needed
      if (options.search) {
        const searchText = options.search.toLowerCase();
        const matches = newLog.message.toLowerCase().includes(searchText) ||
          (newLog.error && newLog.error.message.toLowerCase().includes(searchText));
        
        if (!matches) {
          return; // Skip logs that don't match the search
        }
      }
      
      // Push the log to the stream
      logStream.push(newLog);
    });
    
    // Clean up when the stream ends
    logStream.on('end', () => {
      removeListener();
    });
    
    return logStream;
  },
  
  /**
   * Get the config object
   * @returns {Object} - Logger configuration
   */
  getConfig: () => ({...config})
};

// Export the logger
module.exports = logger;