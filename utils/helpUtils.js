const fileUtils = require('./fileUtils');
const pathUtils = require('./pathUtils');

/**
 * Configuration for help utilities
 */
const config = {
  API_VERSION: '1.0.0',
  SERVER_NAME: 'Playwright Automation Server',
  MAX_EXAMPLE_LENGTH: 300, // Maximum length for example requests
  DOCS_CATEGORY: 'docs' // Category for saving API documentation
};

/**
 * Groups API endpoints by their functionality
 * @type {Object}
 */
const endpointGroups = {
  CORE: {
    name: 'Core API',
    description: 'Essential server operations and information'
  },
  FILES: {
    name: 'File Management',
    description: 'Operations for working with files and directories'
  },
  TESTING: {
    name: 'Testing & Automation',
    description: 'Playwright test execution and reporting'
  },
  SCRAPING: {
    name: 'Web Scraping',
    description: 'Website analysis and data extraction'
  },
  UTILITIES: {
    name: 'Utilities',
    description: 'Formatting, compression, and other utilities'
  }
};

/**
 * Detailed information about API endpoints
 * @type {Array}
 */
const apiEndpoints = [
  // Core API endpoints
  {
    path: '/help',
    method: 'GET',
    group: endpointGroups.CORE,
    description: 'Displays a list of available API endpoints',
    parameters: [],
    returns: 'JSON object containing API documentation',
    example: null
  },
  {
    path: '/api-stats',
    method: 'GET',
    group: endpointGroups.CORE,
    description: 'Returns statistics about API usage',
    parameters: [],
    returns: 'JSON object with request counts and performance metrics',
    example: null
  },
  
  // Logging endpoints
  {
    path: '/logs',
    method: 'GET',
    group: endpointGroups.CORE,
    description: 'Retrieves server logs with optional filtering',
    parameters: [
      { name: 'level', type: 'query', description: 'Filter by log level (ERROR, WARNING, INFO, DEBUG)' },
      { name: 'limit', type: 'query', description: 'Limit number of logs returned' },
      { name: 'search', type: 'query', description: 'Search text in log messages' }
    ],
    returns: 'JSON array of log entries',
    example: {
      url: '/logs?level=ERROR&limit=10',
      description: 'Get the 10 most recent error logs'
    }
  },
  {
    path: '/logs/live',
    method: 'GET',
    group: endpointGroups.CORE,
    description: 'Streams live logs via Server-Sent Events (SSE)',
    parameters: [
      { name: 'level', type: 'query', description: 'Filter by log level (ERROR, WARNING, INFO, DEBUG)' }
    ],
    returns: 'SSE stream of log entries',
    example: {
      url: '/logs/live?level=INFO',
      description: 'Stream all INFO level or higher logs in real-time'
    }
  },
  {
    path: '/logs/download',
    method: 'GET',
    group: endpointGroups.CORE,
    description: 'Downloads logs as a file',
    parameters: [
      { name: 'level', type: 'query', description: 'Filter by log level (ERROR, WARNING, INFO, DEBUG)' },
      { name: 'format', type: 'query', description: 'Output format (json or text)' }
    ],
    returns: 'File download (JSON or text)',
    example: {
      url: '/logs/download?format=json',
      description: 'Download all logs in JSON format'
    }
  },
  
  // File management endpoints
  {
    path: '/files',
    method: 'GET',
    group: endpointGroups.FILES,
    description: 'Lists all files in the specified category with optional filtering and sorting',
    parameters: [
      { name: 'category', type: 'query', description: 'File category/directory (e.g., logs, reports)' },
      { name: 'search', type: 'query', description: 'Filter by filename' },
      { name: 'sort', type: 'query', description: 'Sort field (name, size, date)' },
      { name: 'order', type: 'query', description: 'Sort order (asc, desc)' },
      { name: 'stats', type: 'query', description: 'Include file stats (true/false)' }
    ],
    returns: 'JSON array of file information',
    example: {
      url: '/files?category=reports&sort=date&order=desc&stats=true',
      description: 'Get a list of report files sorted by date in descending order with file statistics'
    }
  },
  {
    path: '/files/file',
    method: 'GET',
    group: endpointGroups.FILES,
    description: 'Retrieves the content of a specific file',
    parameters: [
      { name: 'category', type: 'query', description: 'File category/directory' },
      { name: 'fileName', type: 'query', description: 'Name of the file to retrieve' },
      { name: 'raw', type: 'query', description: 'Return raw content (true/false)' },
      { name: 'download', type: 'query', description: 'Download as file (true/false)' }
    ],
    returns: 'File content or download',
    example: {
      url: '/files/file?category=reports&fileName=test-results.json',
      description: 'Get the content of test-results.json from the reports category'
    }
  },
  {
    path: '/files',
    method: 'POST',
    group: endpointGroups.FILES,
    description: 'Saves data to a file in the specified category',
    parameters: [
      { name: 'category', type: 'body', description: 'File category/directory' },
      { name: 'fileName', type: 'body', description: 'Name for the file' },
      { name: 'data', type: 'body', description: 'Content to save (object or string)' },
      { name: 'overwrite', type: 'body', description: 'Whether to overwrite existing files (boolean)' }
    ],
    returns: 'JSON object with save status',
    example: {
      url: '/files',
      body: {
        category: 'reports',
        fileName: 'summary.json',
        data: { status: 'success', count: 5 },
        overwrite: true
      },
      description: 'Save a JSON object to summary.json in the reports category'
    }
  },
  {
    path: '/files/folder',
    method: 'POST',
    group: endpointGroups.FILES,
    description: 'Creates a new folder in the specified category',
    parameters: [
      { name: 'category', type: 'body', description: 'Parent category/directory' },
      { name: 'folderName', type: 'body', description: 'Name for the new folder' }
    ],
    returns: 'JSON object with folder creation status',
    example: {
      url: '/files/folder',
      body: {
        category: 'reports',
        folderName: 'monthly'
      },
      description: 'Create a new folder named "monthly" in the reports category'
    }
  },
  {
    path: '/files/copy',
    method: 'POST',
    group: endpointGroups.FILES,
    description: 'Copies a file from one location to another',
    parameters: [
      { name: 'sourceCategory', type: 'body', description: 'Source category/directory' },
      { name: 'sourceFileName', type: 'body', description: 'Source file name' },
      { name: 'targetCategory', type: 'body', description: 'Target category/directory' },
      { name: 'targetFileName', type: 'body', description: 'Target file name (optional)' },
      { name: 'overwrite', type: 'body', description: 'Whether to overwrite existing files (boolean)' }
    ],
    returns: 'JSON object with copy status',
    example: {
      url: '/files/copy',
      body: {
        sourceCategory: 'logs',
        sourceFileName: 'server.log',
        targetCategory: 'archives',
        targetFileName: 'server-backup.log',
        overwrite: false
      },
      description: 'Copy server.log from logs to archives as server-backup.log'
    }
  },
  {
    path: '/files',
    method: 'DELETE',
    group: endpointGroups.FILES,
    description: 'Deletes a specific file',
    parameters: [
      { name: 'category', type: 'query', description: 'File category/directory' },
      { name: 'fileName', type: 'query', description: 'Name of the file to delete' }
    ],
    returns: 'JSON object with deletion status',
    example: {
      url: '/files?category=temp&fileName=old-data.json',
      description: 'Delete old-data.json from the temp category'
    }
  },
  
  // Testing endpoints
  {
    path: '/run-tests',
    method: 'POST',
    group: endpointGroups.TESTING,
    description: 'Runs Playwright test cases and returns the results',
    parameters: [
      { name: 'testFile', type: 'body', description: 'Specific test file to run (optional)' },
      { name: 'testName', type: 'body', description: 'Specific test name to run (optional)' },
      { name: 'project', type: 'body', description: 'Playwright project to run (optional)' },
      { name: 'reporter', type: 'body', description: 'Reporter to use (default: json)' }
    ],
    returns: 'JSON object with test results',
    example: {
      url: '/run-tests',
      body: {
        testFile: 'login.spec.js',
        reporter: 'json'
      },
      description: 'Run login tests with JSON reporter'
    }
  },
  {
    path: '/reports',
    method: 'GET',
    group: endpointGroups.TESTING,
    description: 'Accesses the latest Playwright HTML report',
    parameters: [],
    returns: 'HTML report or JSON list of available reports',
    example: null
  },
  
  // Scraping endpoints
  {
    path: '/scrape',
    method: 'POST',
    group: endpointGroups.SCRAPING,
    description: 'Scrapes a website and extracts relevant information',
    parameters: [
      { name: 'urls', type: 'body', description: 'Array of URLs to scrape' },
      { name: 'options', type: 'body', description: 'Scraping options (timeout, waitUntil, etc.)' }
    ],
    returns: 'JSON object with scraped data',
    example: {
      url: '/scrape',
      body: {
        urls: ['https://example.com'],
        options: {
          timeout: 30000,
          waitUntil: 'domcontentloaded',
          screenshots: true
        }
      },
      description: 'Scrape example.com with screenshots enabled'
    }
  },
  {
    path: '/scrape/playwright',
    method: 'POST',
    group: endpointGroups.SCRAPING,
    description: 'Scrapes a website and returns Playwright locators and test scripts',
    parameters: [
      { name: 'url', type: 'body', description: 'URL to scrape' },
      { name: 'options', type: 'body', description: 'Options for locator generation' }
    ],
    returns: 'JSON object with Playwright locators and test script',
    example: {
      url: '/scrape/playwright',
      body: {
        url: 'https://example.com',
        options: {
          includeScript: true,
          selector: 'form'
        }
      },
      description: 'Generate Playwright locators for forms on example.com'
    }
  },
  
  // Utility endpoints
  {
    path: '/format',
    method: 'POST',
    group: endpointGroups.UTILITIES,
    description: 'Formats a TypeScript/JavaScript file using Prettier and ESLint',
    parameters: [
      { name: 'file', type: 'formData', description: 'File to format' },
      { name: 'options', type: 'formData', description: 'Formatting options (JSON string)' }
    ],
    returns: 'Formatted file content',
    example: null
  },
  {
    path: '/zip/downloads',
    method: 'GET',
    group: endpointGroups.UTILITIES,
    description: 'Generates and downloads a ZIP file of all stored files',
    parameters: [
      { name: 'category', type: 'query', description: 'Specific category to zip (optional)' }
    ],
    returns: 'ZIP file download',
    example: {
      url: '/zip/downloads?category=reports',
      description: 'Download a ZIP file containing all files in the reports category'
    }
  }
];

/**
 * Returns a list of available API endpoints and their descriptions.
 * @param {Object} options - Options for customizing the output
 * @param {boolean} options.grouped - Whether to group endpoints by functionality
 * @param {boolean} options.detailed - Whether to include detailed information
 * @param {string} options.format - Output format (simple, full)
 * @returns {object} - API routes and descriptions
 */
function getAvailableEndpoints(options = {}) {
  const { grouped = true, detailed = true, format = 'full' } = options;
  
  // Simple format returns a flat map of endpoints and descriptions
  if (format === 'simple') {
    const routes = {};
    apiEndpoints.forEach(endpoint => {
      routes[`${endpoint.method} ${endpoint.path}`] = endpoint.description;
    });
    
    return {
      message: `Welcome to the ${config.SERVER_NAME}! Here are the available API endpoints:`,
      version: config.API_VERSION,
      routes
    };
  }
  
  // Default to full format with grouping if requested
  if (grouped) {
    const groupedEndpoints = {};
    
    // Initialize groups
    Object.values(endpointGroups).forEach(group => {
      groupedEndpoints[group.name] = {
        description: group.description,
        endpoints: []
      };
    });
    
    // Add endpoints to their groups
    apiEndpoints.forEach(endpoint => {
      const groupName = endpoint.group.name;
      const endpointInfo = detailed ? endpoint : {
        path: endpoint.path,
        method: endpoint.method,
        description: endpoint.description
      };
      
      groupedEndpoints[groupName].endpoints.push(endpointInfo);
    });
    
    return {
      message: `Welcome to the ${config.SERVER_NAME}!`,
      version: config.API_VERSION,
      groups: groupedEndpoints
    };
  }
  
  // Ungrouped but detailed list
  return {
    message: `Welcome to the ${config.SERVER_NAME}!`,
    version: config.API_VERSION,
    endpoints: detailed ? apiEndpoints : apiEndpoints.map(endpoint => ({
      path: endpoint.path,
      method: endpoint.method,
      description: endpoint.description
    }))
  };
}

/**
 * Saves the API documentation to a file
 * @param {string} format - Format to save (html, json, markdown)
 * @returns {Promise<Object>} - Result of saving the documentation
 */
async function saveApiDocumentation(format = 'markdown') {
  try {
    // Ensure the docs directory exists
    const docsPath = pathUtils.getSafeCategoryPath(config.DOCS_CATEGORY);
    if (!docsPath) {
      // Create the docs category if it doesn't exist
      await fileUtils.createFolder('', config.DOCS_CATEGORY);
    }
    
    let content;
    let fileName;
    
    if (format === 'json') {
      // JSON format - just the raw data
      content = JSON.stringify(getAvailableEndpoints({ grouped: true, detailed: true }), null, 2);
      fileName = 'api-documentation.json';
    } else if (format === 'html') {
      // HTML format - a simple HTML page
      content = generateHtmlDocumentation();
      fileName = 'api-documentation.html';
    } else {
      // Default to markdown
      content = generateMarkdownDocumentation();
      fileName = 'api-documentation.md';
    }
    
    // Save the documentation
    const result = await fileUtils.saveDataToFile(
      config.DOCS_CATEGORY,
      fileName,
      content,
      { sanitizeFilename: true, overwrite: true }
    );
    
    return {
      success: result.success,
      format,
      filePath: result.relativePath,
      fileName: result.fileName
    };
  } catch (error) {
    console.error('Failed to save API documentation:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Generates HTML documentation for the API
 * @returns {string} - HTML content
 */
function generateHtmlDocumentation() {
  // Get the full API data
  const apiData = getAvailableEndpoints({ grouped: true, detailed: true });
  
  let html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${apiData.message}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }
        h1 { color: #2c3e50; }
        h2 { 
          color: #3498db; 
          border-bottom: 2px solid #3498db;
          padding-bottom: 5px;
        }
        h3 { color: #2980b9; }
        .endpoint {
          margin-bottom: 30px;
          border: 1px solid #ddd;
          border-radius: 5px;
          padding: 15px;
        }
        .method {
          display: inline-block;
          padding: 5px 10px;
          border-radius: 5px;
          font-weight: bold;
          color: white;
          margin-right: 10px;
        }
        .get { background-color: #61affe; }
        .post { background-color: #49cc90; }
        .put { background-color: #fca130; }
        .delete { background-color: #f93e3e; }
        .path {
          font-family: monospace;
          font-size: 1.1em;
        }
        .parameters {
          width: 100%;
          border-collapse: collapse;
          margin: 10px 0;
        }
        .parameters th, .parameters td {
          border: 1px solid #ddd;
          padding: 10px;
          text-align: left;
        }
        .parameters th {
          background-color: #f8f9fa;
        }
        .example {
          background-color: #f8f9fa;
          padding: 10px;
          border-radius: 5px;
          font-family: monospace;
          white-space: pre-wrap;
        }
        .group-description {
          font-style: italic;
          color: #7f8c8d;
          margin-bottom: 20px;
        }
      </style>
    </head>
    <body>
      <h1>${apiData.message}</h1>
      <p>API Version: ${apiData.version}</p>
  `;
  
  // Add each group and its endpoints
  for (const [groupName, group] of Object.entries(apiData.groups)) {
    html += `
      <h2>${groupName}</h2>
      <div class="group-description">${group.description}</div>
    `;
    
    for (const endpoint of group.endpoints) {
      const methodClass = endpoint.method.toLowerCase();
      
      html += `
        <div class="endpoint">
          <h3>
            <span class="method ${methodClass}">${endpoint.method}</span>
            <span class="path">${endpoint.path}</span>
          </h3>
          <p>${endpoint.description}</p>
      `;
      
      // Add parameters if there are any
      if (endpoint.parameters && endpoint.parameters.length > 0) {
        html += `
          <h4>Parameters</h4>
          <table class="parameters">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
        `;
        
        for (const param of endpoint.parameters) {
          html += `
            <tr>
              <td>${param.name}</td>
              <td>${param.type}</td>
              <td>${param.description}</td>
            </tr>
          `;
        }
        
        html += `
            </tbody>
          </table>
        `;
      }
      
      // Add returns info
      html += `<h4>Returns</h4><p>${endpoint.returns}</p>`;
      
      // Add example if it exists
      if (endpoint.example) {
        html += `<h4>Example</h4>`;
        html += `<p>${endpoint.example.description}</p>`;
        html += `<div class="example">`;
        
        if (endpoint.example.url) {
          html += `URL: ${endpoint.example.url}\n`;
        }
        
        if (endpoint.example.body) {
          html += `Body: ${JSON.stringify(endpoint.example.body, null, 2)}`;
        }
        
        html += `</div>`;
      }
      
      html += `</div>`;
    }
  }
  
  html += `
    </body>
    </html>
  `;
  
  return html;
}

/**
 * Generates Markdown documentation for the API
 * @returns {string} - Markdown content
 */
function generateMarkdownDocumentation() {
  // Get the full API data
  const apiData = getAvailableEndpoints({ grouped: true, detailed: true });
  
  let markdown = `# ${apiData.message}\n\n`;
  markdown += `API Version: ${apiData.version}\n\n`;
  markdown += `## Table of Contents\n\n`;
  
  // Generate TOC
  for (const groupName of Object.keys(apiData.groups)) {
    markdown += `- [${groupName}](#${groupName.toLowerCase().replace(/\s+/g, '-')})\n`;
  }
  
  markdown += `\n`;
  
  // Add each group and its endpoints
  for (const [groupName, group] of Object.entries(apiData.groups)) {
    markdown += `## ${groupName}\n\n`;
    markdown += `${group.description}\n\n`;
    
    for (const endpoint of group.endpoints) {
      markdown += `### ${endpoint.method} ${endpoint.path}\n\n`;
      markdown += `${endpoint.description}\n\n`;
      
      // Add parameters if there are any
      if (endpoint.parameters && endpoint.parameters.length > 0) {
        markdown += `#### Parameters\n\n`;
        markdown += `| Name | Type | Description |\n`;
        markdown += `| ---- | ---- | ----------- |\n`;
        
        for (const param of endpoint.parameters) {
          markdown += `| ${param.name} | ${param.type} | ${param.description} |\n`;
        }
        
        markdown += `\n`;
      }
      
      // Add returns info
      markdown += `#### Returns\n\n`;
      markdown += `${endpoint.returns}\n\n`;
      
      // Add example if it exists
      if (endpoint.example) {
        markdown += `#### Example\n\n`;
        markdown += `${endpoint.example.description}\n\n`;
        
        if (endpoint.example.url) {
          markdown += `**URL**: \`${endpoint.example.url}\`\n\n`;
        }
        
        if (endpoint.example.body) {
          markdown += `**Body**:\n\`\`\`json\n${JSON.stringify(endpoint.example.body, null, 2)}\n\`\`\`\n\n`;
        }
      }
    }
  }
  
  return markdown;
}

/**
 * Gets server information and status
 * @returns {Object} - Information about the server
 */
function getServerInfo() {
  return {
    name: config.SERVER_NAME,
    version: config.API_VERSION,
    nodeVersion: process.version,
    platform: process.platform,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    apiEndpointCount: apiEndpoints.length
  };
}

// Export the module
module.exports = {
  getAvailableEndpoints,
  saveApiDocumentation,
  getServerInfo,
  config,
  endpointGroups
};