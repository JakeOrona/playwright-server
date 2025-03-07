const path = require('path');
const fs = require('fs').promises;
const properties = require('./properties');
const logger = require('./logUtils');

/**
 * Configuration for path utilities
 */
const config = {
  BASE_DIRECTORY: properties.BASE_DIR,

  // Defines safe directories that can be accessed
  SAFE_DIRECTORIES: {
    LOGS: 'logs',
    REPORTS: 'reports',
    TESTS: 'tests',
    SCRAPED: 'scraped',
    FORMATTED: 'formatted',
    SCREENSHOTS: 'screenshots',
    UPLOADS: 'uploads',
    TEMP: 'temp',
    PLAYWRIGHT: 'playwright',
    DOCS: 'docs',
  },

  // Characters not allowed in path components
  FORBIDDEN_CHARS: /[<>:"|?*\x00-\x1F]/,

  // File extensions that are considered potentially dangerous
  DANGEROUS_EXTENSIONS: [
    '.exe', '.dll', '.sh', '.bat', '.cmd', '.ps1', '.jar', '.com'
  ]
};

/**
 * Ensures all necessary directories exist
 * @returns {Promise<void>}
 */
async function ensureDirectoriesExist() {
  try {
    // Create base directory if it doesn't exist
    await fs.mkdir(config.BASE_DIRECTORY, { recursive: true });

    // Create all safe directories
    for (const dir of Object.values(config.SAFE_DIRECTORIES)) {
      if (dir) {  // Skip empty string (root directory)
        const fullPath = path.join(config.BASE_DIRECTORY, dir);
        await fs.mkdir(fullPath, { recursive: true });
        
      }
    }

    // Ensure server.log exists in logs directory
    const logFilePath = path.join(
      config.BASE_DIRECTORY, 
      config.SAFE_DIRECTORIES.LOGS, 'server.log');
    //const logFilePath = path.join(logsPath, 'server.log');
    
    try {
      // Ensure the logs directory exists
      await fs.mkdir(path.dirname(logFilePath), { recursive: true });
      // Create/open server.log in append mode if it doesn't exist
      await fs.open(logFilePath, 'a+');
    } catch (error) {
      console.error('Failed to create/open server.log:', error);
      throw error;
    }
  } catch (error) {
    console.error('Failed to create directories:', error);
    throw error;
  }
}

/**
 * Validates a path component for forbidden characters
 * @param {string} component - Path component to validate
 * @returns {boolean} - Whether the component is valid
 */
function isValidPathComponent(component) {
  // Check for empty components
  if (!component) return false;
  
  // Check for dots (directory traversal attempts)
  if (component === '.' || component === '..') return false;
  
  // Check for forbidden characters
  if (config.FORBIDDEN_CHARS.test(component)) return false;
  
  return true;
}

/**
 * Validates all components in a path
 * @param {string} inputPath - Path to validate
 * @returns {boolean} - Whether the path is valid
 */
function validatePath(inputPath) {
  if (!inputPath) return false;
  
  // Normalize slashes first
  const normalized = inputPath.replace(/\\/g, '/');

  // Split path into components and validate each one
  const components = normalized.split('/');
  return components.every(isValidPathComponent);
}

/**
 * Safely resolves a path to prevent directory traversal
 * @param {string} basePath - Base directory path
 * @param {string} userPath - User-provided path
 * @returns {string|null} - Safe resolved path or null if invalid
 */
function safeResolve(basePath, userPath) {
  // Validate the user-provided path
  if (!validatePath(userPath)) {
    console.warn(`safeResolve: Invalid userPath=${userPath}`);
    return null;
  }
  
  // Normalize the path to handle any ../ sequences
  const normalizedPath = path.normalize(userPath);
  
  // Combine with base path and resolve to absolute path
  const resolvedPath = path.resolve(basePath, normalizedPath);
  
  // Ensure the resolved path is still within the base path
  if (!resolvedPath.startsWith(basePath)) {
    console.warn(`safeResolve: resolvedPath=${resolvedPath} is outside of basePath=${basePath}`);
    return null;
  }
  
  return resolvedPath;
}

/**
 * Validates a file extension
 * @param {string} filePath - Path with filename to check
 * @param {boolean} allowDangerousExtensions - Whether to allow dangerous extensions
 * @returns {boolean} - Whether the extension is allowed
 */
function isAllowedExtension(filePath, allowDangerousExtensions = false) {
  if (!filePath) return false;
  
  const ext = path.extname(filePath).toLowerCase();
  
  // If dangerous extensions are allowed, or the extension isn't dangerous
  return allowDangerousExtensions || !config.DANGEROUS_EXTENSIONS.includes(ext);
}

/**
 * Gets safe path for a category directory
 * @param {string} category - Category name
 * @returns {string|null} - Safe path or null if invalid
 */
function getSafeCategoryPath(category) {
  // Empty category defaults to the base directory
  if (!category) {
    return config.BASE_DIRECTORY;
  }
  
  // Check if this is a defined safe directory
  const safePath = config.SAFE_DIRECTORIES[category];
  
  if (safePath !== undefined) {
    return path.join(config.BASE_DIRECTORY, safePath);
  }
  
  // For custom categories, validate and normalize
  if (!validatePath(category)) {
    console.warn(`getSafeCategoryPath: Invalid category= ${category}`);
    return null;
  }
  
  // Resolve the path safely
  return safeResolve(config.BASE_DIRECTORY, category);
}

/**
 * Gets a safe file path from category and filename
 * @param {string} category - Category or directory name
 * @param {string} fileName - File name
 * @param {Object} options - Options
 * @param {boolean} options.allowDangerousExtensions - Whether to allow dangerous extensions
 * @returns {string|null} - Safe file path or null if invalid
 */
function getSafeFilePath(category, fileName, options = {}) {

  if (!fileName) {
    console.warn(`getSafeFilePath: Invalid fileName=${fileName}`);
    return null;
  }
  
  // Get safe category path
  const categoryPath = getSafeCategoryPath(category);
  if (!categoryPath) {
    console.warn(`getSafeFilePath: Invalid categoryPath= ${categoryPath}`);
    return null;
  }
  
  // Validate filename
  if (!validatePath(fileName)) {
    console.warn(`getSafeFilePath: Invalid fileName=${fileName}`);
    return null;
  }
  
  // Check file extension if needed
  if (!options.allowDangerousExtensions && !isAllowedExtension(fileName)) {
    console.warn(`getSafeFilePath: Dangerous extension in fileName=${fileName}`);
    return null;
  }
  
  // Resolve the final path
  return safeResolve(categoryPath, fileName);
}

/**
 * Creates a relative path from base directory
 * @param {string} fullPath - Full absolute path
 * @returns {string|null} - Relative path or null if outside base directory
 */
function getRelativePath(fullPath) {
  if (!fullPath || !fullPath.startsWith(config.BASE_DIRECTORY)) {
    return null;
  }
  
  return path.relative(config.BASE_DIRECTORY, fullPath);
}

/**
 * Registers a new safe directory
 * @param {string} name - Directory identifier
 * @param {string} dirPath - Directory path (relative to base)
 * @returns {boolean} - Success status
 */
function registerSafeDirectory(name, dirPath) {
  if (!name || !validatePath(dirPath)) {
    return false;
  }
  
  // Add to safe directories
  config.SAFE_DIRECTORIES[name] = dirPath;
  
  // Create the directory asynchronously
  const fullPath = path.join(config.BASE_DIRECTORY, dirPath);
  fs.mkdir(fullPath, { recursive: true })
    .catch(err => console.error(`Failed to create directory ${fullPath}:`, err));
  
  return true;
}

/**
 * Sets the base directory path
 * @param {string} newBasePath - New base directory path
 * @returns {boolean} - Success status
 */
function setBaseDirectory(newBasePath) {
  if (!newBasePath) {
    return false;
  }
  
  try {
    // Resolve to absolute path
    const absolutePath = path.resolve(newBasePath);
    
    // Update the base directory
    config.BASE_DIRECTORY = absolutePath;
    
    // Create directories asynchronously
    ensureDirectoriesExist()
      .catch(err => console.error('Failed to create directories after base change:', err));
    
    return true;
  } catch (error) {
    console.error('Failed to set base directory:', error);
    return false;
  }
}

/**
 * Sanitizes a filename by replacing invalid characters
 * @param {string} filename - Original filename
 * @returns {string} - Sanitized filename
 */
function sanitizeFilename(filename) {
  if (!filename) return '';
  
  // Replace forbidden characters with underscores
  return filename.replace(config.FORBIDDEN_CHARS, '_')
    // Remove leading/trailing dots and spaces
    .replace(/^[\s.]+|[\s.]+$/g, '')
    // Replace path separators with underscores
    .replace(/[/\\]/g, '_');
}

// Initialize directories on module load
ensureDirectoriesExist().catch(console.error);

module.exports = {
  getSafeCategoryPath,
  getSafeFilePath,
  validatePath,
  sanitizeFilename,
  getRelativePath,
  registerSafeDirectory,
  setBaseDirectory,
  isAllowedExtension,
  ensureDirectoriesExist,
  config
};