const express = require("express");
const fileUtils = require("../utils/fileUtils");

const router = express.Router();

/**
 * Helper function to handle API responses
 * @param {Object} res - Express response object
 * @param {Object} result - Result from file utility functions
 */
function sendResponse(res, result) {
  if (result.error) {
    return res.status(result.code || 500).json({
      success: false,
      error: result.error
    });
  }
  return res.status(200).json(result);
}

/**
 * GET /files
 * Retrieves a list of files using query parameters
 * Example: /files?category=logs&search=test&sortBy=date&sortOrder=desc&includeStats=true
 */
router.get("/", async (req, res) => {
  try {
    const { category, search, sortBy, sortOrder, includeStats } = req.query;
    
    const options = {
      includeStats: includeStats === 'true',
      sortBy,
      sortOrder
    };
    
    const result = await fileUtils.getFiles(category, search, options);
    sendResponse(res, result);
  } catch (error) {
    console.error("Route error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

/**
 * GET /files/storage
 * Gets summary information about storage usage
 */
router.get("/storage", async (req, res) => {
  try {
    const result = await fileUtils.getStorageInfo();
    sendResponse(res, result);
  } catch (error) {
    console.error("Route error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

/**
 * GET /files/file
 * Retrieves a specific file content
 * Example: /files/file?category=logs&fileName=test.txt&raw=true
 */
router.get("/file", async (req, res) => {
  try {
    const { category, fileName, raw, encoding } = req.query;
    
    const options = {
      raw: raw === 'true',
      encoding
    };
    
    const result = await fileUtils.getFile(category, fileName, options);
    
    // Handle file download if requested
    if (req.query.download === 'true' && !result.error) {
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      
      // For raw binary files, send the buffer directly
      if (options.raw) {
        return res.send(result.content);
      }
      
      // For JSON files that were automatically parsed, restringify
      if (fileName.endsWith('.json') && typeof result.content === 'object') {
        return res.send(JSON.stringify(result.content, null, 2));
      }
      
      // For other text files
      return res.send(result.content);
    }
    
    sendResponse(res, result);
  } catch (error) {
    console.error("Route error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

/**
 * POST /files
 * Saves JSON data to a file
 * Body: { category: "logs", fileName: "test.json", data: { key: "value" }, overwrite: true }
 */
router.post("/", express.json({ limit: fileUtils.config.FILE_SIZE_LIMIT }), async (req, res) => {
  try {
    const { category, fileName, data, overwrite } = req.body;
    
    const options = {
      overwrite: overwrite !== false // Default to true unless explicitly set to false
    };
    
    const result = await fileUtils.saveDataToFile(category, fileName, data, options);
    sendResponse(res, result);
  } catch (error) {
    console.error("Route error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

/**
 * POST /files/folder
 * Creates a new folder
 * Body: { category: "logs", folderName: "new-folder" }
 */
router.post("/folder", async (req, res) => {
  try {
    const { category, folderName } = req.body;
    
    if (!category || !folderName) {
      return res.status(400).json({
        success: false,
        error: "Category and folderName are required"
      });
    }
    
    const result = await fileUtils.createFolder(category, folderName);
    sendResponse(res, result);
  } catch (error) {
    console.error("Route error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

/**
 * POST /files/copy
 * Copies a file from one location to another
 * Body: { sourceCategory: "logs", sourceFileName: "test.txt", targetCategory: "archives", targetFileName: "copy.txt", overwrite: true }
 */
router.post("/copy", async (req, res) => {
  try {
    const { sourceCategory, sourceFileName, targetCategory, targetFileName, overwrite } = req.body;
    
    const options = {
      overwrite: overwrite !== false
    };
    
    const result = await fileUtils.copyFile(
      sourceCategory,
      sourceFileName,
      targetCategory,
      targetFileName,
      options
    );
    
    sendResponse(res, result);
  } catch (error) {
    console.error("Route error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

/**
 * DELETE /files
 * Deletes a specific file
 * Example: /files?category=logs&fileName=test.txt
 */
router.delete("/", async (req, res) => {
  try {
    const { category, fileName } = req.query;
    const result = await fileUtils.deleteFile(category, fileName);
    sendResponse(res, result);
  } catch (error) {
    console.error("Route error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

module.exports = router;