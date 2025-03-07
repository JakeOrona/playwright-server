const express = require("express");
const helpUtils = require("../utils/helpUtils");
const fileUtils = require("../utils/fileUtils");

const router = express.Router();

/**
 * GET /help
 * Displays all available API routes with various formatting options
 * Query parameters:
 * - format: simple or full (default: full)
 * - grouped: true or false (default: true)
 * - detailed: true or false (default: true)
 */
router.get("/", (req, res) => {
  const options = {
    format: req.query.format || 'full',
    grouped: req.query.grouped !== 'false',
    detailed: req.query.detailed !== 'false'
  };
  
  const endpoints = helpUtils.getAvailableEndpoints(options);
  res.json(endpoints);
});

/**
 * GET /help/docs
 * Generates and returns API documentation in various formats
 * Query parameters:
 * - format: json, html, or markdown (default: markdown)
 * - download: whether to download the documentation (default: false)
 */
router.get("/docs", async (req, res) => {
  try {
    const format = req.query.format || 'markdown';
    const download = req.query.download === 'true';
    
    // Generate and save the documentation
    const result = await helpUtils.saveApiDocumentation(format);
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error || 'Failed to generate documentation'
      });
    }
    
    // If download is requested, send the file
    if (download) {
      // Get the file content
      const fileResult = await fileUtils.getFile(
        helpUtils.config.DOCS_CATEGORY,
        result.fileName,
        { raw: format === 'html' ? false : true }
      );
      
      if (!fileResult.success) {
        return res.status(500).json({
          success: false,
          error: 'Failed to retrieve documentation file'
        });
      }
      
      // Set appropriate headers based on format
      const contentTypes = {
        'json': 'application/json',
        'html': 'text/html',
        'markdown': 'text/markdown'
      };
      
      res.setHeader('Content-Type', contentTypes[format] || 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
      
      // Send the file content
      return res.send(fileResult.content);
    }
    
    // Otherwise just return information about the saved documentation
    res.json({
      success: true,
      message: `API documentation generated in ${format} format`,
      document: {
        format,
        fileName: result.fileName,
        path: result.filePath
      }
    });
  } catch (error) {
    console.error('Error generating documentation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate documentation'
    });
  }
});

/**
 * GET /help/server-info
 * Returns information about the server
 */
router.get("/server-info", (req, res) => {
  const info = helpUtils.getServerInfo();
  res.json({
    success: true,
    serverInfo: info
  });
});

/**
 * GET /help/endpoints/:group
 * Returns endpoints for a specific group
 */
router.get("/endpoints/:group", (req, res) => {
  const { group } = req.params;
  const options = {
    format: 'full',
    grouped: true,
    detailed: true
  };
  
  const allEndpoints = helpUtils.getAvailableEndpoints(options);
  
  // Find the requested group
  const requestedGroup = Object.keys(allEndpoints.groups)
    .find(key => key.toLowerCase() === group.toLowerCase());
  
  if (!requestedGroup) {
    return res.status(404).json({
      success: false,
      error: `Group '${group}' not found`,
      availableGroups: Object.keys(allEndpoints.groups)
    });
  }
  
  // Return just that group's endpoints
  res.json({
    success: true,
    group: requestedGroup,
    description: allEndpoints.groups[requestedGroup].description,
    endpoints: allEndpoints.groups[requestedGroup].endpoints
  });
});

module.exports = router;