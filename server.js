const express = require("express");
const cors = require("cors");
const path = require("path");
const { PORT, HOST } = require("./utils/properties");
const logger = require("./utils/logUtils");
const pathUtils = require("./utils/pathUtils");
const fileUtils = require("./utils/fileUtils");

// Import route handlers
const scrapeRoutes = require("./routes/scrapeRoutes");
const fileRoutes = require("./routes/fileRoutes");
const reportRoutes = require("./routes/reportRoutes");
const runTestsRoutes = require("./routes/runTestsRoutes");
const formatRoutes = require("./routes/formatRoutes");
const helpRoutes = require("./routes/helpRoutes");
const logRoutes = require("./routes/logRoutes");

// Create Express app
const app = express();

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl} ${req.ip}`);
  
  // Record response time
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.debug(`${req.method} ${req.originalUrl} completed with status ${res.statusCode} in ${duration}ms`);
  });
  
  next();
});

// Standard middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors());

// Error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    logger.error('JSON parsing error', err);
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid JSON in request body' 
    });
  }
  next(err);
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Mount route handlers
app.use("/api/scrape", scrapeRoutes);
app.use("/api/files", fileRoutes);
app.use("/reports", reportRoutes);
app.use("/api/tests", runTestsRoutes);
app.use("/api/format", formatRoutes);
app.use("/api/logs", logRoutes);
app.use("/api/help", helpRoutes);

// Root endpoint - API information
app.get("/", (req, res) => {
  res.json({
    name: "Playwright Automation Server API",
    version: "1.0.0",
    endpoints: "/api/help",
    documentation: "/api/help/docs"
  });
});

// 404 handler
app.use((req, res) => {
  logger.warning(`404 Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    error: "Not Found",
    message: `The requested resource '${req.originalUrl}' was not found.`,
    documentation: "/api/help"
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error(`Unhandled error processing ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({
    success: false,
    error: "Internal Server Error",
    message: process.env.NODE_ENV === 'production' 
      ? "An unexpected error occurred" 
      : err.message
  });
});

// Ensure base directories exist
const ensureDirectories = async () => {
  try {
    await pathUtils.ensureDirectoriesExist();
    logger.info("Base directories verified");
  } catch (error) {
    logger.error("Failed to verify base directories", error);
    process.exit(1);
  }
};

// Start server
const startServer = async () => {
  try {
    // Ensure required directories exist
    await ensureDirectories();
    
    // Start the server
    app.listen(PORT, HOST, () => {
      logger.info(`Server running at http://${HOST}:${PORT}`);
    });
  } catch (error) {
    logger.error("Failed to start server", error);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', err);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

// Start the server
startServer();