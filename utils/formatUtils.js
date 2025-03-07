const { spawn } = require("child_process");
const path = require("path");
const fileUtils = require("./fileUtils");
const pathUtils = require("./pathUtils");
const properties = require("./properties");
const os = require("os");

/**
 * Configuration for formatting utilities
 */
const config = {
  TEMP_CATEGORY: properties.CATEGORIES.TEMP,
  FORMATTED_CATEGORY: properties.CATEGORIES.FORMATTED,
  DEFAULT_TIMEOUT: properties.FORMAT_TIMEOUT,
  SUPPORTED_EXTENSIONS: ['.ts', '.js', '.jsx', '.tsx', '.json', '.css', '.scss', '.html'],
  MAX_FILE_SIZE: properties.MAX_FILE_SIZE
};

/**
 * Determines the appropriate command structure based on operating system
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
 * Validates a file for formatting
 * @param {Buffer|string} fileData - File content
 * @param {string} fileName - File name
 * @returns {Object|null} - Validation error or null if valid
 */
function validateFormatFile(fileData, fileName) {
  // Check if file data is provided
  if (!fileData) {
    return {
      error: "No file data provided",
      code: 400
    };
  }
  
  // Check file size
  const fileSize = Buffer.isBuffer(fileData) ? fileData.length : Buffer.from(fileData).length;
  if (fileSize > config.MAX_FILE_SIZE) {
    return {
      error: `File size exceeds limit of ${config.MAX_FILE_SIZE / 1024 / 1024}MB`,
      code: 413
    };
  }
  
  // Check file extension
  const ext = path.extname(fileName).toLowerCase();
  if (!config.SUPPORTED_EXTENSIONS.includes(ext)) {
    return {
      error: `Unsupported file extension: ${ext}. Supported extensions: ${config.SUPPORTED_EXTENSIONS.join(', ')}`,
      code: 400
    };
  }
  
  return null;
}

/**
 * Determines formatting tools based on file extension
 * @param {string} fileName - File name
 * @returns {Object} - Tools to use for formatting
 */
function getFormattingTools(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  
  // Default tools
  let tools = {
    useEslint: false,
    usePrettier: true,
    useStylelint: false
  };
  
  // JavaScript/TypeScript files
  if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
    tools.useEslint = true;
  }
  
  // CSS/SCSS files
  if (['.css', '.scss'].includes(ext)) {
    tools.useStylelint = true;
  }
  
  return tools;
}

/**
 * Executes a shell command with improved error handling
 * @param {string} baseCommand - The base command to run
 * @param {Array<string>} args - Command arguments
 * @param {Object} options - Command options
 * @returns {Promise<Object>} - Command result
 */
async function runCommand(baseCommand, args, options = {}) {
  const cmdInfo = getCommandForOS();
  const timeout = options.timeout || config.DEFAULT_TIMEOUT;
  
  // Build the full command array
  let fullCommand;
  if (cmdInfo.command === "cmd.exe") {
    // For Windows, combine everything into a single string
    fullCommand = [...cmdInfo.argPrefix, `${baseCommand} ${args.join(' ')}`];
  } else {
    // For Unix, keep the command and args separate
    fullCommand = [...cmdInfo.argPrefix, ...baseCommand.split(' '), ...args];
  }
  
  return new Promise((resolve, reject) => {
    console.log(`[INFO] Running command: ${baseCommand} ${args.join(' ')}`);
    
    const process = spawn(cmdInfo.command, fullCommand, { 
      shell: cmdInfo.shell,
      timeout
    });
    
    let stdoutData = "";
    let stderrData = "";
    
    process.stdout.on("data", (data) => {
      const chunk = data.toString();
      stdoutData += chunk;
    });
    
    process.stderr.on("data", (data) => {
      const chunk = data.toString();
      stderrData += chunk;
      // Not all stderr output is an error, some tools use stderr for warnings
      console.log(`[COMMAND STDERR] ${chunk.trim()}`);
    });
    
    process.on("error", (error) => {
      console.error(`[ERROR] Command failed: ${error.message}`);
      reject({
        success: false,
        error: error.message,
        command: `${baseCommand} ${args.join(' ')}`
      });
    });
    
    process.on("close", (code) => {
      console.log(`[INFO] Command exited with code: ${code}`);
      
      if (code !== 0 && !options.ignoreExitCode) {
        return reject({
          success: false,
          code,
          error: stderrData || `Command exited with code ${code}`,
          command: `${baseCommand} ${args.join(' ')}`
        });
      }
      
      resolve({
        success: true,
        code,
        stdout: stdoutData,
        stderr: stderrData,
        command: `${baseCommand} ${args.join(' ')}`
      });
    });
  });
}

/**
 * Formats a file by applying appropriate formatting tools
 * @param {Buffer|string} fileData - File content
 * @param {string} fileName - Original file name
 * @param {Object} options - Formatting options
 * @returns {Promise<Object>} - Formatting result
 */
async function formatFile(fileData, fileName, options = {}) {
  try {
    // Validate the file
    const validationError = validateFormatFile(fileData, fileName);
    if (validationError) {
      return validationError;
    }
    
    // Determine which tools to use
    const tools = options.tools || getFormattingTools(fileName);
    
    // Generate a safe filename
    const safeFileName = pathUtils.sanitizeFilename(fileName);
    
    // Save file to temp directory
    const tempResult = await fileUtils.saveDataToFile(
      config.TEMP_CATEGORY,
      safeFileName,
      fileData,
      { 
        raw: Buffer.isBuffer(fileData),
        overwrite: true
      }
    );
    
    if (!tempResult.success) {
      throw new Error(`Failed to save temp file: ${tempResult.error}`);
    }
    
    // Get the full path of the temp file
    const tempFilePath = pathUtils.getSafeFilePath(config.TEMP_CATEGORY, safeFileName);
    
    // Commands to run
    const commands = [];
    const commandResults = [];
    
    // Add ESLint if needed
    if (tools.useEslint) {
      commands.push({
        name: "ESLint",
        baseCommand: "npx eslint",
        args: [tempFilePath, "--fix", "--format=json"],
        options: { ignoreExitCode: true } // ESLint returns non-zero for warnings
      });
    }
    
    // Add Stylelint if needed
    if (tools.useStylelint) {
      commands.push({
        name: "Stylelint",
        baseCommand: "npx stylelint",
        args: [tempFilePath, "--fix"],
        options: { ignoreExitCode: true } // Stylelint returns non-zero for warnings
      });
    }
    
    // Add Prettier (always)
    if (tools.usePrettier) {
      commands.push({
        name: "Prettier",
        baseCommand: "npx prettier",
        args: ["--write", tempFilePath]
      });
    }
    
    // Run all commands in sequence
    for (const cmd of commands) {
      try {
        console.log(`[INFO] Running ${cmd.name}...`);
        const result = await runCommand(cmd.baseCommand, cmd.args, cmd.options);
        commandResults.push({
          tool: cmd.name,
          success: true,
          message: `${cmd.name} completed successfully`
        });
      } catch (err) {
        console.error(`[WARNING] ${cmd.name} had issues:`, err);
        commandResults.push({
          tool: cmd.name,
          success: false,
          error: err.error || `${cmd.name} failed`
        });
        // Continue with other tools even if one fails
      }
    }
    
    // Copy the formatted file to the formatted directory
    const formattedResult = await fileUtils.copyFile(
      config.TEMP_CATEGORY,
      safeFileName,
      config.FORMATTED_CATEGORY,
      options.outputFileName || safeFileName,
      { overwrite: true }
    );
    
    if (!formattedResult.success) {
      throw new Error(`Failed to save formatted file: ${formattedResult.error}`);
    }
    
    // Get the formatted file
    const formattedFile = await fileUtils.getFile(
      config.FORMATTED_CATEGORY,
      formattedResult.fileName,
      { raw: true }
    );
    
    if (!formattedFile.success) {
      throw new Error(`Failed to read formatted file: ${formattedFile.error}`);
    }
    
    // Clean up the temp file
    await fileUtils.deleteFile(config.TEMP_CATEGORY, safeFileName);
    
    return {
      success: true,
      fileName: formattedResult.fileName,
      filePath: formattedResult.targetPath,
      downloadUrl: `/files/file?category=${config.FORMATTED_CATEGORY}&fileName=${formattedResult.fileName}&download=true`,
      content: formattedFile.content.toString('utf-8'),
      toolResults: commandResults,
      message: "File formatted successfully"
    };
  } catch (error) {
    console.error("[ERROR] Formatting failed:", error);
    return {
      success: false,
      error: error.message || "Formatting failed",
      code: 500
    };
  }
}

/**
 * Formats a TypeScript/JavaScript file using ESLint and Prettier
 * @param {Buffer} fileData - The uploaded file content
 * @param {string} originalName - The original file name
 * @param {Object} options - Formatting options
 * @returns {Promise<Object>} - Formatted file info
 */
async function formatTypeScriptFile(fileData, originalName, options = {}) {
  // Set specific tools for TypeScript
  const formatOptions = {
    ...options,
    tools: {
      useEslint: true,
      usePrettier: true,
      useStylelint: false
    }
  };
  
  return formatFile(fileData, originalName, formatOptions);
}

/**
 * Formats a CSS/SCSS file using Stylelint and Prettier
 * @param {Buffer} fileData - The uploaded file content
 * @param {string} originalName - The original file name
 * @param {Object} options - Formatting options
 * @returns {Promise<Object>} - Formatted file info
 */
async function formatStyleFile(fileData, originalName, options = {}) {
  // Set specific tools for CSS
  const formatOptions = {
    ...options,
    tools: {
      useEslint: false,
      usePrettier: true,
      useStylelint: true
    }
  };
  
  return formatFile(fileData, originalName, formatOptions);
}

/**
 * Formats an HTML file using Prettier
 * @param {Buffer} fileData - The uploaded file content
 * @param {string} originalName - The original file name
 * @param {Object} options - Formatting options
 * @returns {Promise<Object>} - Formatted file info
 */
async function formatHtmlFile(fileData, originalName, options = {}) {
  // Set specific tools for HTML
  const formatOptions = {
    ...options,
    tools: {
      useEslint: false,
      usePrettier: true,
      useStylelint: false
    }
  };
  
  return formatFile(fileData, originalName, formatOptions);
}

// Register necessary directories with pathUtils to ensure they exist and are safe
pathUtils.registerSafeDirectory(config.TEMP_CATEGORY, config.TEMP_CATEGORY);
pathUtils.registerSafeDirectory(config.FORMATTED_CATEGORY, config.FORMATTED_CATEGORY);

module.exports = {
  formatFile,
  formatTypeScriptFile,
  formatStyleFile,
  formatHtmlFile,
  config
};