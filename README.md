# Playwright Automation & File Management API Server

A Node.js-based API server designed for automated web testing, web scraping, and file management using Playwright, TypeScript, and supporting utilities.

## Overview

This project provides a comprehensive API server that enables:
- Running Playwright test scripts via API endpoints
- Web scraping with Playwright script generation
- File management (uploads, downloads, formatting)
- Test reports generation and viewing
- Logging and monitoring

## Features

### 1. Playwright Test Execution
- Run Playwright test specs via API
- Upload test files for execution
- Get JSON test results
- Access HTML test reports

### 2. Web Scraping with Playwright
- Scrape websites for structured data
- Extract selectors and locators
- Support for parallel scraping

### 3. File Management API
- Upload and download files
- Organize files by category
- Query-based file retrieval


### 4. Enhanced Logging & Error Handling
- Request/response logging
- File operation logging
- Structured logs for debugging

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/playwright-api-server.git
cd playwright-api-server

# Install dependencies
npm install

# Set up .env file (see .env.example)
cp .env.example .env

# Install Playwright browsers
npx playwright install
```

## Configuration

Create a `.env` file with the following variables:

```
PORT=3000
HOST=localhost
FILE_BASE_PATH=./files
```

## Usage

### Starting the Server

```bash
npm start
```

The server will start on http://localhost:3000 (or your configured host/port).

# Welcome to the Playwright Automation Server!

API Version: 1.0.0

## Table of Contents

- [Core API](#core-api)
- [File Management](#file-management)
- [Testing & Automation](#testing-&-automation)
- [Web Scraping](#web-scraping)
- [Utilities](#utilities)

## Core API

Essential server operations and information

### GET /help

Displays a list of available API endpoints

#### Returns

JSON object containing API documentation

### GET /logs

Retrieves server logs with optional filtering

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| level | query | Filter by log level (ERROR, WARNING, INFO, DEBUG) |
| limit | query | Limit number of logs returned |
| search | query | Search text in log messages |

#### Returns

JSON array of log entries

#### Example

Get the 10 most recent error logs

**URL**: `/logs?level=ERROR&limit=10`

### GET /logs/live

Streams live logs via Server-Sent Events (SSE)

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| level | query | Filter by log level (ERROR, WARNING, INFO, DEBUG) |

#### Returns

SSE stream of log entries

#### Example

Stream all INFO level or higher logs in real-time

**URL**: `/logs/live?level=INFO`

### GET /logs/download

Downloads logs as a file

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| level | query | Filter by log level (ERROR, WARNING, INFO, DEBUG) |
| format | query | Output format (json or text) |

#### Returns

File download (JSON or text)

#### Example

Download all logs in JSON format

**URL**: `/logs/download?format=json`

## File Management

Operations for working with files and directories

### GET /files

Lists all files in the specified category with optional filtering and sorting

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| category | query | File category/directory (e.g., logs, reports) |
| search | query | Filter by filename |
| sort | query | Sort field (name, size, date) |
| order | query | Sort order (asc, desc) |
| stats | query | Include file stats (true/false) |

#### Returns

JSON array of file information

#### Example

Get a list of report files sorted by date in descending order with file statistics

**URL**: `/files?category=reports&sort=date&order=desc&stats=true`

### GET /files/file

Retrieves the content of a specific file

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| category | query | File category/directory |
| fileName | query | Name of the file to retrieve |
| raw | query | Return raw content (true/false) |
| download | query | Download as file (true/false) |

#### Returns

File content or download

#### Example

Get the content of test-results.json from the reports category

**URL**: `/files/file?category=reports&fileName=test-results.json`

### POST /files

Saves data to a file in the specified category

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| category | body | File category/directory |
| fileName | body | Name for the file |
| data | body | Content to save (object or string) |
| overwrite | body | Whether to overwrite existing files (boolean) |

#### Returns

JSON object with save status

#### Example

Save a JSON object to summary.json in the reports category

**URL**: `/files`

**Body**:
```json
{
  "category": "reports",
  "fileName": "summary.json",
  "data": {
    "status": "success",
    "count": 5
  },
  "overwrite": true
}
```

### POST /files/folder

Creates a new folder in the specified category

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| category | body | Parent category/directory |
| folderName | body | Name for the new folder |

#### Returns

JSON object with folder creation status

#### Example

Create a new folder named "monthly" in the reports category

**URL**: `/files/folder`

**Body**:
```json
{
  "category": "reports",
  "folderName": "monthly"
}
```

### POST /files/copy

Copies a file from one location to another

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| sourceCategory | body | Source category/directory |
| sourceFileName | body | Source file name |
| targetCategory | body | Target category/directory |
| targetFileName | body | Target file name (optional) |
| overwrite | body | Whether to overwrite existing files (boolean) |

#### Returns

JSON object with copy status

#### Example

Copy server.log from logs to archives as server-backup.log

**URL**: `/files/copy`

**Body**:
```json
{
  "sourceCategory": "logs",
  "sourceFileName": "server.log",
  "targetCategory": "archives",
  "targetFileName": "server-backup.log",
  "overwrite": false
}
```

### DELETE /files

Deletes a specific file

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| category | query | File category/directory |
| fileName | query | Name of the file to delete |

#### Returns

JSON object with deletion status

#### Example

Delete old-data.json from the temp category

**URL**: `/files?category=temp&fileName=old-data.json`

## Web Scraping

Website analysis and data extraction

### POST /scrape

Scrapes a website and extracts relevant information

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| urls | body | Array of URLs to scrape |
| options | body | Scraping options (timeout, waitUntil, etc.) |

#### Returns

JSON object with scraped data

#### Example

Scrape example.com with screenshots enabled

**URL**: `/scrape`

**Body**:
```json
{
  "urls": [
    "https://example.com"
  ],
  "options": {
    "timeout": 30000,
    "waitUntil": "domcontentloaded",
    "screenshots": true
  }
}
```

### POST /scrape/playwright

Scrapes a website and returns Playwright locators and test scripts

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| url | body | URL to scrape |
| options | body | Options for locator generation |

#### Returns

JSON object with Playwright locators and test script

#### Example

Generate Playwright locators for forms on example.com

**URL**: `/scrape/playwright`

**Body**:
```json
{
  "url": "https://example.com",
  "options": {
    "includeScript": true,
    "selector": "form"
  }
}
```

## Testing & Automation

Playwright test execution and reporting

### POST /run-tests

Runs Playwright test cases and returns the results

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| testFile | body | Specific test file to run (optional) |
| testName | body | Specific test name to run (optional) |
| project | body | Playwright project to run (optional) |
| reporter | body | Reporter to use (default: json) |

#### Returns

JSON object with test results

#### Example

Run login tests with JSON reporter

**URL**: `/run-tests`

**Body**:
```json
{
  "testFile": "login.spec.js",
  "reporter": "json"
}
```

### GET /reports

Accesses the latest Playwright HTML report

#### Returns

HTML report or JSON list of available reports

## Utilities

Formatting, compression, and other utilities

### POST /format

Formats a TypeScript/JavaScript file using Prettier and ESLint

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| file | formData | File to format |
| options | formData | Formatting options (JSON string) |

#### Returns

Formatted file content