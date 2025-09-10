const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const logger = require('./logger');

/**
 * Python Script Integration Service
 * Wraps the existing convert.py script for Node.js integration
 */
class PythonConverter {
    constructor(options = {}) {
        this.pythonPath = options.pythonPath || 'python';
        this.scriptPath = options.scriptPath || path.join(process.cwd(), 'convert.py');
        this.workingDir = options.workingDir || process.cwd();
    }

    /**
     * Execute the Python conversion script
     * @returns {Promise<Object>} Conversion results and summary
     */
    async runConversion() {
        return new Promise((resolve, reject) => {
            logger.info('Starting Python XML-to-JSON conversion...');

            const pythonProcess = spawn(this.pythonPath, [this.scriptPath], {
                cwd: this.workingDir,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            pythonProcess.stdout.on('data', (data) => {
                const output = data.toString();
                stdout += output;
                logger.info(`Python: ${output.trim()}`);
            });

            pythonProcess.stderr.on('data', (data) => {
                const error = data.toString();
                stderr += error;
                logger.warn(`Python Error: ${error.trim()}`);
            });

            pythonProcess.on('close', async (code) => {
                if (code === 0) {
                    try {
                        // Read the conversion summary if available
                        const summaryPath = path.join(this.workingDir, 'conversion_summary.json');
                        let summary = null;

                        if (await fs.pathExists(summaryPath)) {
                            summary = await fs.readJson(summaryPath);
                        }

                        logger.info('Python conversion completed successfully');
                        resolve({
                            success: true,
                            exitCode: code,
                            stdout,
                            stderr,
                            summary,
                            timestamp: new Date().toISOString()
                        });
                    } catch (error) {
                        logger.error('Error reading conversion summary:', error);
                        resolve({
                            success: true,
                            exitCode: code,
                            stdout,
                            stderr,
                            summary: null,
                            timestamp: new Date().toISOString()
                        });
                    }
                } else {
                    logger.error(`Python conversion failed with exit code ${code}`);
                    reject(new Error(`Python script failed with exit code ${code}: ${stderr}`));
                }
            });

            pythonProcess.on('error', (error) => {
                logger.error('Failed to start Python process:', error);
                reject(new Error(`Failed to start Python process: ${error.message}`));
            });
        });
    }

    /**
     * Validate that Python and the script are available
     * @returns {Promise<boolean>} True if validation passes
     */
    async validateEnvironment() {
        try {
            // Check if Python is available
            const pythonCheck = spawn(this.pythonPath, ['--version'], { stdio: 'pipe' });

            await new Promise((resolve, reject) => {
                pythonCheck.on('close', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error(`Python not found or invalid`));
                });
                pythonCheck.on('error', reject);
            });

            // Check if convert.py exists
            if (!await fs.pathExists(this.scriptPath)) {
                throw new Error(`Python script not found at: ${this.scriptPath}`);
            }

            logger.info('Python environment validation passed');
            return true;
        } catch (error) {
            logger.error('Python environment validation failed:', error);
            throw error;
        }
    }

    /**
     * Get conversion status and file information
     * @returns {Promise<Object>} Current status of converted data
     */
    async getConversionStatus() {
        try {
            const dataDir = path.join(this.workingDir, 'data');
            const productsFile = path.join(this.workingDir, 'products.json');
            const summaryFile = path.join(this.workingDir, 'conversion_summary.json');

            const status = {
                dataDirectory: {
                    exists: await fs.pathExists(dataDir),
                    fileCount: 0,
                    lastModified: null
                },
                productsFile: {
                    exists: await fs.pathExists(productsFile),
                    size: 0,
                    lastModified: null
                },
                summary: null,
                lastConversion: null
            };

            // Check data directory
            if (status.dataDirectory.exists) {
                const files = await fs.readdir(dataDir);
                status.dataDirectory.fileCount = files.filter(f => f.endsWith('.json')).length;

                if (files.length > 0) {
                    const stats = await fs.stat(path.join(dataDir, files[0]));
                    status.dataDirectory.lastModified = stats.mtime.toISOString();
                }
            }

            // Check products file
            if (status.productsFile.exists) {
                const stats = await fs.stat(productsFile);
                status.productsFile.size = stats.size;
                status.productsFile.lastModified = stats.mtime.toISOString();
            }

            // Read summary if available
            if (await fs.pathExists(summaryFile)) {
                status.summary = await fs.readJson(summaryFile);
                status.lastConversion = status.summary.conversion_summary?.timestamp;
            }

            return status;
        } catch (error) {
            logger.error('Error getting conversion status:', error);
            throw error;
        }
    }
}

module.exports = PythonConverter;