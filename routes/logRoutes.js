const express = require("express");
const logger = require("../utils/logUtils");

const router = express.Router();

/**
 * GET /logs
 * Get all logs with optional filtering
 * Query parameters:
 * - level: Filter by log level (ERROR, WARNING, INFO, DEBUG)
 * - limit: Limit number of logs returned
 * - search: Search text in log messages
 */
router.get("/", (req, res) => {
  try {
    const { level, limit, search } = req.query;
    
    const options = {
      level,
      search,
      limit: limit ? parseInt(limit, 10) : undefined
    };
    
    const logs = logger.getLogs(options);
    
    res.json({
      success: true,
      count: logs.length,
      logs
    });
  } catch (error) {
    logger.error("Failed to retrieve logs", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve logs"
    });
  }
});

/**
 * GET /logs/live
 * Stream live logs via Server-Sent Events
 * Query parameters:
 * - level: Filter by log level (ERROR, WARNING, INFO, DEBUG)
 * - search: Search text in log messages
 */
router.get("/live", (req, res) => {
  try {
    const { level, search } = req.query;
    
    // Set up SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    
    // Send an initial connection message
    res.write(`data: ${JSON.stringify({ type: "connection", message: "Connected to log stream" })}\n\n`);
    
    // Log the connection
    logger.info("Client connected to live logs");
    
    // Create a listener for new log entries
    const removeListener = logger.addListener((logEntry) => {
      // Filter by level if specified
      if (level && logEntry.level !== level.toUpperCase()) {
        return;
      }
      
      // Filter by search text if specified
      if (search && !logEntry.message.toLowerCase().includes(search.toLowerCase())) {
        return;
      }
      
      // Send the log entry to the client
      res.write(`data: ${JSON.stringify(logEntry)}\n\n`);
    });
    
    // Handle client disconnection
    req.on("close", () => {
      // Remove the listener
      removeListener();
      
      // Log the disconnection
      logger.info("Client disconnected from live logs");
    });
  } catch (error) {
    logger.error("Failed to stream logs", error);
    res.status(500).json({
      success: false,
      error: "Failed to stream logs"
    });
  }
});

/**
 * GET /logs/download
 * Download logs as a file
 * Query parameters:
 * - level: Filter by log level (ERROR, WARNING, INFO, DEBUG)
 * - format: Output format (json or text)
 */
router.get("/download", (req, res) => {
  try {
    const { level, format = "text" } = req.query;
    
    // Get the logs
    const logs = logger.getLogs({ level });
    
    // Set the content type based on format
    if (format.toLowerCase() === "json") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="logs-${Date.now()}.json"`);
      res.send(JSON.stringify(logs, null, 2));
    } else {
      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Content-Disposition", `attachment; filename="logs-${Date.now()}.txt"`);
      
      // Format logs as text
      const textLogs = logs.map(log => {
        let entry = `${log.timestamp} [${log.level}] ${log.message}`;
        if (log.error) {
          entry += `\n  Error: ${log.error.message}`;
          if (log.error.stack) {
            entry += `\n  Stack: ${log.error.stack}`;
          }
        }
        return entry;
      }).join("\n\n");
      
      res.send(textLogs);
    }
  } catch (error) {
    logger.error("Failed to download logs", error);
    res.status(500).json({
      success: false,
      error: "Failed to download logs"
    });
  }
});

/**
 * POST /logs/level
 * Set the current log level
 * Body: { level: "INFO" }
 */
router.post("/level", express.json(), (req, res) => {
  try {
    const { level } = req.body;
    
    if (!level) {
      return res.status(400).json({
        success: false,
        error: "Level parameter is required"
      });
    }
    
    const validLevels = Object.keys(logger.getConfig().LOG_LEVELS);
    
    if (!validLevels.includes(level.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: `Invalid log level. Valid levels are: ${validLevels.join(", ")}`
      });
    }
    
    logger.setLogLevel(level);
    
    res.json({
      success: true,
      level: level.toUpperCase(),
      message: `Log level set to ${level.toUpperCase()}`
    });
  } catch (error) {
    logger.error("Failed to set log level", error);
    res.status(500).json({
      success: false,
      error: "Failed to set log level"
    });
  }
});

module.exports = router;