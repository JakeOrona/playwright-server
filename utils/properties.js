const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
//const logger = require("./logUtils");

// Load environment variables from .env file
dotenv.config();

// Default values
const defaultConfig = {
  PORT: 3000,
  HOST: "localhost",
  NODE_ENV: "development",
  LOG_LEVEL: "INFO",
  BASE_DIR: path.resolve(__dirname, "../fileStorage"),
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  TEST_TIMEOUT: 180000, // 3 minutes
  SCRAPE_TIMEOUT: 30000, // 30 seconds
  FORMAT_TIMEOUT: 60000, // 1 minute
  IN_MEMORY_LOG_LIMIT: 1000
};


// Required environment variables
const requiredEnv = ["PORT", "HOST"];

// Check for required variables
const missingVars = requiredEnv.filter(key => !process.env[key]);
if (missingVars.length > 0) {
  console.log(`Missing required environment variables: ${missingVars.join(", ")}`);
  console.log(`Using defaults: ${missingVars.map(key => `${key}=${defaultConfig[key]}`).join(", ")}`);
}

// Build configuration with defaults and environment variables
const config = {
  PORT: Number(process.env.PORT || defaultConfig.PORT),
  HOST: process.env.HOST || defaultConfig.HOST,
  NODE_ENV: process.env.NODE_ENV || defaultConfig.NODE_ENV,
  
  BASE_DIR: path.resolve(__dirname, process.env.BASE_DIR) || defaultConfig.BASE_DIR,
  
  LOG_LEVEL: process.env.LOG_LEVEL || defaultConfig.LOG_LEVEL,
  IN_MEMORY_LOG_LIMIT: Number(process.env.IN_MEMORY_LOG_LIMIT || defaultConfig.IN_MEMORY_LOG_LIMIT),
  
  MAX_FILE_SIZE: Number(process.env.MAX_FILE_SIZE || defaultConfig.MAX_FILE_SIZE),
  
  TEST_TIMEOUT: Number(process.env.TEST_TIMEOUT || defaultConfig.TEST_TIMEOUT),
  SCRAPE_TIMEOUT: Number(process.env.SCRAPE_TIMEOUT || defaultConfig.SCRAPE_TIMEOUT),
  FORMAT_TIMEOUT: Number(process.env.FORMAT_TIMEOUT || defaultConfig.FORMAT_TIMEOUT),
  
  CATEGORIES: {
    LOGS: "logs",
    REPORTS: "reports",
    TESTS: "tests",
    SCRAPED: "scraped",
    FORMATTED: "formatted",
    SCREENSHOTS: "screenshots",
    UPLOADS: "uploads",
    TEMP: "temp",
    PLAYWRIGHT: "playwright",
    DOCS: "docs",
  }
};

// Validate numeric settings
Object.entries(config).forEach(([key, value]) => {
  if (typeof value === 'number' && isNaN(value)) {
    console.log(`Invalid numeric value for ${key}, using default: ${defaultConfig[key]}`);
    config[key] = defaultConfig[key];
  }
});

// Check for non-existent but important directories
try {
  if (!fs.existsSync(config.BASE_DIR)) {
    console.log(`Base directory does not exist: ${config.BASE_DIR}`);
    console.log(`It will be created when the server starts`);
  }
} catch (error) {
  logger.error(`Error checking base directory: ${error.message}`);
}

// Print configuration summary
if (process.env.NODE_ENV !== 'production') {
  console.log('Server configuration:');
  console.log(`  - Environment: ${config.NODE_ENV}`);
  console.log(`  - Server: ${config.HOST}:${config.PORT}`);
  console.log(`  - Base directory: ${config.BASE_DIR}`);
  console.log(`  - Log level: ${config.LOG_LEVEL}`);
}

module.exports = config;