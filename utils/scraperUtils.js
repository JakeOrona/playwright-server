const { chromium } = require("playwright");
const fileUtils = require("./fileUtils");
const pathUtils = require("./pathUtils");
const properties = require("./properties");
const path = require("path");

/**
 * Configuration for the scraper
 */
const config = {
  DEFAULT_TIMEOUT: properties.SCRAPE_TIMEOUT,
  DEFAULT_WAIT_UNTIL: "domcontentloaded",
  SCREENSHOT_CATEGORY: properties.CATEGORIES.SCREENSHOTS,
  DEFAULT_CATEGORY: properties.CATEGORIES.SCRAPED,
  PLAYWRIGHT_CATEGORY: properties.CATEGORIES.PLAYWRIGHT,
  MAX_CONCURRENT_SCRAPES: 3,
  DEFAULT_VIEWPORT: { width: 1280, height: 720 }
};

/**
 * Generates a safe filename from a URL
 * @param {string} url - The URL to convert to filename
 * @returns {string} - A safe filename
 */
function urlToFilename(url) {
  try {
    // Extract hostname and pathname
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const pathname = urlObj.pathname.replace(/\//g, "");
    
    // Create a base filename
    let filename = `${hostname}${pathname}`;
    
    // Sanitize the filename using pathUtils
    filename = pathUtils.sanitizeFilename(filename);
    
    // Add timestamp to ensure uniqueness
    const timestamp = Date.now();
    filename = `${filename.substring(0, 50)}_${timestamp}.json`;
    
    return filename;
  } catch (error) {
    // Fallback for invalid URLs
    return pathUtils.sanitizeFilename(`scraped_data_${Date.now()}.json`);
  }
}

/**
 * Generates a specific Playwright locator for an element
 * @param {Object} element - Element information
 * @param {string} elementType - Type of element (link, button, etc.)
 * @returns {string} - Playwright locator code
 */
function generateLocator(element, elementType) {
  switch (elementType) {
    case "link":
      if (element.href) {
        return `page.locator('a[href="${element.href}"]')`;
      } else if (element.text) {
        return `page.getByRole('link', { name: '${element.text.replace(/'/g, "\\'")}' })`;
      }
      return `page.locator('${element.selector}')`;
      
    case "button":
      if (element.id) {
        return `page.locator('#${element.id}')`;
      } else if (element.text) {
        return `page.getByRole('button', { name: '${element.text.replace(/'/g, "\\'")}' })`;
      }
      return `page.locator('${element.selector}')`;
      
    case "input":
      if (element.name) {
        return `page.locator('input[name="${element.name}"]')`;
      } else if (element.placeholder) {
        return `page.getByPlaceholder('${element.placeholder.replace(/'/g, "\\'")}')`;
      } else if (element.id) {
        return `page.locator('#${element.id}')`;
      }
      return `page.locator('${element.selector}')`;
      
    case "heading":
      if (element.text) {
        return `page.getByRole('heading', { name: '${element.text.replace(/'/g, "\\'")}' })`;
      }
      return `page.locator('${element.tag}:has-text("${element.text.replace(/"/g, '\\"')}")')`;
      
    case "image":
      if (element.alt) {
        return `page.getByAltText('${element.alt.replace(/'/g, "\\'")}')`;
      } else if (element.src) {
        return `page.locator('img[src*="${path.basename(element.src)}"]')`;
      }
      return `page.locator('${element.selector}')`;
      
    default:
      return `page.locator('${element.selector}')`;
  }
}

/**
 * Generates a Playwright test script for the scraped elements
 * With active test steps that Playwright will recognize
 * @param {Object} data - Scraped data
 * @returns {string} - Playwright test script
 */
function generatePlaywrightScript(data) {
  const url = data.url;
  let script = `import { test, expect } from '@playwright/test';\n\n`;
  script += `test('Verify ${data.title || "page elements"}', async ({ page }) => {\n`;
  script += `  // Navigate to the page\n`;
  script += `  await page.goto('${url}');\n\n`;
  
  // Check title
  script += `  // Verify page title\n`;
  script += `  await expect(page).toHaveTitle(\`${data.title ? data.title.replace(/[`$]/g, '\\$&') : 'Page Title'}\`);\n\n`;

  // Add interactions with headings - ACTIVE NOT COMMENTED
  if (data.content && data.content.headings && data.content.headings.h1 && data.content.headings.h1.length > 0) {
    script += `  // Verify main heading\n`;
    script += `  const mainHeading = page.getByRole('heading', { name: '${data.content.headings.h1[0].text.replace(/'/g, "\\'")}' });\n`;
    script += `  await expect(mainHeading).toBeVisible();\n\n`;
  }
  
  // Add at least one more assertion to make sure the test is valid
  script += `  // Verify page has loaded properly\n`;
  script += `  await expect(page.locator('body')).toBeVisible();\n\n`;
  
  // Add optional interactions - commented but with at least one active
  let hasActiveInteraction = false;
  
  // Add sample interactions with links
  if (data.content && data.content.links && data.content.links.length > 0) {
    const sampleLink = data.content.links[0];
    script += `  // More interactions\n`;
    script += `  const link = ${generateLocator(sampleLink, "link")};\n`;
    
    if (!hasActiveInteraction) {
      // Make the first link interaction active
      script += `  await expect(link).toBeVisible();\n\n`;
      hasActiveInteraction = true;
    } else {
      script += `  await link.click();\n\n`;
    }
  }
  
  if (data.content && data.content.buttons && data.content.buttons.length > 0) {
    const sampleButton = data.content.buttons[0];
    script += `  // Button interaction\n`;
    script += `  const button = ${generateLocator(sampleButton, "button")};\n`;
    
    if (!hasActiveInteraction) {
      // Make the button interaction active
      script += `  await expect(button).toBeVisible();\n\n`;
      hasActiveInteraction = true;
    } else {
      script += `  await button.click();\n\n`;
    }
  }
  
  if (data.content && data.content.formFields && data.content.formFields.length > 0) {
    const sampleInput = data.content.formFields[0];
    script += `  // Form field interaction\n`;
    script += `  const inputField = ${generateLocator(sampleInput, "input")};\n`;
    
    if (!hasActiveInteraction) {
      // Make the form field interaction active
      script += `  await expect(inputField).toBeVisible();\n\n`;
      hasActiveInteraction = true;
    } else {
      script += `  // await inputField.fill('Sample text');\n\n`;
    }
  }
  
  script += `});\n`;
  return script;
}

/**
 * Takes a screenshot of the page
 * @param {Page} page - Playwright page object
 * @param {string} url - URL of the page
 * @returns {Promise<string|null>} - Path to the screenshot or null if failed
 */
async function takeScreenshot(page, url) {
  try {
    // Create a unique, safe filename for the screenshot
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const timestamp = Date.now();
    const screenshotFileName = pathUtils.sanitizeFilename(`${hostname}_${timestamp}.png`);
    
    // Ensure the screenshots directory exists
    await fileUtils.ensureDirectoryExists(
      pathUtils.getSafeCategoryPath(config.SCREENSHOT_CATEGORY)
    );
    
    // Take the screenshot
    const screenshotBuffer = await page.screenshot({ fullPage: true });
    
    // Save the screenshot using our enhanced file utilities
    const result = await fileUtils.saveDataToFile(
      config.SCREENSHOT_CATEGORY, 
      screenshotFileName, 
      screenshotBuffer,
      { raw: true, sanitizeFilename: true }
    );
    
    return result.success ? result.relativePath : null;
  } catch (error) {
    console.error("Failed to take screenshot:", error);
    return null;
  }
}

/**
 * Extracts CSS properties of elements
 * @param {Page} page - Playwright page object
 * @param {string} selector - CSS selector
 * @returns {Promise<Array>} - Array of elements with CSS properties
 */
async function extractStyles(page, selector) {
  return page.evaluate((sel) => {
    const elements = Array.from(document.querySelectorAll(sel));
    return elements.map(el => {
      const styles = window.getComputedStyle(el);
      return {
        tagName: el.tagName.toLowerCase(),
        id: el.id || null,
        classes: el.className ? el.className.split(" ").filter(c => c) : [],
        styles: {
          color: styles.color,
          backgroundColor: styles.backgroundColor,
          fontSize: styles.fontSize,
          fontWeight: styles.fontWeight,
          display: styles.display,
          position: styles.position,
          width: styles.width,
          height: styles.height
        }
      };
    });
  }, selector);
}

/**
 * Extract heading elements with enhanced data
 * @param {Page} page - Playwright page object
 * @param {string} tag - Heading tag (h1, h2, h3)
 * @returns {Promise<Array>} - Array of heading elements
 */
async function extractHeadings(page, tag) {
  return page.evaluate((headingTag) => {
    return Array.from(document.querySelectorAll(headingTag)).map((h, index) => {
      const rect = h.getBoundingClientRect();
      return {
        text: h.innerText,
        id: h.id || null,
        index,
        tag: headingTag,
        position: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        selector: h.id ? 
          `#${h.id}` : 
          `${headingTag}:nth-of-type(${index + 1})`
      };
    });
  }, tag);
}

/**
 * Generate Playwright locators for headings
 * @param {Object} headings - Headings object with h1, h2, h3 arrays
 * @returns {Array} - Array of heading locators
 */
function generateHeadingLocators(headings) {
  const locators = [];
  
  for (const [type, elements] of Object.entries(headings)) {
    elements.forEach(heading => {
      locators.push({
        description: `${type.toUpperCase()}: ${heading.text}`,
        locator: generateLocator(heading, "heading"),
        element: heading
      });
    });
  }
  
  return locators;
}

/**
 * Scrapes a website and generates Playwright locators
 * @param {string} url - URL to scrape
 * @param {Object} options - Scraping options
 * @returns {Promise<Object>} - Scraped data with Playwright locators
 */
async function scrapeWebsite(url, options = {}) {
  console.log(`[INFO] Scraping: ${url}`);
  
  const timeout = options.timeout || config.DEFAULT_TIMEOUT;
  const waitUntil = options.waitUntil || config.DEFAULT_WAIT_UNTIL;
  const takeScreenshots = options.screenshots !== false;
  const extractCss = options.extractCss === true;
  const category = options.category || config.DEFAULT_CATEGORY;
  
  // Validate the category using our improved path utilities
  const categoryPath = pathUtils.getSafeCategoryPath(category);
  if (!categoryPath) {
    throw new Error(`Invalid category: ${category}`);
  }
  
  // Ensure the category directory exists
  await fileUtils.ensureDirectoryExists(categoryPath);
  
  // Launch browser with options
  const browser = await chromium.launch({ 
    headless: options.headless !== false,
    ...options.browserOptions
  });
  
  const context = await browser.newContext({
    viewport: options.viewport || config.DEFAULT_VIEWPORT,
    userAgent: options.userAgent
  });
  
  const page = await context.newPage();
  
  try {
    // Navigate to the URL
    await page.goto(url, { 
      waitUntil, 
      timeout 
    });
    
    // Take a screenshot if enabled
    let screenshotPath = null;
    if (takeScreenshots) {
      screenshotPath = await takeScreenshot(page, url);
    }
    
    // Extract basic page information
    const title = await page.title();
    const content = await page.textContent("body");
    const metaDescription = await page.$eval(
      'meta[name="description"]', 
      (meta) => meta.content
    ).catch(() => null);
    
    // Extract headings with enhanced data
    const headings = {
      h1: await extractHeadings(page, "h1"),
      h2: await extractHeadings(page, "h2"),
      h3: await extractHeadings(page, "h3")
    };
    
    // Extract paragraphs with positioning data
    const paragraphs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("p")).map((p, index) => {
        const rect = p.getBoundingClientRect();
        return {
          text: p.innerText,
          index,
          position: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          },
          selector: `p:nth-of-type(${index + 1})`
        };
      });
    });
    
    // Extract images with enhanced data
    const images = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("img")).map((img, index) => {
        const rect = img.getBoundingClientRect();
        return {
          src: img.src,
          alt: img.alt || "",
          width: img.width,
          height: img.height,
          index,
          position: {
            x: Math.round(rect.x),
            y: Math.round(rect.y)
          },
          selector: `img:nth-of-type(${index + 1})`
        };
      });
    });
    
    // Extract form fields with enhanced data
    const formFields = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("input, textarea, select, button[type='submit']"))
        .map((el, index) => {
          const rect = el.getBoundingClientRect();
          const tag = el.tagName.toLowerCase();
          
          return {
            type: tag,
            inputType: tag === "input" ? el.type : null,
            name: el.name || null,
            id: el.id || null,
            placeholder: el.placeholder || null,
            value: tag === "select" ? null : el.value || null,
            label: el.labels && el.labels.length > 0 ? el.labels[0].textContent.trim() : null,
            index,
            position: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            },
            selector: `${tag}[name="${el.name}"]`,
            required: el.required || false,
            disabled: el.disabled || false
          };
        });
    });
    
    // Extract links with enhanced data
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("a"))
        .filter(a => a.href && !a.href.startsWith("javascript:"))
        .map((a, index) => {
          const rect = a.getBoundingClientRect();
          return {
            text: a.innerText.trim(),
            href: a.href,
            title: a.title || null,
            id: a.id || null,
            index,
            position: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            },
            selector: a.id ? 
              `#${a.id}` : 
              a.innerText.trim() ? 
                `text=${a.innerText.trim()}` : 
                `a[href="${a.href}"]`
          };
        });
    });
    
    // Extract buttons with enhanced data
    const buttons = await page.evaluate(() => {
      // Get both button elements and elements with role="button"
      const buttonElements = [
        ...Array.from(document.querySelectorAll("button")),
        ...Array.from(document.querySelectorAll('[role="button"]'))
      ];
      
      return buttonElements.map((btn, index) => {
        const rect = btn.getBoundingClientRect();
        const text = btn.innerText.trim();
        
        return {
          text,
          type: btn.type || null,
          id: btn.id || null,
          name: btn.name || null,
          index,
          tag: btn.tagName.toLowerCase(),
          position: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          },
          selector: btn.id ? 
            `#${btn.id}` : 
            text ? 
              `button:has-text("${text}")` : 
              `button:nth-of-type(${index + 1})`
        };
      });
    });
    
    // Extract navigation elements
    const navigation = await page.evaluate(() => {
      const navElements = Array.from(document.querySelectorAll('nav, [role="navigation"]'));
      return navElements.map((nav, index) => {
        const links = Array.from(nav.querySelectorAll('a')).map(a => ({
          text: a.innerText.trim(),
          href: a.href
        }));
        
        return {
          id: nav.id || null,
          position: index,
          links,
          selector: nav.id ? `#${nav.id}` : `nav:nth-of-type(${index + 1})`
        };
      });
    });
    
    // Extract CSS styles if enabled
    let styles = {};
    if (extractCss) {
      styles = {
        headings: {
          h1: await extractStyles(page, "h1"),
          h2: await extractStyles(page, "h2"),
          h3: await extractStyles(page, "h3")
        },
        links: await extractStyles(page, "a"),
        buttons: await extractStyles(page, "button, [role='button']"),
        inputs: await extractStyles(page, "input, textarea, select"),
        paragraphs: await extractStyles(page, "p")
      };
    }
    
    // Generate Playwright locators
    const playwrightLocators = {
      headings: generateHeadingLocators(headings),
      links: links.map(link => ({
        description: `Link: ${link.text || link.href}`,
        locator: generateLocator(link, "link"),
        element: link
      })),
      buttons: buttons.map(button => ({
        description: `Button: ${button.text || button.id || "Unnamed"}`,
        locator: generateLocator(button, "button"),
        element: button
      })),
      formFields: formFields.map(field => ({
        description: `${field.type.charAt(0).toUpperCase() + field.type.slice(1)}: ${field.name || field.placeholder || field.id || "Unnamed"}`,
        locator: generateLocator(field, "input"),
        element: field
      })),
      images: images.map(image => ({
        description: `Image: ${image.alt || path.basename(image.src) || "Unnamed"}`,
        locator: generateLocator(image, "image"),
        element: image
      }))
    };
    
    // Generate a sample Playwright test script
    const playwrightScript = generatePlaywrightScript({
      url,
      title,
      content: {
        headings,
        links,
        buttons,
        inputFields: formFields
      }
    });
    
    // Compile all the scraped data
    const scrapedData = {
      url,
      title,
      metaDescription,
      screenshotPath,
      scrapeDate: new Date().toISOString(),
      content: {
        headings,
        paragraphs,
        images,
        formFields,
        links,
        buttons,
        navigation
      },
      playwrightLocators,
      playwrightScript
    };
    
    // Include styles if extracted
    if (extractCss) {
      scrapedData.styles = styles;
    }
    
    const filename = urlToFilename(url);
    
    // Save the scraped data to a file
    const saveResult = await fileUtils.saveDataToFile(
      category, 
      filename, 
      scrapedData,
      { sanitizeFilename: true }
    );
    
    if (saveResult.success) {
      scrapedData.filePath = saveResult.relativePath;
    }
    
    // Save Playwright test script separately if requested
    if (options.savePlaywrightScript !== false) {
      // Create a filename for the Playwright test script
      const scriptFilename = filename.replace('.json', '.spec.ts');
      
      // Save the script to the Playwright category
      await fileUtils.saveDataToFile(
        config.PLAYWRIGHT_CATEGORY,
        scriptFilename,
        playwrightScript,
        { sanitizeFilename: true }
      );
    }
    
    return scrapedData;
  } catch (error) {
    console.error(`[ERROR] Failed to scrape ${url}:`, error);
    throw error;
  } finally {
    // Close the browser
    await browser.close();
  }
}

/**
 * Scrapes multiple websites concurrently
 * @param {Array<string>} urls - Array of URLs to scrape
 * @param {Object} options - Scraping options
 * @param {number} concurrency - Maximum number of concurrent scrapes
 * @returns {Promise<Array>} - Array of scraped data
 */
async function scrapeMultipleWebsites(urls, options = {}, concurrency = config.MAX_CONCURRENT_SCRAPES) {
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error("Please provide an array of valid URLs");
  }
  
  // Process URLs in batches to control concurrency
  const results = [];
  const errors = [];
  
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    
    console.log(`[INFO] Processing batch of ${batch.length} URLs (${i+1}-${i+batch.length} of ${urls.length})...`);
    
    const batchPromises = batch.map(url => 
      scrapeWebsite(url, options)
        .catch(error => {
          errors.push({ url, error: error.message });
          return null;
        })
    );
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults.filter(Boolean));
  }
  
  return {
    results,
    errors,
    totalProcessed: urls.length,
    successCount: results.length,
    errorCount: errors.length
  };
}

/**
 * Generates a test file for Playwright with all available element locators
 * @param {Object} scrapedData - Data from scrapeWebsite function
 * @param {string} testName - Name for the test file
 * @returns {Promise<Object>} - Result of saving the test file
 */
async function generateCompleteTestFile(scrapedData, testName = null) {
  try {
    if (!scrapedData || !scrapedData.url || !scrapedData.playwrightLocators) {
      throw new Error("Invalid scraped data provided");
    }
    
    // Generate a test name based on the URL if not provided
    const finalTestName = testName || `test_${new URL(scrapedData.url).hostname}`;
    const safeName = pathUtils.sanitizeFilename(finalTestName);
    
    let testScript = `// Playwright test file generated for ${scrapedData.url}\n`;
    testScript += `// Generated on: ${new Date().toISOString()}\n`;
    testScript += `const { test, expect } = require('@playwright/test');\n\n`;
    
    testScript += `test('${safeName}', async ({ page }) => {\n`;
    testScript += `  // Navigate to the page\n`;
    testScript += `  await page.goto('${scrapedData.url}');\n`;
    testScript += `  await page.waitForLoadState('domcontentloaded');\n\n`;
    
    // Add all locators
    testScript += `  // Element locators for this page\n`;
    testScript += `  const elements = {\n`;
    
    // Add heading locators
    if (scrapedData.playwrightLocators.headings && scrapedData.playwrightLocators.headings.length > 0) {
      testScript += `    // Headings\n`;
      scrapedData.playwrightLocators.headings.forEach(heading => {
        const varName = `heading_${heading.element.tag}_${heading.element.index}`;
        testScript += `    ${varName}: ${heading.locator},\n`;
      });
    }
    
    // Add button locators
    if (scrapedData.playwrightLocators.buttons && scrapedData.playwrightLocators.buttons.length > 0) {
      testScript += `    // Buttons\n`;
      scrapedData.playwrightLocators.buttons.forEach(button => {
        const varName = `button_${button.element.index}`;
        testScript += `    ${varName}: ${button.locator},\n`;
      });
    }
    
    // Add link locators
    if (scrapedData.playwrightLocators.links && scrapedData.playwrightLocators.links.length > 0) {
      testScript += `    // Links\n`;
      scrapedData.playwrightLocators.links.forEach(link => {
        const varName = `link_${link.element.index}`;
        testScript += `    ${varName}: ${link.locator},\n`;
      });
    }
    
    // Add form field locators
    if (scrapedData.playwrightLocators.formFields && scrapedData.playwrightLocators.formFields.length > 0) {
      testScript += `    // Form Fields\n`;
      scrapedData.playwrightLocators.formFields.forEach(field => {
        const varName = `field_${field.element.type}_${field.element.index}`;
        testScript += `    ${varName}: ${field.locator},\n`;
      });
    }
    
    // Add image locators
    if (scrapedData.playwrightLocators.images && scrapedData.playwrightLocators.images.length > 0) {
      testScript += `    // Images\n`;
      scrapedData.playwrightLocators.images.forEach(image => {
        const varName = `image_${image.element.index}`;
        testScript += `    ${varName}: ${image.locator},\n`;
      });
    }
    
    testScript += `  };\n\n`;
    
    // Add example assertions
    testScript += `  // Example assertions\n`;
    
    // Assert page title
    if (scrapedData.title) {
      testScript += `  await expect(page).toHaveTitle('${scrapedData.title.replace(/'/g, "\\'")}');\n\n`;
    }
    
    // Assert a heading is visible
    if (scrapedData.playwrightLocators.headings && scrapedData.playwrightLocators.headings.length > 0) {
      const firstHeading = scrapedData.playwrightLocators.headings[0];
      testScript += `  // Check that a heading is visible\n`;
      testScript += `  await expect(elements.heading_${firstHeading.element.tag}_${firstHeading.element.index}).toBeVisible();\n\n`;
    }
    
    // Add example interactions (commented out)
    testScript += `  // Example interactions (uncomment to use)\n`;
    
    // Click a button
    if (scrapedData.playwrightLocators.buttons && scrapedData.playwrightLocators.buttons.length > 0) {
      const button = scrapedData.playwrightLocators.buttons[0];
      testScript += `  // await elements.button_${button.element.index}.click();\n`;
    }
    
    // Click a link
    if (scrapedData.playwrightLocators.links && scrapedData.playwrightLocators.links.length > 0) {
      const link = scrapedData.playwrightLocators.links[0];
      testScript += `  // await elements.link_${link.element.index}.click();\n`;
    }
    
    // Fill a form field
    if (scrapedData.playwrightLocators.formFields && scrapedData.playwrightLocators.formFields.length > 0) {
      const field = scrapedData.playwrightLocators.formFields[0];
      if (field.element.type === "input" || field.element.type === "textarea") {
        testScript += `  // await elements.field_${field.element.type}_${field.element.index}.fill('Example text');\n`;
      }
    }
    
    testScript += `});\n`;
    
    // Save the test file
    const fileName = `${safeName}.spec.js`;
    const result = await fileUtils.saveDataToFile(
      config.PLAYWRIGHT_CATEGORY,
      fileName,
      testScript,
      { sanitizeFilename: true }
    );
    
    return {
      success: result.success,
      fileName,
      filePath: result.relativePath,
      testName: safeName
    };
  } catch (error) {
    console.error("Failed to generate complete test file:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Register necessary directories with pathUtils to ensure they exist and are safe
pathUtils.registerSafeDirectory(config.SCREENSHOT_CATEGORY, config.SCREENSHOT_CATEGORY);
pathUtils.registerSafeDirectory(config.DEFAULT_CATEGORY, config.DEFAULT_CATEGORY);
pathUtils.registerSafeDirectory(config.PLAYWRIGHT_CATEGORY, config.PLAYWRIGHT_CATEGORY);

// Export the module
module.exports = { 
  scrapeWebsite,
  scrapeMultipleWebsites,
  generatePlaywrightScript,
  generateCompleteTestFile,
  config
};