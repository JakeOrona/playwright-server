const express = require("express");
const path = require("path");
const fs = require("fs").promises;
const fileUtils = require("../utils/fileUtils");
const pathUtils = require("../utils/pathUtils");
const testUtils = require("../utils/runTestsUtils");

const router = express.Router();

/**
 * Configuration for report routes
 */
const config = {
  REPORT_DIR: path.join(process.cwd(), "playwright-report"),
  HISTORY_DIR: testUtils.config.REPORT_CATEGORY,
  DEFAULT_INDEX: "index.html"
};

/**
 * Check if the Playwright report directory exists
 * @returns {Promise<boolean>} Whether the directory exists
 */
async function reportDirectoryExists() {
  try {
    await fs.access(config.REPORT_DIR);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Middleware to log report access
 */
router.use((req, res, next) => {
  console.log(`[INFO] Playwright report accessed: ${req.originalUrl} from ${req.ip}`);
  next();
});

/**
 * GET /reports
 * Show available reports or redirect to latest report
 */
router.get("/", async (req, res) => {
  try {
    // Check if we should redirect to the latest HTML report
    if (req.query.latest === "true") {
      // Check if the Playwright report directory exists
      if (await reportDirectoryExists()) {
        return res.redirect(`/reports/playwright-report/${config.DEFAULT_INDEX}`);
      }
      
      // If not, inform the user
      return res.status(404).json({
        success: false,
        error: "No Playwright HTML report found. Run tests with the HTML reporter first."
      });
    }
    
    // Get list of JSON reports from the reports directory
    const reportsResult = await fileUtils.getFiles(config.HISTORY_DIR, ".json", {
      includeStats: true,
      sortBy: "date",
      sortOrder: "desc"
    });
    
    if (!reportsResult.success) {
      return res.status(reportsResult.code || 500).json({
        success: false,
        error: reportsResult.error || "Failed to retrieve reports"
      });
    }
    
    // Get latest test results
    const latestResults = await testUtils.getLatestTestResults();
    
    // Check if HTML report directory exists
    const htmlReportExists = await reportDirectoryExists();
    
    res.json({
      success: true,
      htmlReportAvailable: htmlReportExists,
      htmlReportPath: htmlReportExists ? `/reports/playwright-report/${config.DEFAULT_INDEX}` : null,
      latestResults: latestResults.success ? latestResults.results : null,
      reports: reportsResult.files.map(file => ({
        name: file.fileName,
        path: `/files/file?category=${config.HISTORY_DIR}&fileName=${file.fileName}`,
        date: file.modified,
        size: file.size
      }))
    });
  } catch (error) {
    console.error("[ERROR] Failed to list reports:", error);
    res.status(500).json({
      success: false,
      error: "Failed to list reports"
    });
  }
});

/**
 * GET /reports/latest-results
 * Get the latest test results in JSON format
 */
router.get("/latest-results", async (req, res) => {
  try {
    const results = await testUtils.getLatestTestResults();
    
    if (!results.success) {
      return res.status(404).json({
        success: false,
        error: results.error || "No test results found"
      });
    }
    
    res.json({
      success: true,
      results: results.results
    });
  } catch (error) {
    console.error("[ERROR] Failed to retrieve latest test results:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve latest test results"
    });
  }
});

/**
 * GET /reports/html-status
 * Check if an HTML report is available
 */
router.get("/html-status", async (req, res) => {
  try {
    const exists = await reportDirectoryExists();
    
    res.json({
      success: true,
      htmlReportAvailable: exists,
      htmlReportPath: exists ? `/reports/playwright-report/${config.DEFAULT_INDEX}` : null
    });
  } catch (error) {
    console.error("[ERROR] Failed to check HTML report status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to check HTML report status"
    });
  }
});

/**
 * Serve the static Playwright HTML report if it exists
 */
router.use("/playwright-report", async (req, res, next) => {
  try {
    // Check if the report directory exists
    if (await reportDirectoryExists()) {
      // Serve the static files
      express.static(config.REPORT_DIR)(req, res, next);
    } else {
      // If not, return a 404
      res.status(404).json({
        success: false,
        error: "Playwright HTML report not found. Run tests with the HTML reporter first."
      });
    }
  } catch (error) {
    console.error("[ERROR] Failed to serve HTML report:", error);
    res.status(500).json({
      success: false,
      error: "Failed to serve HTML report"
    });
  }
});

module.exports = router;