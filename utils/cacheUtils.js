const fs = require("fs");
const path = require("path");
const { CACHE_HISTORY_LIMIT } = require("./properties");

const baseCachePath = path.resolve(__dirname, "../cache");
const cacheHistoryLimit = CACHE_HISTORY_LIMIT;

// Ensure cache directory exists
if (!fs.existsSync(baseCachePath)) {
    fs.mkdirSync(baseCachePath, { recursive: true });
}

/**
 * Returns the safe cache path for a category.
 * @param {string} category - The category name.
 * @returns {string} - The full path to the category's cache folder.
 */
function getCachePath(category) {
    const cachePath = path.resolve(baseCachePath, category);

    if (!cachePath.startsWith(baseCachePath)) {
        throw new Error("Access denied: Attempt to escape cache directory.");
    }

    if (!fs.existsSync(cachePath)) {
        fs.mkdirSync(cachePath, { recursive: true });
    }

    return cachePath;
}

/**
 * Stores a file in the cache and manages old files.
 * @param {string} category - The file category.
 * @param {string} filePath - The original file path.
 * @returns {string} - The path to the cached file.
 */
function cacheFile(category, filePath) {
    const cachePath = getCachePath(category);
    const fileName = path.basename(filePath);
    const cachedFilePath = path.join(cachePath, fileName);

    // Copy file to cache
    fs.copyFileSync(filePath, cachedFilePath);
    console.log(`[CACHE] Cached file: ${cachedFilePath}`);

    // Maintain cache history limit
    const cachedFiles = fs.readdirSync(cachePath)
        .map(file => ({ file, time: fs.statSync(path.join(cachePath, file)).mtimeMs }))
        .sort((a, b) => a.time - b.time); // Sort oldest first

    while (cachedFiles.length > cacheHistoryLimit) {
        const oldestFile = cachedFiles.shift().file;
        fs.unlinkSync(path.join(cachePath, oldestFile));
        console.log(`[CACHE] Deleted old cached file: ${oldestFile}`);
    }

    return cachedFilePath;
}

module.exports = { cacheFile };
