import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs-extra';
import { logger, config } from '../utils';
import {
    PythonConverterConfig,
    ConversionResult,
    ConversionStatus,
    ConversionSummary,
    AppError
} from '../types';

/**
 * Python Script Integration Service
 * Wraps the existing convert.py script for TypeScript integration with enhanced type safety
 */
export class PythonConverterService {
    private readonly pythonPath: string;
    private readonly scriptPath: string;
    private readonly workingDir: string;

    constructor(options: PythonConverterConfig = {}) {
        this.pythonPath = options.pythonPath || this.getDefaultPythonPath();
        this.scriptPath = options.scriptPath || path.join(process.cwd(), 'convert.py');
        this.workingDir = options.workingDir || process.cwd();
    }

    /**
     * Get default Python executable based on platform
     */
    private getDefaultPythonPath(): string {
        // On Linux/Unix systems, use python3
        if (process.platform === 'linux' || process.platform === 'darwin') {
            return 'python3';
        }
        // On Windows, python usually works
        return 'python';
    }

    /**
     * Execute the Python conversion script
     */
    public async runConversion(): Promise<ConversionResult> {
        logger.info('Starting Python XML-to-JSON conversion...', {
            pythonPath: this.pythonPath,
            scriptPath: this.scriptPath,
            workingDir: this.workingDir
        });

        return new Promise((resolve, reject) => {
            const startTime = Date.now();

            const pythonProcess: ChildProcess = spawn(this.pythonPath, [this.scriptPath], {
                cwd: this.workingDir,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            // Handle stdout
            if (pythonProcess.stdout) {
                pythonProcess.stdout.on('data', (data: Buffer) => {
                    const output = data.toString();
                    stdout += output;
                    logger.debug('Python stdout', { output: output.trim() });
                });
            }

            // Handle stderr
            if (pythonProcess.stderr) {
                pythonProcess.stderr.on('data', (data: Buffer) => {
                    const error = data.toString();
                    stderr += error;
                    logger.warn('Python stderr', { error: error.trim() });
                });
            }

            // Handle process completion
            pythonProcess.on('close', async (code: number | null) => {
                const duration = Date.now() - startTime;

                if (code === 0) {
                    try {
                        const summary = await this.readConversionSummary();

                        logger.info('Python conversion completed successfully', {
                            duration: `${duration}ms`,
                            exitCode: code
                        });

                        resolve({
                            success: true,
                            exitCode: code,
                            stdout,
                            stderr,
                            summary,
                            timestamp: new Date().toISOString()
                        });
                    } catch (error) {
                        logger.warn('Failed to read conversion summary', { error });
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
                    const errorMessage = `Python script failed with exit code ${code}`;
                    logger.error(errorMessage, {
                        exitCode: code,
                        stderr,
                        duration: `${duration}ms`
                    });

                    reject(new AppError(`${errorMessage}: ${stderr}`, 500));
                }
            });

            // Handle process errors
            pythonProcess.on('error', (error: Error) => {
                logger.error('Failed to start Python process', error);
                reject(new AppError(`Failed to start Python process: ${error.message}`, 500));
            });

            // Set timeout for long-running processes
            const timeout = setTimeout(() => {
                pythonProcess.kill('SIGTERM');
                reject(new AppError('Python conversion process timed out', 500));
            }, 300000); // 5 minutes timeout

            pythonProcess.on('close', () => {
                clearTimeout(timeout);
            });
        });
    }

    /**
     * Validate that Python and the script are available
     */
    public async validateEnvironment(): Promise<boolean> {
        try {
            logger.debug('Validating Python environment...');

            // Check if Python is available
            await this.checkPythonAvailability();

            // Check if convert.py exists
            if (!await fs.pathExists(this.scriptPath)) {
                throw new AppError(`Python script not found at: ${this.scriptPath}`, 500);
            }

            // Check if script is readable
            try {
                await fs.access(this.scriptPath, fs.constants.R_OK);
            } catch {
                throw new AppError(`Python script is not readable: ${this.scriptPath}`, 500);
            }

            logger.info('Python environment validation passed', {
                pythonPath: this.pythonPath,
                scriptPath: this.scriptPath
            });

            return true;
        } catch (error) {
            logger.error('Python environment validation failed', error);
            throw error;
        }
    }

    /**
     * Get conversion status and file information
     */
    public async getConversionStatus(): Promise<ConversionStatus> {
        try {
            const dataDir = path.join(this.workingDir, config.get('dataOutputPath'));
            const productsFile = path.join(this.workingDir, config.get('productsOutputPath'));
            const summaryFile = path.join(this.workingDir, 'conversion_summary.json');

            const status: ConversionStatus = {
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
                try {
                    const files = await fs.readdir(dataDir);
                    const jsonFiles = files.filter(f => f.endsWith('.json'));
                    status.dataDirectory.fileCount = jsonFiles.length;

                    if (jsonFiles.length > 0) {
                        const stats = await fs.stat(path.join(dataDir, jsonFiles[0]));
                        status.dataDirectory.lastModified = stats.mtime.toISOString();
                    }
                } catch (error) {
                    logger.warn('Failed to read data directory', { error, dataDir });
                }
            }

            // Check products file
            if (status.productsFile.exists) {
                try {
                    const stats = await fs.stat(productsFile);
                    status.productsFile.size = stats.size;
                    status.productsFile.lastModified = stats.mtime.toISOString();
                } catch (error) {
                    logger.warn('Failed to stat products file', { error, productsFile });
                }
            }

            // Read summary if available
            if (await fs.pathExists(summaryFile)) {
                try {
                    status.summary = await fs.readJson(summaryFile);
                    status.lastConversion = status.summary?.conversion_summary?.timestamp || null;
                } catch (error) {
                    logger.warn('Failed to read conversion summary', { error, summaryFile });
                }
            }

            return status;
        } catch (error) {
            logger.error('Error getting conversion status', error);
            throw new AppError('Failed to get conversion status', 500);
        }
    }

    /**
     * Check if the data is fresh (converted recently)
     */
    public async isDataFresh(maxAgeHours: number = 24): Promise<boolean> {
        try {
            const status = await this.getConversionStatus();

            if (!status.lastConversion) {
                return false;
            }

            const lastConversionTime = new Date(status.lastConversion);
            const maxAge = maxAgeHours * 60 * 60 * 1000; // Convert to milliseconds
            const age = Date.now() - lastConversionTime.getTime();

            return age < maxAge;
        } catch (error) {
            logger.warn('Failed to check data freshness', error);
            return false;
        }
    }

    /**
     * Private helper methods
     */
    private async checkPythonAvailability(): Promise<void> {
        return new Promise((resolve, reject) => {
            const pythonCheck = spawn(this.pythonPath, ['--version'], { stdio: 'pipe' });

            pythonCheck.on('close', (code: number | null) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new AppError(`Python not found or invalid (exit code: ${code})`, 500));
                }
            });

            pythonCheck.on('error', (error: Error) => {
                reject(new AppError(`Python executable not found: ${error.message}`, 500));
            });
        });
    }

    private async readConversionSummary(): Promise<ConversionSummary | null> {
        const summaryPath = path.join(this.workingDir, 'conversion_summary.json');

        if (await fs.pathExists(summaryPath)) {
            return await fs.readJson(summaryPath) as ConversionSummary;
        }

        return null;
    }
}

export default PythonConverterService;