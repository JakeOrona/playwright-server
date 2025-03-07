const express = require("express");
const { scrapeWebsite, scrapeMultipleWebsites, config } = require("../utils/scraperUtils");

const router = express.Router();

/**
 * POST /scrape
 * Scrapes a single website or multiple websites
 * Body: {
 *   "urls": ["https://example.com"],
 *   "options": {
 *     "timeout": 30000,
 *     "waitUntil": "domcontentloaded",
 *     "screenshots": true,
 *     "extractCss": false,
 *     "category": "scraped"
 *   }
 * }
 */
router.post("/", async (req, res) => {
  console.log("[INFO] Received scraping request...");
  
  const { urls, options = {} } = req.body;
  
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ 
      success: false,
      error: "Please provide an array of valid URLs." 
    });
  }
  
  try {
    let results;
    
    // Determine if we should use single or batch scraping
    if (urls.length === 1) {
      // Single URL scraping
      const data = await scrapeWebsite(urls[0], options);
      results = {
        results: [data],
        errors: [],
        totalProcessed: 1,
        successCount: 1,
        errorCount: 0
      };
    } else {
      // Multiple URLs scraping with concurrency control
      const concurrency = options.concurrency || 3;
      results = await scrapeMultipleWebsites(urls, options, concurrency);
    }
    
    res.json({
      success: true,
      data: results.results,
      errors: results.errors,
      stats: {
        totalProcessed: results.totalProcessed,
        successCount: results.successCount,
        errorCount: results.errorCount
      }
    });
  } catch (error) {
    console.error("[ERROR] Scraper failed:", error.message);
    res.status(500).json({ 
      success: false,
      error: "Scraping failed", 
      details: error.message 
    });
  }
});

/**
 * POST /scrape/playwright
 * Scrapes a website and returns only the Playwright script/locators
 * Body: {
 *   "url": "https://example.com",
 *   "options": {
 *     "selector": "form",  // Optional specific element to generate locators for
 *     "includeScript": true
 *   }
 * }
 */
router.post("/playwright", async (req, res) => {
  const { url, options = {} } = req.body;
  
  if (!url) {
    return res.status(400).json({ 
      success: false,
      error: "Please provide a valid URL." 
    });
  }
  
  try {
    // Set options to focus on Playwright code generation
    const scrapingOptions = {
      ...options,
      extractCss: false, // We only need structure for locators
      screenshots: false, // No need for screenshots
      category: "playwright" // Store in a separate category
    };
    
    // Scrape the website
    const result = await scrapeWebsite(url, scrapingOptions);
    
    // Return just the Playwright-specific parts
    const response = {
      success: true,
      url: result.url,
      title: result.title,
      locators: result.playwrightLocators,
      script: options.includeScript !== false ? result.playwrightScript : undefined,
      filePath: result.filePath
    };
    
    // If a specific selector was requested, filter locators
    if (options.selector) {
      // Filter locators to only those containing the specified selector
      Object.keys(response.locators).forEach(category => {
        response.locators[category] = response.locators[category].filter(item => 
          item.locator.includes(options.selector) || 
          (item.element.selector && item.element.selector.includes(options.selector))
        );
      });
    }
    
    res.json(response);
  } catch (error) {
    console.error("[ERROR] Playwright code generation failed:", error.message);
    res.status(500).json({ 
      success: false,
      error: "Playwright code generation failed", 
      details: error.message 
    });
  }
});

/**
 * GET /scrape/config
 * Returns the current scraper configuration
 */
router.get("/config", (req, res) => {
  res.json({
    success: true,
    config: {
      ...config,
      // Don't include any sensitive information that might be in the config
    }
  });
});

module.exports = router;