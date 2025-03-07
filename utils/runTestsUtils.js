const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs").promises;
const fileUtils = require("./fileUtils");
const pathUtils = require("./pathUtils");
const properties = require("./properties");
const os = require("os");

/**
 * Configuration for test utilities
 */
const config = {
  TEST_CATEGORY: properties.CATEGORIES.TESTS,
  SCRAPED_TESTS: properties.CATEGORIES.PLAYWRIGHT,
  REPORT_CATEGORY: properties.CATEGORIES.REPORTS,
  TEMP_CATEGORY: properties.CATEGORIES.TEMP,
  DEFAULT_TIMEOUT: properties.TEST_TIMEOUT,
  DEFAULT_REPORTER: "json",
  PLAYWRIGHT_CONFIG: path.resolve(process.cwd(), "playwright.config.js"),
  AVAILABLE_REPORTERS: ["json", "html", "dot", "line", "list", "junit"],
  RESULT_FILE: "test-results.json"
};

/**
 * Determines the appropriate command to run based on operating system
 * @returns {Object} - Command and args structure
 */
function getCommandForOS() {
  const isWindows = os.platform() === "win32";
  
  if (isWindows) {
    return {
      command: "cmd.exe",
      shell: true,
      argPrefix: ["/c"]
    };
  } else {
    return {
      command: "npx",
      shell: false,
      argPrefix: []
    };
  }
}

/**
 * Validates options for running tests
 * @param {Object} options - Test run options
 * @returns {Object|null} - Validation error or null if valid
 */
function validateTestOptions(options) {
  // Validate reporter
  if (options.reporter && !config.AVAILABLE_REPORTERS.includes(options.reporter)) {
    return {
      error: `Invalid reporter: ${options.reporter}. Available reporters: ${config.AVAILABLE_REPORTERS.join(", ")}`,
      code: 400
    };
  }
  
  // Validate timeout
  if (options.timeout && (isNaN(options.timeout) || options.timeout <= 0)) {
    return {
      error: "Timeout must be a positive number",
      code: 400
    };
  }
  
  return null;
}

/**
 * Prepares a test file for execution
 * @param {string} fileName - Original filename
 * @param {Buffer|string} content - File content
 * @returns {Promise<Object>} - Information about the saved test file
 */
async function prepareTestFile(fileName, content) {
  try {
    // Get a safe filename
    const safeFileName = pathUtils.sanitizeFilename(fileName);
    
    // Make sure the test directory exists
    const testDirPath = pathUtils.getSafeCategoryPath(config.TEST_CATEGORY);
    if (!testDirPath) {
      await fileUtils.createFolder("", config.TEST_CATEGORY);
    }
    
    // Save the file
    const saveResult = await fileUtils.saveDataToFile(
      config.TEST_CATEGORY,
      safeFileName,
      content,
      { raw: Buffer.isBuffer(content), overwrite: true }
    );
    
    if (!saveResult.success) {
      throw new Error(`Failed to save test file: ${saveResult.error}`);
    }
    
    // Get the full path
    const fullPath = pathUtils.getSafeFilePath(config.TEST_CATEGORY, safeFileName);
    
    return {
      success: true,
      fileName: safeFileName,
      filePath: fullPath,
      relativePath: saveResult.relativePath
    };
  } catch (error) {
    console.error("Error preparing test file:", error);
    throw error;
  }
}

/**
 * Runs Playwright tests on a saved test spec.
 * @param {string} testFilePath - The full file path of the test file.
 * @param {Object} options - Test execution options
 * @param {string} options.reporter - Reporter format (default: json)
 * @param {string} options.project - Playwright project to run
 * @param {number} options.timeout - Test execution timeout in ms
 * @param {boolean} options.headed - Whether to run in headed mode
 * @param {string} options.testName - Specific test name to run
 * @param {boolean} options.debug - Whether to run in debug mode
 * @returns {Promise<object>} - The test results or error details.
 */
async function runPlaywrightTests(testFilePath, options = {}) {
  // Validate the test file path
  if (!testFilePath || !await fileUtils.fileExists(testFilePath)) {
    throw new Error(`Test file does not exist: ${testFilePath}`);
  }
  
  // Validate options
  const optionsError = validateTestOptions(options);
  if (optionsError) {
    throw new Error(optionsError.error);
  }
  
  // Set default options
  const reporter = options.reporter || config.DEFAULT_REPORTER;
  const timeout = options.timeout || config.DEFAULT_TIMEOUT;
  const testFileName = path.basename(testFilePath);
  
  return new Promise((resolve, reject) => {
    console.log(`[INFO] Running Playwright tests on: ${testFileName}`);
    
    // Build the Playwright command
    const cmdInfo = getCommandForOS();
    const args = [...cmdInfo.argPrefix];
    
    // Build the test command
    let testCommand = `npx playwright test ${testFileName} --reporter=${reporter}`;
    
    // Add optional parameters
    if (options.project) {
      testCommand += ` --project=${options.project}`;
    }
    
    if (options.headed) {
      testCommand += " --headed";
    }
    
    if (options.debug) {
      testCommand += " --debug";
    }
    
    if (options.testName) {
      testCommand += ` -g "${options.testName}"`;
    }

    console.log(`[INFO] Running command: ${testCommand}`)
    
    // Add the test command to args
    if (cmdInfo.command === "cmd.exe") {
      args.push(testCommand);
    } else {
      // Split the command for non-Windows platforms
      args.push(...testCommand.split(" ").slice(1)); // Remove the 'npx' part
    }
    
    // Spawn the process
    const process = spawn(cmdInfo.command, args, {
      shell: cmdInfo.shell,
      timeout: timeout
    });
    
    let output = "";
    let errorOutput = "";
    
    process.stdout.on("data", (data) => {
      const chunk = data.toString();
      output += chunk;
      console.log(`[PLAYWRIGHT] ${chunk.trim()}`);
    });
    
    process.stderr.on("data", (data) => {
      const chunk = data.toString();
      errorOutput += chunk;
      console.error(`[PLAYWRIGHT ERROR] ${chunk.trim()}`);
    });
    
    process.on("error", (error) => {
      console.error("[ERROR] Failed to start Playwright process:", error);
      reject({
        error: "Failed to start Playwright process",
        details: error.message
      });
    });
    
    process.on("close", async (code) => {
      console.log(`[INFO] Playwright process exited with code: ${code}`);
      
      // For HTML reporter, we don't get JSON output, so handle differently
      if (reporter === "html") {
        return resolve({
          success: code === 0,
          exitCode: code,
          reportPath: "playwright-report/index.html",
          message: code === 0 ? "Tests completed successfully" : "Tests completed with failures"
        });
      }
      
      // For all other reporters, process the output
      try {
        // Some basic information even if parsing fails
        const basicResult = {
          success: code === 0,
          exitCode: code,
          command: testCommand
        };
        
        // If no output but process exited with error
        if (!output && code !== 0) {
          basicResult.error = "Playwright test failed";
          basicResult.errorOutput = errorOutput;
          return resolve(basicResult);
        }
        
        // Try to parse JSON output
        if (reporter === "json" && output) {
          try {
            const fullReport = JSON.parse(output);
            
            // Extract simplified results
            const simplifiedResults = extractSimplifiedResults(fullReport);
            
            // Calculate summary statistics
            const summary = calculateTestSummary(simplifiedResults);
            
            // Save the results to a file for later reference
            await saveTestResults(fullReport, simplifiedResults);
            
            resolve({
              ...basicResult,
              simpleResults: simplifiedResults,
              summary,
              fullReport
            });
          } catch (parseError) {
            console.error("[ERROR] Failed to parse Playwright JSON output:", parseError);
            resolve({
              ...basicResult,
              error: "Failed to parse Playwright JSON output",
              rawOutput: output.substring(0, 1000) // Truncate very large outputs
            });
          }
        } else {
          // For non-JSON reporters
          resolve({
            ...basicResult,
            output: output.substring(0, 2000) // Truncate very large outputs
          });
        }
      } catch (error) {
        console.error("[ERROR] Error processing test results:", error);
        reject({
          error: "Error processing test results",
          details: error.message,
          exitCode: code
        });
      }
    });
  });
}

/**
 * Extracts simplified test results from the full Playwright report
 * @param {Object} fullReport - Full Playwright JSON report
 * @returns {Array} - Array of simplified test results
 */
function extractSimplifiedResults(fullReport) {
  if (!fullReport || !fullReport.suites) {
    return [];
  }
  
  // Extract test results from the nested structure
  const extractTests = (suite) => {
    let results = [];
    
    // Process specs (test cases) in this suite
    if (suite.specs) {
      suite.specs.forEach(spec => {
        if (spec.tests && spec.tests.length > 0 && spec.tests[0].results) {
          spec.tests[0].results.forEach(result => {
            results.push({
              title: spec.title,
              status: result.status,
              duration: result.duration,
              file: spec.file,
              suite: suite.title,
              retry: result.retry,
              error: result.error ? {
                //message: result.error.message,
                stack: result.error.stack
              } : null
            });
          });
        }
      });
    }
    
    // Process nested suites
    if (suite.suites) {
      suite.suites.forEach(childSuite => {
        results = results.concat(extractTests(childSuite));
      });
    }
    
    return results;
  };
  
  return fullReport.suites.flatMap(extractTests);
}

/**
 * Calculates summary statistics from test results
 * @param {Array} results - Array of test results
 * @returns {Object} - Test summary
 */
function calculateTestSummary(results) {
  const summary = {
    total: results.length,
    passed: 0,
    failed: 0,
    skipped: 0,
    flaky: 0,
    duration: 0
  };
  
  results.forEach(result => {
    if (result.status === "passed") {
      summary.passed++;
    } else if (result.status === "failed") {
      summary.failed++;
    } else if (result.status === "skipped") {
      summary.skipped++;
    }
    
    if (result.retry > 0) {
      summary.flaky++;
    }
    
    summary.duration += result.duration || 0;
  });
  
  return summary;
}

/**
 * Saves test results to files for later reference
 * @param {Object} fullReport - Full Playwright JSON report
 * @param {Array} simplifiedResults - Simplified test results
 * @returns {Promise<Object>} - Result of saving the files
 */
async function saveTestResults(fullReport, simplifiedResults) {
  try {
    // Create the report directory if it doesn't exist
    const reportDirPath = pathUtils.getSafeCategoryPath(config.REPORT_CATEGORY);
    if (!reportDirPath) {
      await fileUtils.createFolder("", config.REPORT_CATEGORY);
    }
    
    // Generate timestamp for filenames
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    
    // Save full report
    const fullReportResult = await fileUtils.saveDataToFile(
      config.REPORT_CATEGORY,
      `full-report-${timestamp}.json`,
      fullReport
    );
    
    // Save simplified results
    const simplifiedResult = await fileUtils.saveDataToFile(
      config.REPORT_CATEGORY,
      `summary-${timestamp}.json`,
      {
        timestamp,
        summary: calculateTestSummary(simplifiedResults),
        results: simplifiedResults
      }
    );
    
    // Also save to a fixed filename for easy access to latest results
    await fileUtils.saveDataToFile(
      config.REPORT_CATEGORY,
      config.RESULT_FILE,
      {
        timestamp,
        summary: calculateTestSummary(simplifiedResults),
        results: simplifiedResults
      },
      { overwrite: true }
    );
    
    return {
      success: fullReportResult.success && simplifiedResult.success,
      fullReportPath: fullReportResult.relativePath,
      summaryPath: simplifiedResult.relativePath
    };
  } catch (error) {
    console.error("[ERROR] Failed to save test results:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Gets the latest test results
 * @returns {Promise<Object>} - Latest test results or error
 */
async function getLatestTestResults() {
  try {
    const resultPath = pathUtils.getSafeFilePath(config.REPORT_CATEGORY, config.RESULT_FILE);
    
    if (!resultPath || !await fileUtils.fileExists(resultPath)) {
      return { success: false, error: "No test results found" };
    }
    
    const result = await fileUtils.getFile(config.REPORT_CATEGORY, config.RESULT_FILE);
    
    if (!result.success) {
      return { success: false, error: "Failed to retrieve test results" };
    }
    
    return { success: true, results: result.content };
  } catch (error) {
    console.error("[ERROR] Failed to get latest test results:", error);
    return { success: false, error: error.message };
  }
}

// Register necessary directories with pathUtils to ensure they exist and are safe
pathUtils.registerSafeDirectory(config.TEST_CATEGORY, config.TEST_CATEGORY);
pathUtils.registerSafeDirectory(config.REPORT_CATEGORY, config.REPORT_CATEGORY);
pathUtils.registerSafeDirectory(config.TEMP_CATEGORY, config.TEMP_CATEGORY);

module.exports = {
  runPlaywrightTests,
  prepareTestFile,
  getLatestTestResults,
  config
};