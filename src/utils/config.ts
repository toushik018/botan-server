import dotenv from 'dotenv';
import { AppConfig, FTPConfig } from '../types';

// Load environment variables
dotenv.config();

/**
 * Configuration utility with type safety and validation
 */
class ConfigManager {
    private static instance: ConfigManager;
    private config: AppConfig;

    private constructor() {
        this.config = this.loadConfig();
        this.validateConfig();
    }

    public static getInstance(): ConfigManager {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager();
        }
        return ConfigManager.instance;
    }

    private loadConfig(): AppConfig {
        return {
            nodeEnv: process.env.NODE_ENV || 'development',
            port: parseInt(process.env.PORT || '3000', 10),

            ftp: {
                host: process.env.FTP_HOST || 'localhost',
                port: parseInt(process.env.FTP_PORT || '21', 10),
                user: process.env.FTP_USER || '',
                password: process.env.FTP_PASS || '',
                secure: process.env.FTP_SECURE === 'true',
                secureOptions: {
                    rejectUnauthorized: false // Accept self-signed certificates
                },
                connTimeout: 60000, // 60 seconds connection timeout
                pasvTimeout: 60000, // 60 seconds passive timeout
                keepalive: 10000    // 10 seconds keepalive
            },

            dataSourcePath: process.env.DATA_SOURCE_PATH || './susko.ai',
            dataOutputPath: process.env.DATA_OUTPUT_PATH || './data',
            productsOutputPath: process.env.PRODUCTS_OUTPUT_PATH || './products.json',

            syncSchedule: process.env.SYNC_SCHEDULE || '0 2 * * *',

            apiPrefix: process.env.API_PREFIX || '/api/v1',
            maxFileSize: process.env.MAX_FILE_SIZE || '50mb',
            corsOrigin: process.env.CORS_ORIGIN || '*',

            logLevel: process.env.LOG_LEVEL || 'info',
            logFile: process.env.LOG_FILE || './logs/app.log'
        };
    }

    private validateConfig(): void {
        const requiredFields: (keyof AppConfig)[] = [
            'port', 'dataSourcePath', 'dataOutputPath', 'productsOutputPath'
        ];

        for (const field of requiredFields) {
            if (!this.config[field]) {
                throw new Error(`Missing required configuration: ${field}`);
            }
        }

        // Validate port
        if (this.config.port < 1 || this.config.port > 65535) {
            throw new Error('Port must be between 1 and 65535');
        }

        // Validate FTP configuration if provided
        if (this.config.ftp.host && this.config.ftp.host !== 'localhost') {
            if (!this.config.ftp.user || !this.config.ftp.password) {
                console.warn('FTP credentials not provided - FTP sync will be disabled');
            }
        }
    }

    public get<K extends keyof AppConfig>(key: K): AppConfig[K] {
        return this.config[key];
    }

    public getAll(): AppConfig {
        return { ...this.config };
    }

    public getFTPConfig(): FTPConfig {
        return { ...this.config.ftp };
    }

    public isDevelopment(): boolean {
        return this.config.nodeEnv === 'development';
    }

    public isProduction(): boolean {
        return this.config.nodeEnv === 'production';
    }

    public isTest(): boolean {
        return this.config.nodeEnv === 'test';
    }

    /**
     * Update configuration at runtime (useful for testing)
     */
    public update(updates: Partial<AppConfig>): void {
        this.config = { ...this.config, ...updates };
        this.validateConfig();
    }

    /**
     * Get sanitized config for logging (removes sensitive data)
     */
    public getSanitizedConfig(): Partial<AppConfig> {
        const sanitized = { ...this.config };

        // Remove sensitive information
        sanitized.ftp = {
            ...sanitized.ftp,
            password: sanitized.ftp.password ? '***REDACTED***' : ''
        };

        return sanitized;
    }
}

// Export singleton instance
export const config = ConfigManager.getInstance();
export default config;