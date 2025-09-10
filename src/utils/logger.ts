import winston from 'winston';
import path from 'path';
import fs from 'fs-extra';
import config from './config';

/**
 * Enhanced logging utility with structured logging and multiple transports
 */
class Logger {
    private static instance: Logger;
    private logger: winston.Logger;

    private constructor() {
        this.setupLogging();
        this.logger = this.createLogger();
    }

    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    private setupLogging(): void {
        // Ensure logs directory exists
        const logDir = path.dirname(config.get('logFile'));
        fs.ensureDirSync(logDir);
    }

    private createLogger(): winston.Logger {
        const logFormat = winston.format.combine(
            winston.format.timestamp({
                format: 'YYYY-MM-DD HH:mm:ss'
            }),
            winston.format.errors({ stack: true }),
            winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
                const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
                return `${timestamp} [${service || 'botan-server'}] ${level.toUpperCase()}: ${message} ${metaStr}`;
            })
        );

        const transports: winston.transport[] = [
            // File transport for errors
            new winston.transports.File({
                filename: path.join(path.dirname(config.get('logFile')), 'error.log'),
                level: 'error',
                format: winston.format.combine(
                    winston.format.timestamp(),
                    winston.format.json()
                ),
                maxsize: 5242880, // 5MB
                maxFiles: 5
            }),

            // File transport for all logs
            new winston.transports.File({
                filename: config.get('logFile'),
                format: winston.format.combine(
                    winston.format.timestamp(),
                    winston.format.json()
                ),
                maxsize: 5242880, // 5MB
                maxFiles: 10
            })
        ];

        // Add console transport for non-production environments
        if (!config.isProduction()) {
            transports.push(
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        logFormat
                    )
                })
            );
        }

        return winston.createLogger({
            level: config.get('logLevel'),
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json()
            ),
            defaultMeta: {
                service: 'botan-server',
                environment: config.get('nodeEnv')
            },
            transports,
            exitOnError: false
        });
    }

    public info(message: string, meta?: any): void {
        this.logger.info(message, meta);
    }

    public error(message: string, error?: Error | any): void {
        if (error instanceof Error) {
            this.logger.error(message, {
                error: {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                }
            });
        } else {
            this.logger.error(message, { error });
        }
    }

    public warn(message: string, meta?: any): void {
        this.logger.warn(message, meta);
    }

    public debug(message: string, meta?: any): void {
        this.logger.debug(message, meta);
    }

    public verbose(message: string, meta?: any): void {
        this.logger.verbose(message, meta);
    }

    /**
     * Log HTTP requests
     */
    public logRequest(req: any, res: any, duration?: number): void {
        const logData = {
            method: req.method,
            url: req.originalUrl || req.url,
            ip: req.ip || req.connection?.remoteAddress,
            userAgent: req.get('User-Agent'),
            statusCode: res.statusCode,
            duration: duration ? `${duration}ms` : undefined
        };

        if (res.statusCode >= 400) {
            this.error('HTTP Request Error', logData);
        } else {
            this.info('HTTP Request', logData);
        }
    }

    /**
     * Log job execution
     */
    public logJobStart(jobId: string, jobType: string): void {
        this.info(`Job started: ${jobType}`, { jobId, jobType });
    }

    public logJobComplete(jobId: string, jobType: string, duration: number): void {
        this.info(`Job completed: ${jobType}`, {
            jobId,
            jobType,
            duration: `${duration}ms`
        });
    }

    public logJobError(jobId: string, jobType: string, error: Error): void {
        this.error(`Job failed: ${jobType}`, {
            jobId,
            jobType,
            error: {
                message: error.message,
                stack: error.stack
            }
        });
    }

    /**
     * Log system metrics
     */
    public logMetrics(metrics: Record<string, any>): void {
        this.info('System metrics', { metrics });
    }

    /**
     * Create a child logger with additional context
     */
    public child(meta: Record<string, any>): winston.Logger {
        return this.logger.child(meta);
    }

    /**
     * Get the underlying Winston logger
     */
    public getWinstonLogger(): winston.Logger {
        return this.logger;
    }
}

// Export singleton instance
export const logger = Logger.getInstance();
export default logger;