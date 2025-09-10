import FTP from 'ftp';
import path from 'path';
import fs from 'fs-extra';
import { logger, config } from '../utils';
import {
    FTPConfig,
    FTPSyncResult,
    FTPSyncStats,
    FTPFileInfo,
    AppError
} from '../types';

/**
 * Enhanced FTP Sync Service with TypeScript and improved error handling
 */
export class FTPSyncService {
    private readonly ftpConfig: FTPConfig;
    private readonly localPath: string;
    private readonly remotePath: string;
    private client: FTP;
    private isConnected: boolean = false;

    constructor(options: {
        ftpConfig?: FTPConfig;
        localPath?: string;
        remotePath?: string;
    } = {}) {
        this.ftpConfig = options.ftpConfig || config.getFTPConfig();
        this.localPath = options.localPath || path.join(process.cwd(), 'data');
        this.remotePath = options.remotePath || config.get('dataSourcePath');
        this.client = new FTP();
    }

    /**
     * Connect to FTP server with enhanced error handling
     */
    public async connect(): Promise<void> {
        if (this.isConnected) {
            logger.debug('FTP already connected');
            return;
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new AppError('FTP connection timeout', 500));
            }, 30000); // 30 seconds timeout

            this.client.on('ready', () => {
                clearTimeout(timeout);
                this.isConnected = true;
                logger.info('FTP connection established', {
                    host: this.ftpConfig.host,
                    port: this.ftpConfig.port,
                    user: this.ftpConfig.user
                });
                resolve();
            });

            this.client.on('error', (err: Error) => {
                clearTimeout(timeout);
                this.isConnected = false;
                logger.error('FTP connection error', err);
                reject(new AppError(`FTP connection failed: ${err.message}`, 500));
            });

            this.client.on('close', () => {
                this.isConnected = false;
                logger.debug('FTP connection closed');
            });

            try {
                // Enhanced FTP connection options for better compatibility and large file handling
                const connectionOptions = {
                    ...this.ftpConfig,
                    // Force passive mode for better firewall compatibility
                    passive: true,
                    // Increase timeouts significantly for large file operations
                    connTimeout: this.ftpConfig.connTimeout || 120000, // 2 minutes
                    pasvTimeout: this.ftpConfig.pasvTimeout || 120000, // 2 minutes
                    keepalive: this.ftpConfig.keepalive || 30000, // 30 seconds
                    // FIX CHARACTER ENCODING: Properly handle German umlauts and special characters
                    // This prevents filename corruption like Ü → Ã → ÃÂÃÂ
                    encoding: 'utf8',
                    // Add secure options if using FTPS
                    ...(this.ftpConfig.secure && {
                        secureOptions: this.ftpConfig.secureOptions || {
                            rejectUnauthorized: false
                        }
                    })
                };

                logger.debug('Connecting to FTP with options', {
                    host: connectionOptions.host,
                    port: connectionOptions.port,
                    secure: connectionOptions.secure,
                    passive: connectionOptions.passive
                });

                this.client.connect(connectionOptions);
            } catch (error) {
                clearTimeout(timeout);
                reject(new AppError(`Failed to initiate FTP connection: ${error}`, 500));
            }
        });
    }

    /**
     * Disconnect from FTP server
     */
    public disconnect(): void {
        if (this.isConnected) {
            this.client.end();
            this.isConnected = false;
            logger.info('FTP connection closed');
        }
    }

    /**
     * Download a file from FTP server with enhanced timeout and error handling
     */
    public async downloadFile(remotePath: string, localPath: string): Promise<void> {
        if (!this.isConnected) {
            throw new AppError('FTP not connected', 500);
        }

        return new Promise((resolve, reject) => {
            // Set a reasonable timeout for individual file downloads
            let downloadTimeout: NodeJS.Timeout | null = setTimeout(() => {
                reject(new AppError(`Download timeout for ${remotePath} (30s exceeded)`, 500));
            }, 30000); // 30 seconds per file

            // Ensure local directory exists
            fs.ensureDirSync(path.dirname(localPath));

            this.client.get(remotePath, (err, stream) => {
                if (err) {
                    if (downloadTimeout) {
                        clearTimeout(downloadTimeout);
                    }
                    // Enhanced error message for data connection issues
                    let errorMessage = err.message;
                    if (err.message.includes('Unable to make data connection')) {
                        errorMessage += ' (Try: Check firewall/NAT settings, verify PASV mode support)';
                    }
                    logger.error(`Failed to download ${remotePath}`, err);
                    reject(new AppError(`Failed to download ${remotePath}: ${errorMessage}`, 500));
                    return;
                }

                const writeStream = fs.createWriteStream(localPath);
                let downloadedBytes = 0;
                let lastProgressTime = Date.now();

                stream.on('data', (chunk: Buffer) => {
                    downloadedBytes += chunk.length;

                    // Reset timeout on data received (active download)
                    if (downloadTimeout) {
                        clearTimeout(downloadTimeout);
                    }
                    downloadTimeout = setTimeout(() => {
                        if ('destroy' in stream && typeof stream.destroy === 'function') {
                            stream.destroy();
                        }
                        if ('destroy' in writeStream && typeof writeStream.destroy === 'function') {
                            writeStream.destroy();
                        }
                        reject(new AppError(`Download stalled for ${remotePath}`, 500));
                    }, 30000);
                });

                stream.pipe(writeStream);

                stream.on('close', () => {
                    if (downloadTimeout) {
                        clearTimeout(downloadTimeout);
                    }
                    logger.debug(`Downloaded: ${remotePath} -> ${localPath}`, {
                        size: downloadedBytes,
                        remotePath,
                        localPath
                    });
                    resolve();
                });

                stream.on('error', (streamErr: Error) => {
                    if (downloadTimeout) {
                        clearTimeout(downloadTimeout);
                    }
                    logger.error(`Stream error for ${remotePath}`, streamErr);

                    // Clean up partial file on error
                    try {
                        fs.removeSync(localPath);
                    } catch { }

                    reject(new AppError(`Download stream error: ${streamErr.message}`, 500));
                });

                writeStream.on('error', (writeErr: Error) => {
                    if (downloadTimeout) {
                        clearTimeout(downloadTimeout);
                    }
                    logger.error(`Write error for ${localPath}`, writeErr);

                    // Clean up partial file on error
                    try {
                        fs.removeSync(localPath);
                    } catch { }

                    reject(new AppError(`File write error: ${writeErr.message}`, 500));
                });
            });
        });
    }

    /**
     * List files in a remote directory with enhanced metadata
     */
    public async listFiles(remotePath: string): Promise<FTP.ListingElement[]> {
        if (!this.isConnected) {
            throw new AppError('FTP not connected', 500);
        }

        return new Promise((resolve, reject) => {
            this.client.list(remotePath, (err, list) => {
                if (err) {
                    logger.error(`Failed to list directory ${remotePath}`, err);
                    reject(new AppError(`Failed to list directory ${remotePath}: ${err.message}`, 500));
                } else {
                    logger.debug(`Listed ${list?.length || 0} items in ${remotePath}`);
                    resolve(list || []);
                }
            });
        });
    }

    /**
     * Sync a directory from FTP server with intelligent file comparison and ultra-robust handling
     */
    public async syncDirectory(remoteDir: string, localDir: string): Promise<FTPSyncStats> {
        const stats: FTPSyncStats = {
            downloaded: 0,
            skipped: 0,
            errors: 0,
            files: []
        };

        try {
            logger.info(`Syncing directory: ${remoteDir} -> ${localDir}`);

            // Ensure local directory exists
            await fs.ensureDir(localDir);

            // List remote files with retry mechanism
            const remoteFiles = await this.listFilesWithRetry(remoteDir);
            const regularFiles = remoteFiles.filter(file => file.type === '-');

            logger.info(`Found ${regularFiles.length} files to process in ${remoteDir}`);

            if (regularFiles.length === 0) {
                logger.info(`No files to sync in ${remoteDir}`);
                return stats;
            }

            // SPEED OPTIMIZATION: Larger batch size for faster processing
            const batchSize = 20; // Increased from 5 to 20 for much faster processing
            const batches = this.chunkArray(regularFiles, batchSize);

            logger.info(`Processing ${batches.length} batches of ${batchSize} files each`);

            // Connection refresh counter to prevent stale connections
            let batchesSinceRefresh = 0;
            const REFRESH_EVERY_BATCHES = 100; // Increased from 50 to 100 for fewer interruptions

            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];

                // Periodic connection refresh for ultra-long operations
                if (batchesSinceRefresh >= REFRESH_EVERY_BATCHES) {
                    logger.info(`Refreshing FTP connection (processed ${batchesSinceRefresh} batches)`);
                    try {
                        this.disconnect();
                        await new Promise(resolve => setTimeout(resolve, 1000)); // Brief pause
                        await this.connect();
                        batchesSinceRefresh = 0;
                    } catch (refreshError) {
                        logger.error('Failed to refresh connection, continuing with existing...', refreshError);
                    }
                }

                // Connection health check before each batch
                if (!this.isConnected) {
                    logger.warn('FTP connection lost, reconnecting...');
                    await this.connectWithRetry();
                }

                logger.debug(`Processing batch ${i + 1}/${batches.length} (${batch.length} files)`);

                // Process files sequentially within each batch
                for (const file of batch) {
                    const maxRetries = 3;
                    let attempt = 0;
                    let success = false;

                    while (!success && attempt < maxRetries) {
                        try {
                            await this.processFileWithRetry(file, remoteDir, localDir, stats);
                            success = true;

                        } catch (error) {
                            attempt++;
                            logger.error(`Error processing file ${file.name} (attempt ${attempt}/${maxRetries})`, error);

                            if (attempt >= maxRetries) {
                                stats.errors++;
                                logger.error(`Failed to process ${file.name} after ${maxRetries} attempts`);
                            } else {
                                // SPEED OPTIMIZATION: Faster progressive backoff
                                const delay = Math.min(500 * Math.pow(1.5, attempt - 1), 2000); // Faster retry
                                logger.info(`Retrying ${file.name} in ${delay}ms...`);
                                await new Promise(resolve => setTimeout(resolve, delay));

                                // Try to reconnect on connection errors
                                const errorMessage = (error as Error)?.message || '';
                                if (errorMessage.includes('connection') || errorMessage.includes('timeout')) {
                                    await this.connectWithRetry();
                                }
                            }
                        }
                    }

                    // SPEED OPTIMIZATION: Minimal delay between files
                    await new Promise(resolve => setTimeout(resolve, 50)); // Reduced from 100ms to 50ms
                }

                batchesSinceRefresh++;

                // SPEED OPTIMIZATION: Less frequent progress reporting to reduce logging overhead
                if ((i + 1) % 15 === 0 || i === 0) {
                    const progress = Math.round(((i + 1) / batches.length) * 100);
                    const remainingBatches = batches.length - (i + 1);
                    const estimatedTimeRemaining = remainingBatches * 0.5; // Optimized faster estimate

                    logger.info(`Sync progress: ${progress}% (${i + 1}/${batches.length} batches, ~${Math.round(estimatedTimeRemaining)}s remaining)`, {
                        downloaded: stats.downloaded,
                        skipped: stats.skipped,
                        errors: stats.errors,
                        currentFile: batch[0]?.name || 'N/A'
                    });
                }

                // Adaptive delay between batches based on error rate
                if (i < batches.length - 1) {
                    const errorRate = stats.errors / Math.max(stats.downloaded + stats.skipped + stats.errors, 1);
                    const baseDelay = 200; // SPEED OPTIMIZATION: Reduced from 1000ms to 200ms
                    const adaptiveDelay = errorRate > 0.1 ? baseDelay * 3 : baseDelay; // Faster recovery

                    await new Promise(resolve => setTimeout(resolve, adaptiveDelay));
                }
            }

            logger.info(`Directory sync completed: ${remoteDir}`, {
                downloaded: stats.downloaded,
                skipped: stats.skipped,
                errors: stats.errors,
                totalFiles: regularFiles.length
            });

            return stats;

        } catch (error) {
            logger.error(`Failed to sync directory ${remoteDir}`, error);
            throw new AppError(`Directory sync failed: ${error}`, 500);
        }
    }

    /**
     * Sync all required directories with comprehensive statistics
     */
    public async syncAll(): Promise<FTPSyncResult> {
        const startTime = new Date();

        const result: FTPSyncResult = {
            adressen: { downloaded: 0, skipped: 0, errors: 0, files: [] },
            artikel: { downloaded: 0, skipped: 0, errors: 0, files: [] },
            history: { downloaded: 0, skipped: 0, errors: 0, files: [] },
            totalDownloaded: 0,
            totalSkipped: 0,
            totalErrors: 0,
            startTime,
            endTime: null,
            duration: null
        };

        try {
            logger.info('Starting complete FTP synchronization...');
            await this.connect();

            // Sync Adressen (Client addresses)
            result.adressen = await this.syncDirectory(
                `${this.remotePath}/Adressen`,
                path.join(this.localPath, 'Adressen')
            );

            // Sync Artikel (Products)
            result.artikel = await this.syncDirectory(
                `${this.remotePath}/Artikel`,
                path.join(this.localPath, 'Artikel')
            );

            // Sync History (Order history)
            result.history = await this.syncDirectory(
                `${this.remotePath}/History`,
                path.join(this.localPath, 'History')
            );

            // Calculate totals
            result.totalDownloaded = result.adressen.downloaded + result.artikel.downloaded + result.history.downloaded;
            result.totalSkipped = result.adressen.skipped + result.artikel.skipped + result.history.skipped;
            result.totalErrors = result.adressen.errors + result.artikel.errors + result.history.errors;

            result.endTime = new Date();
            result.duration = result.endTime.getTime() - result.startTime.getTime();

            logger.info('Complete FTP sync finished', {
                totalDownloaded: result.totalDownloaded,
                totalSkipped: result.totalSkipped,
                totalErrors: result.totalErrors,
                duration: `${result.duration}ms`
            });

            if (result.totalErrors > 0) {
                logger.warn(`FTP sync completed with ${result.totalErrors} errors`);
            }

            return result;

        } catch (error) {
            result.endTime = new Date();
            result.duration = result.endTime.getTime() - result.startTime.getTime();

            logger.error('FTP sync failed', error);
            throw error;
        } finally {
            this.disconnect();
        }
    }

    /**
     * Test FTP connection and permissions
     */
    public async testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
        try {
            logger.info('Testing FTP connection...');

            await this.connect();

            // Try to list the root directory
            const files = await this.listFiles(this.remotePath || '/');

            const testResult = {
                success: true,
                message: `FTP connection successful. Found ${files.length} items in remote directory.`,
                details: {
                    host: this.ftpConfig.host,
                    port: this.ftpConfig.port,
                    remotePath: this.remotePath,
                    itemCount: files.length,
                    items: files.slice(0, 5).map(f => ({ name: f.name, type: f.type, size: f.size }))
                }
            };

            logger.info('FTP connection test passed', testResult.details);

            return testResult;
        } catch (error) {
            const errorResult = {
                success: false,
                message: `FTP connection test failed: ${error instanceof Error ? error.message : error}`,
                details: {
                    host: this.ftpConfig.host,
                    port: this.ftpConfig.port,
                    error: error instanceof Error ? error.message : String(error)
                }
            };

            logger.error('FTP connection test failed', errorResult.details);
            return errorResult;
        } finally {
            this.disconnect();
        }
    }

    /**
     * Get sync statistics from the last operation
     */
    public async getSyncHistory(): Promise<any[]> {
        // This could be expanded to read from a sync history file
        // For now, return empty array
        return [];
    }

    /**
     * Sanitize filename to handle character encoding issues
     */
    private sanitizeFilename(filename: string): string {
        // Handle common character encoding issues with German umlauts
        let sanitized = filename;

        // Fix double-encoded characters like ÃÂÃÂ back to proper umlauts
        const encodingFixes = {
            // Common double-encoding patterns to fix
            'ÃÂÃÂ': 'Ü',     // ÃÂÃÂ → Ü
            'ÃÂÃ¤': 'ä',     // ÃÂä → ä
            'ÃÂÃ¶': 'ö',     // ÃÂö → ö
            'ÃÂÃ¼': 'ü',     // ÃÂü → ü
            'ÃÂÃ': 'ß',     // ÃÂß → ß
            // Single encoding fixes
            'Ã': 'Ü',           // ÃÐ → Ü  
            'Ã': 'Ä',           // ÃÄ → Ä
            'Ã': 'Ö',           // ÃÖ → Ö
            'Ã': 'Ü',           // ÃÜ → Ü
            'Ã¤': 'ä',           // Ãä → ä
            'Ã¶': 'ö',           // Ãö → ö
            'Ã¼': 'ü',           // Ãü → ü
            'Ã': 'ß',           // Ãß → ß
        };

        // Apply encoding fixes
        for (const [encoded, correct] of Object.entries(encodingFixes)) {
            sanitized = sanitized.replace(new RegExp(encoded, 'g'), correct);
        }

        return sanitized;
    }

    /**
     * Process a single file with intelligent change detection and retry mechanism
     */
    private async processFileWithRetry(
        file: FTP.ListingElement,
        remoteDir: string,
        localDir: string,
        stats: FTPSyncStats
    ): Promise<void> {
        // ENCODING FIX: Sanitize filename to handle character encoding corruption
        const originalFilename = file.name;
        const sanitizedFilename = this.sanitizeFilename(originalFilename);

        const remotePath = `${remoteDir}/${originalFilename}`; // Use original for FTP server
        const localPath = path.join(localDir, sanitizedFilename); // Use sanitized for local storage

        // Log encoding corrections if applied
        if (originalFilename !== sanitizedFilename) {
            logger.info(`Filename encoding corrected: '${originalFilename}' → '${sanitizedFilename}'`);
        }

        // Intelligent file comparison - check if file needs updating
        let shouldDownload = true;
        let reason = 'new file';

        if (await fs.pathExists(localPath)) {
            try {
                const localStats = await fs.stat(localPath);
                const remoteTime = new Date(file.date);
                const localTime = localStats.mtime;
                const remoteSize = file.size || 0;
                const localSize = localStats.size;

                // Enhanced intelligent comparison with tolerance for encoding differences
                const sizeDifference = Math.abs(localSize - remoteSize);
                const sizeTolerancePercent = 0.02; // 2% tolerance for encoding differences
                const sizeToleranceBytes = Math.max(10, Math.round(remoteSize * sizeTolerancePercent)); // At least 10 bytes tolerance
                const sizesAreClose = sizeDifference <= sizeToleranceBytes;

                if (localTime >= remoteTime && (localSize === remoteSize || sizesAreClose) && localSize > 0) {
                    shouldDownload = false;
                    reason = sizesAreClose && localSize !== remoteSize ?
                        `unchanged (size within tolerance: diff=${sizeDifference} bytes)` :
                        'unchanged (same time and size)';
                } else if (localTime < remoteTime) {
                    reason = 'newer version available';
                } else if (!sizesAreClose) {
                    reason = `size difference detected (local: ${localSize}, remote: ${remoteSize}, diff: ${sizeDifference})`;
                } else {
                    reason = 'file verification needed';
                }

                // DETAILED DEBUGGING: Log size comparison for troubleshooting
                if (shouldDownload) {
                    logger.info(`File comparison details for ${sanitizedFilename}:`, {
                        originalName: originalFilename,
                        sanitizedName: sanitizedFilename,
                        localTime: localTime.toISOString(),
                        remoteTime: remoteTime.toISOString(),
                        localSize,
                        remoteSize,
                        sizeDifference: localSize - remoteSize,
                        willDownload: shouldDownload,
                        reason
                    });
                }

                // Only log debug for files we're skipping to reduce log noise
                if (!shouldDownload) {
                    logger.debug(`File ${sanitizedFilename}: ${reason}`);
                }

            } catch (error) {
                logger.warn(`Failed to check local file stats for ${sanitizedFilename}`, error);
                reason = 'stat check failed - re-downloading';
                shouldDownload = true;
            }
        }

        if (shouldDownload) {
            logger.info(`Downloading ${sanitizedFilename} (${reason})`);
            await this.downloadFileWithRetry(remotePath, localPath);
            stats.downloaded++;

            const fileInfo: FTPFileInfo = {
                name: sanitizedFilename, // Use sanitized name in stats
                size: file.size || 0,
                localPath,
                remotePath
            };

            stats.files.push(fileInfo);
        } else {
            stats.skipped++;
        }
    }

    /**
     * Download file with retry mechanism and encoding fallback
     */
    private async downloadFileWithRetry(remotePath: string, localPath: string, maxRetries: number = 3): Promise<void> {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await this.downloadFile(remotePath, localPath);
                return; // Success
            } catch (error) {
                lastError = error as Error;
                const errorMessage = (error as Error)?.message || '';

                // ENCODING FIX: If we get "No such file or directory" error, 
                // it might be a character encoding issue - try alternative encodings
                if (errorMessage.includes('No such file or directory') && attempt === 1) {
                    logger.warn(`File not found error for ${remotePath}, trying encoding alternatives...`);

                    // Extract filename from path
                    const pathParts = remotePath.split('/');
                    const filename = pathParts[pathParts.length - 1];
                    const basePath = pathParts.slice(0, -1).join('/');

                    // Try different encoding interpretations
                    const alternativeFilenames = this.generateFilenameAlternatives(filename);

                    for (const altFilename of alternativeFilenames) {
                        const altRemotePath = `${basePath}/${altFilename}`;
                        try {
                            logger.info(`Trying alternative filename: ${altFilename}`);
                            await this.downloadFile(altRemotePath, localPath);
                            logger.info(`Success with alternative filename: ${altFilename}`);
                            return; // Success with alternative
                        } catch (altError) {
                            logger.debug(`Alternative filename ${altFilename} also failed`);
                        }
                    }
                }

                logger.warn(`Download attempt ${attempt}/${maxRetries} failed for ${remotePath}`, error);

                if (attempt < maxRetries) {
                    // SPEED OPTIMIZATION: Faster progressive backoff delay
                    const delay = Math.min(500 * Math.pow(1.5, attempt - 1), 1500); // Faster retry
                    await new Promise(resolve => setTimeout(resolve, delay));

                    // Try to reconnect on connection errors
                    if (errorMessage.includes('connection') || errorMessage.includes('timeout')) {
                        await this.connectWithRetry();
                    }
                }
            }
        }

        throw lastError || new Error(`Failed to download ${remotePath} after ${maxRetries} attempts`);
    }

    /**
     * Generate alternative filename encodings to try when original fails
     */
    private generateFilenameAlternatives(filename: string): string[] {
        const alternatives: string[] = [];

        // Common encoding transformations that might occur
        const encodingMappings = [
            // Try converting known problematic sequences back to original
            { from: /Ã/g, to: 'Ü' },     // Ã -> Ü
            { from: /Ã/g, to: 'Ä' },     // Ã -> Ä  
            { from: /Ã/g, to: 'Ö' },     // Ã -> Ö
            { from: /Ã/g, to: 'Ü' },     // Ã -> Ü
            { from: /Ã¤/g, to: 'ä' },     // Ã¤ -> ä
            { from: /Ã¶/g, to: 'ö' },     // Ã¶ -> ö
            { from: /Ã¼/g, to: 'ü' },     // Ã¼ -> ü
            { from: /Ã/g, to: 'ß' },     // Ã -> ß
        ];

        // Generate alternatives by applying different encoding fixes
        for (const mapping of encodingMappings) {
            const alternative = filename.replace(mapping.from, mapping.to);
            if (alternative !== filename && !alternatives.includes(alternative)) {
                alternatives.push(alternative);
            }
        }

        // Try URL encoding/decoding alternatives
        try {
            const urlDecoded = decodeURIComponent(filename);
            if (urlDecoded !== filename && !alternatives.includes(urlDecoded)) {
                alternatives.push(urlDecoded);
            }
        } catch (e) {
            // URL decoding failed, skip
        }

        return alternatives;
    }

    /**
     * List files with retry mechanism
     */
    private async listFilesWithRetry(remotePath: string, maxRetries: number = 3): Promise<FTP.ListingElement[]> {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await this.listFiles(remotePath);
            } catch (error) {
                lastError = error as Error;
                logger.warn(`List files attempt ${attempt}/${maxRetries} failed for ${remotePath}`, error);

                if (attempt < maxRetries) {
                    const delay = 500 * attempt; // SPEED OPTIMIZATION: Faster retry for file listing
                    await new Promise(resolve => setTimeout(resolve, delay));
                    await this.connectWithRetry();
                }
            }
        }

        throw lastError || new Error(`Failed to list files in ${remotePath} after ${maxRetries} attempts`);
    }

    /**
     * Connect with retry mechanism
     */
    private async connectWithRetry(maxRetries: number = 3): Promise<void> {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // Disconnect first to ensure clean state
                if (this.isConnected) {
                    this.disconnect();
                    await new Promise(resolve => setTimeout(resolve, 500)); // Brief pause
                }

                await this.connect();
                return; // Success
            } catch (error) {
                lastError = error as Error;
                logger.warn(`Connection attempt ${attempt}/${maxRetries} failed`, error);

                if (attempt < maxRetries) {
                    const delay = 1000 * attempt; // SPEED OPTIMIZATION: Faster connection retry
                    logger.info(`Retrying connection in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw lastError || new Error(`Failed to connect after ${maxRetries} attempts`);
    }

    private chunkArray<T>(array: T[], size: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }
}

export default FTPSyncService;