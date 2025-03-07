const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const pathUtils = require("./pathUtils");
const logger = require("./logUtils");

// Configuration object for easier maintenance and testing
const config = {
  DEFAULT_ENCODING: "utf-8",
  FILE_SIZE_LIMIT: 10 * 1024 * 1024, // 10MB limit for file operations
};

/**
 * Logs a message with timestamp and severity level
 * @param {string} level - Log level (INFO, WARNING, ERROR, SUCCESS)
 * @param {string} message - The message to log
 * @param {Error|null} error - Optional error object
 */
function logMessage(level, message, error = null) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level}] ${message}`;
  
  if (error) {
    console.error(logEntry, error);
  } else if (level === "ERROR") {
    console.error(logEntry);
  } else if (level === "WARNING") {
    console.warn(logEntry);
  } else {
    console.log(logEntry);
  }
}

/**
 * Validates that required parameters are provided
 * @param {Object} params - Parameters to validate
 * @param {Array<string>} required - List of required parameter names
 * @returns {Object|null} - Error object or null if validation passes
 */
function validateParams(params, required) {
  const missing = required.filter(param => !params[param]);
  
  if (missing.length > 0) {
    return {
      error: `Missing required parameters: ${missing.join(", ")}`,
      code: 400
    };
  }
  
  return null;
}

/**
 * Checks if a file exists
 * @param {string} filePath - Path to the file
 * @returns {Promise<boolean>} - Whether the file exists
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates a directory if it doesn't exist
 * @param {string} dirPath - Path to create
 * @returns {Promise<void>}
 */
async function ensureDirectoryExists(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Retrieves a list of files based on query parameters.
 * @param {string} category - Optional subfolder (e.g., 'logs', 'scraped').
 * @param {string} search - Optional search query for filtering filenames.
 * @param {Object} options - Optional parameters
 * @param {boolean} options.includeStats - Whether to include file stats
 * @param {boolean} options.includeContent - Whether to include file content
 * @param {string} options.sortBy - Sort by field (name, size, date)
 * @param {string} options.sortOrder - Sort order (asc, desc)
 * @returns {Promise<object>} - List of file details or error.
 */
async function getFiles(category = "", search = "", options = {}) {
  try {
    // Get the safe category path using the new pathUtils function
    const dirPath = pathUtils.getSafeCategoryPath(category);
    
    // Check if the path is valid
    if (!dirPath) {
      logMessage("WARNING", `Invalid category path: ${category}`);
      return { error: "Invalid category path.", code: 400 };
    }
    
    // Check if directory exists
    if (!(await fileExists(dirPath))) {
      logMessage("WARNING", `Requested category does not exist: ${category}`);
      return { error: "Category does not exist.", code: 404 };
    }
    
    // Read directory contents
    const fileNames = await fs.readdir(dirPath);
    console.debug("getFiles: dirPath:", dirPath);
    console.debug("getFiles: fileNames:", fileNames);
    try {
      const fileNames = await fs.readdir(dirPath);
      for (const file of fileNames)
        console.log(file);
    } catch (err) {
      console.error(err);
    }
    
    // Get file details
    let files = await Promise.all(
      fileNames.map(async (fileName) => {
        // Get safe file path using pathUtils
        const filePath = pathUtils.getSafeFilePath(category, fileName);
        
        // Skip invalid file paths
        if (!filePath) {
          logMessage("WARNING", `Skipping invalid file path: ${fileName} in ${category}`);
          return null;
        }
        
        // Include file stats if requested
        let fileInfo = {
          fileName,
          filePath,
          // Use pathUtils to get a relative path for consistent API responses
          relativePath: pathUtils.getRelativePath(filePath) || path.join(category, fileName)
        };
        
        if (options.includeStats) {
          try {
            const stats = await fs.stat(filePath);
            fileInfo = {
              ...fileInfo,
              size: stats.size,
              created: stats.birthtime,
              modified: stats.mtime,
              isDirectory: stats.isDirectory()
            };
          } catch (statsError) {
            logMessage("WARNING", `Failed to get stats for file: ${filePath}`, statsError);
          }
        }
        
        // Include file content if requested and not a directory
        if (options.includeContent && (!fileInfo.isDirectory)) {
          try {
            const content = await fs.readFile(filePath, 'utf8');
            fileInfo.content = content;
          } catch (contentError) {
            logMessage("WARNING", `Failed to read content for file: ${filePath}`, contentError);
            fileInfo.contentError = "Failed to read file content";
          }
        }
        
        return fileInfo;
      })
    );
    
    // Filter out null entries (invalid paths)
    files = files.filter(Boolean);
    
    // Apply search filter if provided
    if (search) {
      files = files.filter(file => 
        file.fileName.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    // Sort files if requested
    if (options.sortBy) {
      const sortOrder = options.sortOrder === 'desc' ? -1 : 1;
      const sortField = options.sortBy === 'name' ? 'fileName' : 
      options.sortBy === 'size' ? 'size' :
      options.sortBy === 'date' ? 'modified' : 'fileName';
      
      files.sort((a, b) => {
        // Handle missing fields (could happen if includeStats is false)
        if (!a[sortField]) return -1 * sortOrder;
        if (!b[sortField]) return 1 * sortOrder;
        
        // String comparison
        if (typeof a[sortField] === 'string') {
          return a[sortField].localeCompare(b[sortField]) * sortOrder;
        }
        
        // Date comparison
        if (a[sortField] instanceof Date) {
          return (a[sortField].getTime() - b[sortField].getTime()) * sortOrder;
        }
        
        // Number comparison
        return (a[sortField] - b[sortField]) * sortOrder;
      });
    }
    
    logMessage("INFO", `Retrieved ${files.length} files from ${category}`);
    return { 
      success: true, 
      files,
      totalCount: files.length,
      path: category
    };
  } catch (error) {
    logMessage("ERROR", `Failed to retrieve files from ${category}`, error);
    return { error: "Internal server error.", code: 500 };
  }
}

/**
 * Retrieves a specific file's content.
 * @param {string} category - The subfolder.
 * @param {string} fileName - The name of the file.
 * @param {Object} options - Optional parameters
 * @param {string} options.encoding - File encoding (default: utf-8)
 * @param {boolean} options.raw - Return raw buffer instead of parsed content
 * @param {boolean} options.allowDangerousExtensions - Whether to allow potentially dangerous file extensions
 * @returns {Promise<object>} - File content or error message.
 */
async function getFile(category, fileName, options = {}) {
  try {
    // Validate required parameters
    const validationError = validateParams({ category, fileName }, ['category', 'fileName']);
    if (validationError) return validationError;
    
    // Get safe file path using pathUtils
    const filePath = pathUtils.getSafeFilePath(
      category, 
      fileName, 
      { allowDangerousExtensions: options.allowDangerousExtensions }
    );
    
    // Check if the path is valid
    if (!filePath) {
      logMessage("WARNING", `Invalid file path: ${category}/${fileName}`);
      return { error: "Invalid file path.", code: 400 };
    }
    
    // Check if file exists
    if (!(await fileExists(filePath))) {
      logMessage("WARNING", `File not found: ${filePath}`);
      return { error: "File not found.", code: 404 };
    }
    
    // Get file stats
    const stats = await fs.stat(filePath);
    
    // Check file size limit
    if (stats.size > config.FILE_SIZE_LIMIT) {
      logMessage("WARNING", `File exceeds size limit: ${filePath} (${stats.size} bytes)`);
      return { error: "File too large to process.", code: 413 };
    }
    
    // Read file content
    const encoding = options.encoding || config.DEFAULT_ENCODING;
    const content = options.raw ? 
      await fs.readFile(filePath) : 
      await fs.readFile(filePath, encoding);
    
    // Parse JSON if needed and not in raw mode
    let parsedContent = content;
    if (!options.raw && fileName.endsWith('.json')) {
      try {
        parsedContent = JSON.parse(content);
      } catch (parseError) {
        logMessage("WARNING", `Failed to parse JSON file: ${filePath}`, parseError);
        // Continue with unparsed content
      }
    }
    
    logMessage("INFO", `File retrieved: ${filePath}`);
    return { 
      success: true, 
      fileName, 
      content: parsedContent,
      stats: {
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime
      },
      // Include relative path for consistent API responses
      relativePath: pathUtils.getRelativePath(filePath) || path.join(category, fileName)
    };
  } catch (error) {
    logMessage("ERROR", `Failed to retrieve file: ${category}/${fileName}`, error);
    return { error: "Internal server error.", code: 500 };
  }
}

/**
 * Saves data to a file inside a specified category.
 * @param {string} category - The subfolder name.
 * @param {string} fileName - The file name.
 * @param {any} data - The data to write (object, string, or buffer).
 * @param {Object} options - Optional parameters
 * @param {boolean} options.overwrite - Whether to overwrite existing files
 * @param {boolean} options.append - Whether to append to an existing file
 * @param {string} options.encoding - File encoding (default: utf-8)
 * @param {boolean} options.raw - Whether data is a raw buffer
 * @param {boolean} options.sanitizeFilename - Whether to sanitize the filename
 * @returns {Promise<object>} - File save status.
 */
async function saveDataToFile(category, fileName, data, options = {}) {
  let fileHandle = null;
  
  try {
    // Validate required parameters
    const validationError = validateParams({ category, fileName, data }, ['category', 'fileName', 'data']);
    if (validationError) return validationError;
    
    // Sanitize filename if requested
    const finalFileName = options.sanitizeFilename ?
      pathUtils.sanitizeFilename(fileName) :
      fileName;
    
    // Get the safe category path
    const dirPath = pathUtils.getSafeCategoryPath(category);
    if (!dirPath) {
      logMessage("WARNING", `Invalid category path: ${category}`);
      return { error: "Invalid category path.", code: 400 };
    }
    
    // Get a safe file path
    const filePath = pathUtils.getSafeFilePath(category, finalFileName);
    if (!filePath) {
      logMessage("WARNING", `Invalid file path: ${category}/${finalFileName}`);
      return { error: "Invalid file path.", code: 400 };
    }
    
    // Check if file exists and handle overwrite/append options
    const exists = await fileExists(filePath);
    if (exists) {
      if (options.overwrite === false && options.append !== true) {
        logMessage("WARNING", `File already exists and overwrite is disabled: ${filePath}`);
        return { error: "File already exists.", code: 409 };
      }
    }
    
    await ensureDirectoryExists(dirPath);
    
    // Format data for writing
    let contentToWrite;
    if (options.raw || Buffer.isBuffer(data)) {
      contentToWrite = data;
    } else if (typeof data === 'string') {
      contentToWrite = data;
    } else {
      // Assume it's an object that needs to be stringified
      contentToWrite = JSON.stringify(data, null, 2);
    }
    
    // Check content size (for appending, this checks just the new content)
    const contentSize = Buffer.isBuffer(contentToWrite) ?
      contentToWrite.length :
      Buffer.from(contentToWrite).length;
    
    if (contentSize > config.FILE_SIZE_LIMIT) {
      logMessage("WARNING", `Content too large to save: ${contentSize} bytes`);
      return { error: "Content too large to save.", code: 413 };
    }
    
    // If appending, check that combined size isn't too large
    if (options.append && exists) {
      const stats = await fs.stat(filePath);
      if (stats.size + contentSize > config.FILE_SIZE_LIMIT) {
        logMessage("WARNING", `Combined content too large to save: ${stats.size + contentSize} bytes`);
        return { error: "Combined content too large to save.", code: 413 };
      }
    }
    
    // Write to file
    const encoding = options.encoding || config.DEFAULT_ENCODING;
    
    if (options.append) {
      if (Buffer.isBuffer(contentToWrite)) {
        // First read the existing content with explicit handle
        fileHandle = await fs.open(filePath, 'r');
        const existingContent = await fileHandle.readFile();
        await fileHandle.close();
        fileHandle = null;
        
        // Then write the combined content with a new handle
        fileHandle = await fs.open(filePath, 'w');
        const combinedContent = Buffer.concat([existingContent, contentToWrite]);
        await fileHandle.writeFile(combinedContent);
      } else {
        // For text, open with append flag
        fileHandle = await fs.open(filePath, 'a');
        await fileHandle.writeFile(contentToWrite, { encoding });
      }
    } else {
      // Normal write with explicit handle
      fileHandle = await fs.open(filePath, 'w');
      if (Buffer.isBuffer(contentToWrite)) {
        await fileHandle.writeFile(contentToWrite);
      } else {
        await fileHandle.writeFile(contentToWrite, { encoding });
      }
    }
    
    logMessage("INFO", `Data ${options.append ? "appended to" : "saved to"}: ${filePath}`);
    return {
      success: true,
      filePath,
      fileName: finalFileName,
      relativePath: pathUtils.getRelativePath(filePath) || path.join(category, finalFileName)
    };
  } catch (error) {
    logMessage("ERROR", `Failed to save file: ${category}/${fileName}`, error);
    return { error: "Failed to save file.", code: 500 };
  } finally {
    if (fileHandle) {
      try {
        await fileHandle.close();
      } catch (closeError) {
        console.error("Error closing file handle:", closeError);
      }
    }
  }
}

/**
 * Deletes a specified file.
 * @param {string} category - The subfolder.
 * @param {string} fileName - The name of the file.
 * @returns {Promise<object>} - Deletion status.
 */
async function deleteFile(category, fileName) {
  try {
    // Validate required parameters
    const validationError = validateParams({ category, fileName }, ['category', 'fileName']);
    if (validationError) return validationError;
    
    // Get a safe file path
    const filePath = pathUtils.getSafeFilePath(category, fileName);
    if (!filePath) {
      logMessage("WARNING", `Invalid file path: ${category}/${fileName}`);
      return { error: "Invalid file path.", code: 400 };
    }
    
    // Check if file exists
    if (!(await fileExists(filePath))) {
      logMessage("WARNING", `Attempted to delete non-existent file: ${filePath}`);
      return { error: "File not found.", code: 404 };
    }
    
    // Delete file
    await fs.unlink(filePath);
    logMessage("SUCCESS",`Deleted file: ${filePath}`);
    return { 
      success: true,
      fileName,
      relativePath: pathUtils.getRelativePath(filePath) || path.join(category, fileName)
    };
  } catch (error) {
    logMessage("ERROR", `Failed to delete file: ${category}/${fileName}`, error);
    return { error: "Failed to delete file.", code: 500 };
  }
}

/**
 * Creates a new folder in the specified category
 * @param {string} category - The parent category
 * @param {string} folderName - The name of the new folder
 * @returns {Promise<object>} - Creation status
 */
async function createFolder(category, folderName) {
  try {
    // Validate required parameters
    const validationError = validateParams({ category, folderName }, ['category', 'folderName']);
    if (validationError) return validationError;
    
    // Sanitize the folder name
    const sanitizedFolderName = pathUtils.sanitizeFilename(folderName);
    
    // Get the parent path
    const parentPath = pathUtils.getSafeCategoryPath(category);
    if (!parentPath) {
      logMessage("WARNING", `Invalid category path: ${category}`);
      return { error: "Invalid category path.", code: 400 };
    }
    
    // Create the full path for the new folder
    const folderPath = path.join(parentPath, sanitizedFolderName);
    
    // Check if folder already exists
    if (await fileExists(folderPath)) {
      logMessage("WARNING", `Folder already exists: ${folderPath}`);
      return { error: "Folder already exists.", code: 409 };
    }
    
    // Create the folder
    await fs.mkdir(folderPath, { recursive: true });
    
    // Register the new folder as a safe directory
    const relPath = pathUtils.getRelativePath(folderPath) || path.join(category, sanitizedFolderName);
    pathUtils.registerSafeDirectory(relPath, relPath);
    
    logMessage("SUCCESS",`Created folder: ${folderPath}`);
    return { 
      success: true, 
      path: relPath,
      name: sanitizedFolderName,
      fullPath: folderPath
    };
  } catch (error) {
    logMessage("ERROR", `Failed to create folder: ${category}/${folderName}`, error);
    return { error: "Failed to create folder.", code: 500 };
  }
}

/**
 * Copies a file to another location
 * @param {string} sourceCategory - Source category
 * @param {string} sourceFileName - Source file name
 * @param {string} targetCategory - Target category
 * @param {string} targetFileName - Target file name (optional, uses source name if not provided)
 * @param {Object} options - Optional parameters
 * @param {boolean} options.overwrite - Whether to overwrite existing files
 * @returns {Promise<object>} - Copy status
 */
async function copyFile(sourceCategory, sourceFileName, targetCategory, targetFileName = null, options = {}) {
  try {
    // Validate required parameters
    const validationError = validateParams(
      { sourceCategory, sourceFileName, targetCategory }, 
      ['sourceCategory', 'sourceFileName', 'targetCategory']
    );
    if (validationError) return validationError;
    
    // Use source filename if target filename is not provided
    const finalTargetFileName = targetFileName || sourceFileName;
    
    // Get safe file paths
    const sourcePath = pathUtils.getSafeFilePath(sourceCategory, sourceFileName);
    if (!sourcePath) {
      logMessage("WARNING", `Invalid source file path: ${sourceCategory}/${sourceFileName}`);
      return { error: "Invalid source file path.", code: 400 };
    }
    
    const targetDirPath = pathUtils.getSafeCategoryPath(targetCategory);
    if (!targetDirPath) {
      logMessage("WARNING", `Invalid target category path: ${targetCategory}`);
      return { error: "Invalid target category path.", code: 400 };
    }
    
    const targetPath = pathUtils.getSafeFilePath(targetCategory, finalTargetFileName);
    if (!targetPath) {
      logMessage("WARNING", `Invalid target file path: ${targetCategory}/${finalTargetFileName}`);
      return { error: "Invalid target file path.", code: 400 };
    }
    
    // Check if source file exists
    if (!(await fileExists(sourcePath))) {
      logMessage("WARNING", `Source file not found: ${sourcePath}`);
      return { error: "Source file not found.", code: 404 };
    }
    
    // Check if target file exists
    const targetExists = await fileExists(targetPath);
    if (targetExists && options.overwrite === false) {
      logMessage("WARNING", `Target file already exists and overwrite is disabled: ${targetPath}`);
      return { error: "Target file already exists.", code: 409 };
    }
    
    // Ensure target directory exists
    await ensureDirectoryExists(targetDirPath);
    
    // Copy the file
    await fs.copyFile(sourcePath, targetPath);
    
    logMessage("SUCCESS",`Copied file from ${sourcePath} to ${targetPath}`);
    return { 
      success: true, 
      sourcePath: pathUtils.getRelativePath(sourcePath) || path.join(sourceCategory, sourceFileName),
      targetPath: pathUtils.getRelativePath(targetPath) || path.join(targetCategory, finalTargetFileName),
      fileName: finalTargetFileName
    };
  } catch (error) {
    logMessage(
      "ERROR", 
      `Failed to copy file from ${sourceCategory}/${sourceFileName} to ${targetCategory}/${targetFileName || sourceFileName}`, 
      error
    );
    return { error: "Failed to copy file.", code: 500 };
  }
}

/**
 * Recursively gets the size of a directory
 * @param {string} dirPath - Directory path
 * @returns {Promise<number>} - Total size in bytes
 */
async function getDirSize(dirPath) {
  try {
    // Validate the directory path
    if (!pathUtils.validatePath(dirPath)) {
      logMessage("WARNING", `Invalid directory path: ${dirPath}`);
      return 0;
    }
    
    let totalSize = 0;
    const items = await fs.readdir(dirPath);
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      
      // Validate each item path
      if (!pathUtils.validatePath(itemPath)) {
        logMessage("WARNING", `Skipping invalid item path: ${itemPath}`);
        continue;
      }
      
      const stats = await fs.stat(itemPath);
      
      if (stats.isDirectory()) {
        totalSize += await getDirSize(itemPath);
      } else {
        totalSize += stats.size;
      }
    }
    
    return totalSize;
  } catch (error) {
    logMessage("ERROR", `Failed to get directory size: ${dirPath}`, error);
    throw error;
  }
}

/**
 * Gets summary information about storage usage
 * @returns {Promise<object>} - Storage information
 */
async function getStorageInfo() {
  try {
    const basePath = pathUtils.config.BASE_DIRECTORY;
    
    // Check if base path exists
    if (!(await fileExists(basePath))) {
      return { error: "Base directory does not exist.", code: 404 };
    }
    
    // Get all categories (subdirectories)
    const items = await fs.readdir(basePath);
    const categories = [];
    
    for (const item of items) {
      const itemPath = path.join(basePath, item);
      
      // Validate item path
      if (!pathUtils.validatePath(itemPath)) {
        logMessage("WARNING", `Skipping invalid item path: ${itemPath}`);
        continue;
      }
      
      const stats = await fs.stat(itemPath);
      
      if (stats.isDirectory()) {
        const size = await getDirSize(itemPath);
        const files = (await fs.readdir(itemPath)).length;
        
        categories.push({
          name: item,
          size,
          files,
          path: item,
          created: stats.birthtime,
          modified: stats.mtime
        });
      }
    }
    
    // Calculate total storage used
    const totalSize = categories.reduce((acc, cat) => acc + cat.size, 0);
    const totalFiles = categories.reduce((acc, cat) => acc + cat.files, 0);
    
    return {
      success: true,
      categories,
      totalSize,
      totalFiles,
      baseDirectory: basePath
    };
  } catch (error) {
    logMessage("ERROR", "Failed to get storage information", error);
    return { error: "Failed to get storage information.", code: 500 };
  }
}

/**
 * Moves a file from one location to another
 * @param {string} sourceCategory - Source category
 * @param {string} sourceFileName - Source file name
 * @param {string} targetCategory - Target category
 * @param {string} targetFileName - Target file name (optional, uses source name if not provided)
 * @param {Object} options - Optional parameters
 * @param {boolean} options.overwrite - Whether to overwrite existing files
 * @returns {Promise<object>} - Move status
 */
async function moveFile(sourceCategory, sourceFileName, targetCategory, targetFileName = null, options = {}) {
  try {
    // First copy the file
    const copyResult = await copyFile(
      sourceCategory, 
      sourceFileName, 
      targetCategory, 
      targetFileName, 
      options
    );
    
    // If copy failed, return the error
    if (!copyResult.success) {
      return copyResult;
    }
    
    // Then delete the source file
    const deleteResult = await deleteFile(sourceCategory, sourceFileName);
    
    // If delete failed, log it but return success (the file was copied)
    if (!deleteResult.success) {
      logMessage(
        "WARNING", 
        `File was copied but source file could not be deleted: ${sourceCategory}/${sourceFileName}`,
        { message: deleteResult.error }
      );
      
      return {
        success: true,
        partialSuccess: true,
        message: "File was copied but source file could not be deleted",
        sourcePath: copyResult.sourcePath,
        targetPath: copyResult.targetPath,
        fileName: copyResult.fileName
      };
    }
    
    // Both operations succeeded
    logMessage(
      "SUCCESS", 
      `Moved file from ${sourceCategory}/${sourceFileName} to ${targetCategory}/${targetFileName || sourceFileName}`
    );
    
    return {
      success: true,
      sourcePath: copyResult.sourcePath,
      targetPath: copyResult.targetPath,
      fileName: copyResult.fileName
    };
  } catch (error) {
    logMessage(
      "ERROR", 
      `Failed to move file from ${sourceCategory}/${sourceFileName} to ${targetCategory}/${targetFileName || sourceFileName}`, 
      error
    );
    return { error: "Failed to move file.", code: 500 };
  }
}

// Export the module with all the functions
module.exports = {
  getFiles,
  getFile,
  saveDataToFile,
  deleteFile,
  createFolder,
  copyFile,
  moveFile,
  getStorageInfo,
  fileExists,
  ensureDirectoryExists,
  config
};