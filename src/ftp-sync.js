const FTP = require('ftp');
const path = require('path');
const fs = require('fs-extra');
const logger = require('./logger');

/**
 * FTP Sync Service
 * Handles automated downloading of XML data from FTP server
 */
class FTPSyncService {
    constructor(options = {}) {
        this.config = {
            host: options.host || process.env.FTP_HOST,
            port: options.port || process.env.FTP_PORT || 21,
            user: options.user || process.env.FTP_USER,
            password: options.password || process.env.FTP_PASS,
            secure: options.secure || process.env.FTP_SECURE === 'true'
        };

        this.localPath = options.localPath || path.join(process.cwd(), 'susko.ai');
        this.remotePath = options.remotePath || '/susko.ai';

        this.client = new FTP();
    }

    /**
     * Connect to FTP server
     * @returns {Promise<void>}
     */
    async connect() {
        return new Promise((resolve, reject) => {
            this.client.on('ready', () => {
                logger.info('FTP connection established');
                resolve();
            });

            this.client.on('error', (err) => {
                logger.error('FTP connection error:', err);
                reject(err);
            });

            this.client.connect(this.config);
        });
    }

    /**
     * Disconnect from FTP server
     */
    disconnect() {
        this.client.end();
        logger.info('FTP connection closed');
    }

    /**
     * Download a file from FTP server
     * @param {string} remotePath - Remote file path
     * @param {string} localPath - Local file path
     * @returns {Promise<void>}
     */
    async downloadFile(remotePath, localPath) {
        return new Promise((resolve, reject) => {
            // Ensure local directory exists
            fs.ensureDirSync(path.dirname(localPath));

            this.client.get(remotePath, (err, stream) => {
                if (err) {
                    logger.error(`Failed to download ${remotePath}:`, err);
                    reject(err);
                    return;
                }

                const writeStream = fs.createWriteStream(localPath);
                stream.pipe(writeStream);

                stream.on('close', () => {
                    logger.debug(`Downloaded: ${remotePath} -> ${localPath}`);
                    resolve();
                });

                stream.on('error', (streamErr) => {
                    logger.error(`Stream error for ${remotePath}:`, streamErr);
                    reject(streamErr);
                });

                writeStream.on('error', (writeErr) => {
                    logger.error(`Write error for ${localPath}:`, writeErr);
                    reject(writeErr);
                });
            });
        });
    }

    /**
     * List files in a remote directory
     * @param {string} remotePath - Remote directory path
     * @returns {Promise<Array>} List of files
     */
    async listFiles(remotePath) {
        return new Promise((resolve, reject) => {
            this.client.list(remotePath, (err, list) => {
                if (err) {
                    logger.error(`Failed to list directory ${remotePath}:`, err);
                    reject(err);
                } else {
                    resolve(list || []);
                }
            });
        });
    }

    /**
     * Sync a directory from FTP server
     * @param {string} remoteDir - Remote directory path
     * @param {string} localDir - Local directory path
     * @returns {Promise<Object>} Sync statistics
     */
    async syncDirectory(remoteDir, localDir) {
        const stats = {
            downloaded: 0,
            skipped: 0,
            errors: 0,
            files: []
        };

        try {
            logger.info(`Syncing directory: ${remoteDir} -> ${localDir}`);

            // Ensure local directory exists
            await fs.ensureDir(localDir);

            // List remote files
            const remoteFiles = await this.listFiles(remoteDir);

            for (const file of remoteFiles) {
                if (file.type === '-') { // Regular file
                    const remotePath = `${remoteDir}/${file.name}`;
                    const localPath = path.join(localDir, file.name);

                    try {
                        // Check if file exists and compare modification time
                        let shouldDownload = true;

                        if (await fs.pathExists(localPath)) {
                            const localStats = await fs.stat(localPath);
                            const remoteTime = new Date(file.date);

                            if (localStats.mtime >= remoteTime) {
                                shouldDownload = false;
                                stats.skipped++;
                                logger.debug(`Skipping ${file.name} (up to date)`);
                            }
                        }

                        if (shouldDownload) {
                            await this.downloadFile(remotePath, localPath);
                            stats.downloaded++;
                            stats.files.push({
                                name: file.name,
                                size: file.size,
                                localPath,
                                remotePath
                            });
                        }
                    } catch (error) {
                        logger.error(`Error downloading ${file.name}:`, error);
                        stats.errors++;
                    }
                }
            }

            logger.info(`Directory sync completed: ${stats.downloaded} downloaded, ${stats.skipped} skipped, ${stats.errors} errors`);
            return stats;

        } catch (error) {
            logger.error(`Failed to sync directory ${remoteDir}:`, error);
            throw error;
        }
    }

    /**
     * Sync all required directories
     * @returns {Promise<Object>} Complete sync statistics
     */
    async syncAll() {
        const totalStats = {
            adressen: null,
            artikel: null,
            history: null,
            totalDownloaded: 0,
            totalSkipped: 0,
            totalErrors: 0,
            startTime: new Date(),
            endTime: null,
            duration: null
        };

        try {
            await this.connect();

            // Sync Adressen (Client addresses)
            totalStats.adressen = await this.syncDirectory(
                `${this.remotePath}/Adressen`,
                path.join(this.localPath, 'Adressen')
            );

            // Sync Artikel (Products)
            totalStats.artikel = await this.syncDirectory(
                `${this.remotePath}/Artikel`,
                path.join(this.localPath, 'Artikel')
            );

            // Sync History (Order history)
            totalStats.history = await this.syncDirectory(
                `${this.remotePath}/History`,
                path.join(this.localPath, 'History')
            );

            // Calculate totals
            totalStats.totalDownloaded =
                totalStats.adressen.downloaded +
                totalStats.artikel.downloaded +
                totalStats.history.downloaded;

            totalStats.totalSkipped =
                totalStats.adressen.skipped +
                totalStats.artikel.skipped +
                totalStats.history.skipped;

            totalStats.totalErrors =
                totalStats.adressen.errors +
                totalStats.artikel.errors +
                totalStats.history.errors;

            totalStats.endTime = new Date();
            totalStats.duration = totalStats.endTime - totalStats.startTime;

            logger.info(`Complete FTP sync finished: ${totalStats.totalDownloaded} files downloaded in ${totalStats.duration}ms`);

            return totalStats;

        } catch (error) {
            logger.error('FTP sync failed:', error);
            throw error;
        } finally {
            this.disconnect();
        }
    }

    /**
     * Test FTP connection and permissions
     * @returns {Promise<boolean>} True if test passes
     */
    async testConnection() {
        try {
            await this.connect();

            // Try to list the root directory
            const files = await this.listFiles(this.remotePath || '/');
            logger.info(`FTP test successful. Found ${files.length} items in remote directory`);

            this.disconnect();
            return true;
        } catch (error) {
            logger.error('FTP connection test failed:', error);
            throw error;
        }
    }
}

module.exports = FTPSyncService;