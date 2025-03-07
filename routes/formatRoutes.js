const express = require("express");
const multer = require("multer");
const formatUtils = require("../utils/formatUtils");
const fileUtils = require("../utils/fileUtils");
const pathUtils = require("../utils/pathUtils");
const path = require("path");

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: formatUtils.config.MAX_FILE_SIZE
  },
  fileFilter: (req, file, cb) => {
    // Check if file extension is supported
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (formatUtils.config.SUPPORTED_EXTENSIONS.includes(ext)) {
      return cb(null, true);
    }
    
    cb(new Error(`Unsupported file extension: ${ext}. Supported extensions: ${formatUtils.config.SUPPORTED_EXTENSIONS.join(', ')}`));
  }
});

/**
 * POST /format
 * Upload and format a file
 */
router.post("/", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded"
      });
    }
    
    console.log(`[INFO] Received file for formatting: ${req.file.originalname}`);
    
    // Parse formatting options from the request
    const options = {};
    
    // Parse custom tools configuration if provided
    if (req.body.tools) {
      try {
        options.tools = JSON.parse(req.body.tools);
      } catch (error) {
        console.warn(`[WARNING] Failed to parse tools JSON: ${req.body.tools}`);
      }
    }
    
    // Set output filename if provided
    if (req.body.outputFileName) {
      options.outputFileName = req.body.outputFileName;
    }
    
    // Format the file based on its extension
    const ext = path.extname(req.file.originalname).toLowerCase();
    let result;
    
    if (['.ts', '.js', '.jsx', '.tsx'].includes(ext)) {
      result = await formatUtils.formatTypeScriptFile(req.file.buffer, req.file.originalname, options);
    } else if (['.css', '.scss'].includes(ext)) {
      result = await formatUtils.formatStyleFile(req.file.buffer, req.file.originalname, options);
    } else if (['.html'].includes(ext)) {
      result = await formatUtils.formatHtmlFile(req.file.buffer, req.file.originalname, options);
    } else if (['.json'].includes(ext)) {
      // JSON files only need Prettier
      options.tools = {
        useEslint: false,
        usePrettier: true,
        useStylelint: false
      };
      result = await formatUtils.formatFile(req.file.buffer, req.file.originalname, options);
    } else {
      return res.status(400).json({
        success: false,
        error: `Unsupported file extension: ${ext}`
      });
    }
    
    // Handle errors from formatting
    if (!result.success) {
      return res.status(result.code || 500).json({
        success: false,
        error: result.error
      });
    }
    
    // If the client only wants a download URL, don't include the full content
    if (req.body.urlOnly === 'true') {
      const { content, ...resultWithoutContent } = result;
      return res.json(resultWithoutContent);
    }
    
    // Return the formatted file details
    res.json(result);
  } catch (error) {
    console.error("[ERROR] Formatting failed:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Formatting failed"
    });
  }
});

/**
 * POST /format/existing
 * Format an existing file on the server
 */
router.post("/existing", express.json(), async (req, res) => {
  try {
    const { category, fileName, tools, outputFileName } = req.body;
    
    if (!category || !fileName) {
      return res.status(400).json({
        success: false,
        error: "Category and fileName are required"
      });
    }
    
    // Validate the file path
    const filePath = pathUtils.getSafeFilePath(category, fileName);
    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: `Invalid file path: ${category}/${fileName}`
      });
    }
    
    // Check if the file exists
    if (!await fileUtils.fileExists(filePath)) {
      return res.status(404).json({
        success: false,
        error: `File not found: ${category}/${fileName}`
      });
    }
    
    // Get the file content
    const file = await fileUtils.getFile(category, fileName, { raw: true });
    
    if (!file.success) {
      return res.status(500).json({
        success: false,
        error: `Failed to read file: ${file.error}`
      });
    }
    
    // Prepare options
    const options = {
      outputFileName: outputFileName || fileName
    };
    
    // Parse custom tools configuration if provided
    if (tools) {
      options.tools = tools;
    }
    
    // Format the file based on its extension
    const ext = path.extname(fileName).toLowerCase();
    let result;
    
    if (['.ts', '.js', '.jsx', '.tsx'].includes(ext)) {
      result = await formatUtils.formatTypeScriptFile(file.content, fileName, options);
    } else if (['.css', '.scss'].includes(ext)) {
      result = await formatUtils.formatStyleFile(file.content, fileName, options);
    } else if (['.html'].includes(ext)) {
      result = await formatUtils.formatHtmlFile(file.content, fileName, options);
    } else if (['.json'].includes(ext)) {
      // JSON files only need Prettier
      options.tools = {
        useEslint: false,
        usePrettier: true,
        useStylelint: false
      };
      result = await formatUtils.formatFile(file.content, fileName, options);
    } else {
      return res.status(400).json({
        success: false,
        error: `Unsupported file extension: ${ext}`
      });
    }
    
    // Handle errors from formatting
    if (!result.success) {
      return res.status(result.code || 500).json({
        success: false,
        error: result.error
      });
    }
    
    // If the client only wants a download URL, don't include the full content
    if (req.body.urlOnly === true) {
      const { content, ...resultWithoutContent } = result;
      return res.json(resultWithoutContent);
    }
    
    // Return the formatted file details
    res.json(result);
  } catch (error) {
    console.error("[ERROR] Formatting existing file failed:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Formatting failed"
    });
  }
});

/**
 * GET /format/formatted
 * List formatted files
 */
router.get("/formatted", async (req, res) => {
  try {
    const { search, sort, order } = req.query;
    
    const options = {
      includeStats: true,
      sortBy: sort || 'date',
      sortOrder: order || 'desc'
    };
    
    const result = await fileUtils.getFiles(formatUtils.config.FORMATTED_CATEGORY, search, options);
    
    if (!result.success) {
      return res.status(result.code || 500).json({
        success: false,
        error: result.error
      });
    }
    
    // Transform file data to include download URLs
    const files = result.files.map(file => ({
      ...file,
      downloadUrl: `/files/file?category=${formatUtils.config.FORMATTED_CATEGORY}&fileName=${file.fileName}&download=true`
    }));
    
    res.json({
      success: true,
      files,
      count: files.length
    });
  } catch (error) {
    console.error("[ERROR] Failed to list formatted files:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to list formatted files"
    });
  }
});

module.exports = router;