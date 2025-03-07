const express = require("express");
const multer = require("multer");
const testUtils = require("../utils/runTestsUtils");
const fileUtils = require("../utils/fileUtils");
const pathUtils = require("../utils/pathUtils");
const path = require("path");
const logger = require("../utils/logUtils");
const { log } = require("console");

const router = express.Router();

// Configure multer for test file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit for test files
  },
  fileFilter: (req, file, cb) => {
    // Only accept JavaScript and TypeScript files
    const allowedExtensions = ['.js', '.ts', '.mjs', '.cjs'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedExtensions.includes(ext)) {
      return cb(null, true);
    }
    
    cb(new Error(`Only JavaScript and TypeScript files are allowed. Got: ${ext}`));
  }
});

/**
 * POST /tests
 * Upload a test file and run Playwright tests --upload.single("file")
 */
router.post("/", async (req, res) => {
  try {
    const testOptions = {
      reporter: req.query.reporter || "json",
      project: req.query.project,
      timeout: req.query.timeout ? parseInt(req.query.timeout, 10) : undefined,
      headed: req.query.headed === "true",
      debug: req.query.debug === "true",
      testName: req.query.testName,
      pathCategory: req.query.category || "playwright"
    };
    
    // Handle specified test file path
    if (req.query.testFile) {
      // Check file extension
      const fileExt = path.extname(req.query.testFile).toLowerCase();
      const allowedExtensions = ['.js', '.ts', '.mjs', '.cjs', '.jsx', '.tsx'];
      
      if (!allowedExtensions.includes(fileExt)) {
        return res.status(400).json({
          success: false,
          error: `Invalid test file type. Only JavaScript and TypeScript files are allowed. Got: ${fileExt}`
        });
      }

      logger.info(`Playwright Run Specified Spec File: ${req.query.testFile}`);
      const testFilePath = pathUtils.getSafeFilePath(testOptions.pathCategory, req.query.testFile);
      
      logger.info(`Playwright Run Specified Spec: File Path= ${testFilePath}`);

      if (!testFilePath) {
        return res.status(400).json({
          success: false,
          error: `Invalid test file path: ${req.query.testFile}`
        });
      }
      
      if (!await fileUtils.fileExists(testFilePath)) {
        return res.status(404).json({
          success: false,
          error: `Test file not found: ${req.query.testFile}`
        });
      }
      
      logger.info(`Playwright Run Specified Spec: File Found= ${testFilePath}`);
      logger.info(`Playwright attempting to run spec: Spec path= ${testFilePath}`);
      
      const testResults = await testUtils.runPlaywrightTests(
        testFilePath,
        testOptions
      );

      // Prepare report URL for HTML reporter
      let reportUrl = null;
      if (testOptions.reporter === "html") {
        logger.info('Preparing report URL for HTML reporter');
        reportUrl = `/reports/playwright-report/index.html`;
      }
      
      // Return the test results via JSON
      res.json({
        testFile: req.query.testFile,
        success: testResults.success,
        message: testResults.success
          ? "Tests completed successfully"
          : "Tests completed with failures",
        results: testResults.results,
        summary: testResults.summary,
        reportUrl,
        fullReport: req.query.includeFullReport === "true" ? testResults.fullReport : undefined
      });
    } else {
      return res.status(400).json({
        success: false,
        error: "No test file provided. Please upload a file or specify a test file path."
      });
    }
  } catch (error) {
    console.error("[ERROR] Playwright test execution failed:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Playwright test execution failed",
      details: error.stack
    });
  }
});

/**
 * GET /run-tests/results
 * Get latest test results
 */
router.get("/results", async (req, res) => {
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
    console.error("[ERROR] Failed to retrieve test results:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to retrieve test results"
    });
  }
});

/**
 * POST /run-tests/all
 * Run all tests in a directory
 */
router.post("/all", async (req, res) => {
  try {
    const category = req.body.category || testUtils.config.SCRAPED_TESTS;
    const pattern = req.body.pattern || "**/*.spec.js";
    
    // Get all test files matching the pattern
    const categoryPath = pathUtils.getSafeCategoryPath(category);
    if (!categoryPath) {
      return res.status(400).json({
        success: false,
        error: `Invalid category path: ${category}`
      });
    }
    
    // For simplicity, we're just running the entire test directory with Playwright's built-in discovery
    const testOptions = {
      reporter: req.body.reporter || "json",
      project: req.body.project,
      timeout: req.body.timeout ? parseInt(req.body.timeout, 10) : undefined,
      headed: req.body.headed === "true",
      debug: req.body.debug === "true",
      testName: req.body.testName
    };
    
    // Build a dummy test file path that actually targets the whole directory
    const testPath = path.join(categoryPath, pattern);
    
    // Run the tests
    const testResults = await testUtils.runPlaywrightTests(
      testPath,
      testOptions
    );
    
    // Prepare report URL for HTML reporter
    let reportUrl = null;
    if (testOptions.reporter === "html") {
      reportUrl = `/reports/playwright-report/index.html`;
    }
    
    res.json({
      success: testResults.success,
      message: testResults.success
        ? "Tests completed successfully"
        : "Tests completed with failures",
      results: testResults.results,
      summary: testResults.summary,
      reportUrl,
      testPattern: pattern,
      category
    });
  } catch (error) {
    console.error("[ERROR] Failed to run all tests:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to run all tests"
    });
  }
});

module.exports = router;