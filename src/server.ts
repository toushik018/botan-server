#!/usr/bin/env node

/**
 * Main server entry point for BotanBot Data API
 * 
 * This server provides:
 * - Automated FTP data synchronization
 * - XML to JSON data conversion (via Python script integration)
 * - RESTful API for AI consumption
 * - Scheduled job management
 * - Comprehensive logging and monitoring
 */

import { logger, config } from './utils';
import {
    DataAPIService,
    JobSchedulerService,
    PythonConverterService,
    FTPSyncService
} from './services';

/**
 * Main application class
 */
class BotanServerApp {
    private apiService: DataAPIService;
    private scheduler: JobSchedulerService;
    private converter: PythonConverterService;
    private ftpSync: FTPSyncService;
    private isShuttingDown: boolean = false;

    constructor() {
        this.apiService = new DataAPIService();
        this.scheduler = new JobSchedulerService();
        this.converter = new PythonConverterService();
        this.ftpSync = new FTPSyncService();
    }

    /**
     * Initialize and start all services
     */
    public async start(): Promise<void> {
        try {
            logger.info('Starting BotanBot Data Server...', {
                environment: config.get('nodeEnv'),
                version: require('../package.json').version
            });

            // Log configuration (sanitized)
            logger.info('Configuration loaded', config.getSanitizedConfig());

            // Validate environment
            await this.validateEnvironment();

            // Start API server
            await this.apiService.start();

            // START AUTOMATED SCHEDULER FOR VPS DEPLOYMENT
            // This will automatically sync FTP data according to the configured schedule
            logger.info('Starting automated job scheduler for VPS deployment...', {
                schedule: config.get('syncSchedule'),
                timezone: 'Local System Timezone (adapts to server location)'
            });
            this.scheduler.start();
            logger.info('✅ Automated FTP sync scheduler is now active');

            // Setup signal handlers for graceful shutdown
            this.setupSignalHandlers();

            logger.info('🚀 BotanBot Data Server started successfully', {
                serverInfo: this.apiService.getServerInfo(),
                schedulerStatus: this.scheduler.getSchedulerStatus(),
                automatedSync: {
                    enabled: true,
                    schedule: config.get('syncSchedule'),
                    description: 'Daily automated FTP sync and conversion'
                }
            });

            // Optional: Run initial data check
            await this.performInitialDataCheck();

        } catch (error) {
            logger.error('Failed to start BotanBot Data Server', error);
            await this.shutdown(1);
        }
    }

    /**
     * Graceful shutdown
     */
    public async shutdown(exitCode: number = 0): Promise<void> {
        if (this.isShuttingDown) {
            logger.warn('Shutdown already in progress...');
            return;
        }

        this.isShuttingDown = true;
        logger.info('Shutting down BotanBot Data Server...');

        try {
            // Stop scheduler first to prevent new jobs
            this.scheduler.stop();

            // Stop API server
            await this.apiService.stop();

            logger.info('BotanBot Data Server shutdown completed');
        } catch (error) {
            logger.error('Error during shutdown', error);
            exitCode = 1;
        }

        process.exit(exitCode);
    }

    /**
     * Validate environment and dependencies
     */
    private async validateEnvironment(): Promise<void> {
        logger.info('Validating environment...');

        try {
            // Validate Python environment
            await this.converter.validateEnvironment();
            logger.info('Python environment validation passed');

            // Test FTP connection if configured
            if (config.get('ftp').host && config.get('ftp').host !== 'localhost') {
                const testResult = await this.ftpSync.testConnection();
                if (testResult.success) {
                    logger.info('FTP connection test passed', testResult.details);
                } else {
                    logger.warn('FTP connection test failed', testResult);
                }
            } else {
                logger.info('FTP not configured, skipping connection test');
            }

            // Check data directories
            await this.validateDataDirectories();

        } catch (error) {
            logger.error('Environment validation failed', error);
            throw error;
        }
    }

    /**
     * Validate data directories exist
     */
    private async validateDataDirectories(): Promise<void> {
        const fs = require('fs-extra');
        const path = require('path');

        const directories = [
            config.get('dataSourcePath'),
            config.get('dataOutputPath'),
            path.dirname(config.get('logFile'))
        ];

        for (const dir of directories) {
            await fs.ensureDir(dir);
            logger.debug(`Ensured directory exists: ${dir}`);
        }
    }

    /**
     * Setup signal handlers for graceful shutdown
     */
    private setupSignalHandlers(): void {
        const signals = ['SIGTERM', 'SIGINT', 'SIGQUIT'];

        signals.forEach((signal) => {
            process.on(signal, () => {
                logger.info(`Received ${signal}, initiating graceful shutdown...`);
                this.shutdown(0);
            });
        });

        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            logger.error('Uncaught exception', error);
            this.shutdown(1);
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled promise rejection', { reason, promise });
            this.shutdown(1);
        });
    }

    /**
     * Perform initial data check and optionally run conversion
     */
    private async performInitialDataCheck(): Promise<void> {
        try {
            logger.info('Performing initial data check...');

            const status = await this.converter.getConversionStatus();

            if (!status.productsFile.exists || !status.dataDirectory.exists) {
                logger.warn('No converted data found, consider running initial conversion');
            } else {
                logger.info('Converted data found', {
                    clientFiles: status.dataDirectory.fileCount,
                    productsFileSize: status.productsFile.size,
                    lastConversion: status.lastConversion
                });

                // Check if data is fresh
                const isDataFresh = await this.converter.isDataFresh(24);
                if (!isDataFresh) {
                    logger.warn('Data is older than 24 hours, consider running sync');
                }
            }

        } catch (error) {
            logger.warn('Initial data check failed', error);
        }
    }

    /**
     * Get application status
     */
    public getStatus(): any {
        return {
            server: this.apiService.getServerInfo(),
            scheduler: this.scheduler.getSchedulerStatus(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            isShuttingDown: this.isShuttingDown
        };
    }
}

/**
 * CLI command handling
 */
async function handleCLICommands(): Promise<boolean> {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        return false; // No commands, start normally
    }

    const command = args[0];
    const app = new BotanServerApp();

    try {
        switch (command) {
            case 'sync':
                logger.info('Running FTP sync...');
                const ftpSync = new FTPSyncService();
                await ftpSync.syncAll();
                logger.info('FTP sync completed');
                process.exit(0);
                break;

            case 'convert':
                logger.info('Running data conversion...');
                const converter = new PythonConverterService();
                await converter.runConversion();
                logger.info('Data conversion completed');
                process.exit(0);
                break;

            case 'sync-and-convert':
                logger.info('Running full sync and conversion...');
                const scheduler = new JobSchedulerService();
                await scheduler.runFullDataSync();
                logger.info('Full sync and conversion completed');
                process.exit(0);
                break;

            case 'test-ftp':
                logger.info('Testing FTP connection...');
                const ftp = new FTPSyncService();
                const result = await ftp.testConnection();
                logger.info('FTP test result', result);
                process.exit(result.success ? 0 : 1);
                break;

            case 'status':
                logger.info('Checking system status...');
                const conv = new PythonConverterService();
                const status = await conv.getConversionStatus();
                console.log(JSON.stringify(status, null, 2));
                process.exit(0);
                break;

            default:
                console.log(`
BotanBot Data Server CLI

Usage: npm run <command>

Commands:
  start                 Start the server (default)
  sync                 Run FTP synchronization only
  convert              Run data conversion only  
  sync-and-convert     Run full sync and conversion
  test-ftp             Test FTP connection
  status               Check system status

Examples:
  npm start            # Start the server
  npm run sync         # Sync data from FTP
  npm run convert      # Convert XML to JSON
        `);
                process.exit(0);
        }
    } catch (error) {
        logger.error(`Command '${command}' failed`, error);
        process.exit(1);
    }

    return true;
}

/**
 * Main execution
 */
async function main(): Promise<void> {
    try {
        // Handle CLI commands
        const isCliCommand = await handleCLICommands();
        if (isCliCommand) {
            return; // CLI command was executed
        }

        // Start the server normally
        const app = new BotanServerApp();
        await app.start();

    } catch (error) {
        logger.error('Application startup failed', error);
        process.exit(1);
    }
}

// Start the application
if (require.main === module) {
    main();
}

export default BotanServerApp;