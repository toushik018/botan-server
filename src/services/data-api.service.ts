import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { logger, config } from '../utils';
import {
    requestLogger,
    errorHandler,
    notFoundHandler,
    corsOptions
} from '../middleware';
import {
    productsRoutes,
    clientsRoutes,
    aiRoutes,
    systemRoutes
} from '../routes';
import { Server } from 'http';

// Extend Express Request interface
declare global {
    namespace Express {
        interface Request {
            id?: string;
        }
    }
}

/**
 * Enhanced Data API Service with TypeScript and comprehensive middleware
 */
export class DataAPIService {
    private app: Application;
    private server: Server | null = null;
    private readonly port: number;
    private readonly apiPrefix: string;

    constructor() {
        this.port = config.get('port');
        this.apiPrefix = config.get('apiPrefix');
        this.app = express();

        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    /**
     * Setup Express middleware with enhanced security and logging
     */
    private setupMiddleware(): void {
        // Trust proxy (for deployment behind reverse proxy)
        this.app.set('trust proxy', 1);

        // Security middleware
        this.app.use(helmet({
            contentSecurityPolicy: false, // Disable CSP for API
            crossOriginEmbedderPolicy: false
        }));

        // Compression
        this.app.use(compression());

        // CORS
        this.app.use(cors(corsOptions));

        // Body parsing
        this.app.use(express.json({
            limit: config.get('maxFileSize'),
            strict: true
        }));
        this.app.use(express.urlencoded({
            extended: true,
            limit: config.get('maxFileSize')
        }));

        // Request logging
        this.app.use(requestLogger);

        // Request ID for tracing
        this.app.use((req, res, next) => {
            req.id = Math.random().toString(36).substr(2, 9);
            res.setHeader('X-Request-ID', req.id);
            next();
        });

        logger.debug('Middleware setup completed');
    }

    /**
     * Setup API routes with proper prefixing
     */
    private setupRoutes(): void {
        // Root endpoint
        this.app.get('/', (req, res) => {
            res.json({
                service: 'BotanBot Data API',
                version: require('../../package.json').version,
                environment: config.get('nodeEnv'),
                endpoints: {
                    health: `${this.apiPrefix}/health`,
                    products: `${this.apiPrefix}/products`,
                    clients: `${this.apiPrefix}/clients/:clientNumber`,
                    ai: `${this.apiPrefix}/ai/client-context/:clientNumber`,
                    status: `${this.apiPrefix}/status`
                },
                documentation: 'See README for detailed API documentation',
                timestamp: new Date().toISOString()
            });
        });

        // API routes
        this.app.use(`${this.apiPrefix}/products`, productsRoutes);
        this.app.use(`${this.apiPrefix}/clients`, clientsRoutes);
        this.app.use(`${this.apiPrefix}/ai`, aiRoutes);
        this.app.use(`${this.apiPrefix}`, systemRoutes);

        logger.debug('Routes setup completed', { apiPrefix: this.apiPrefix });
    }

    /**
     * Setup error handling middleware
     */
    private setupErrorHandling(): void {
        // 404 handler (must be before error handler)
        this.app.use('*', notFoundHandler);

        // Global error handler (must be last)
        this.app.use(errorHandler);

        logger.debug('Error handling setup completed');
    }

    /**
     * Start the API server
     */
    public async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                // Bind to all interfaces (both IPv4 and IPv6)
                this.server = this.app.listen(this.port, '0.0.0.0', () => {
                    logger.info('Data API server started', {
                        port: this.port,
                        host: '0.0.0.0',
                        environment: config.get('nodeEnv'),
                        apiPrefix: this.apiPrefix,
                        urls: {
                            local: `http://localhost:${this.port}`,
                            api: `http://localhost:${this.port}${this.apiPrefix}`,
                            health: `http://localhost:${this.port}${this.apiPrefix}/health`
                        }
                    });
                    resolve();
                });

                // Handle server errors
                this.server.on('error', (error: Error) => {
                    logger.error('Server error', error);
                    reject(error);
                });

                // Graceful shutdown handling
                process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
                process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));

            } catch (error) {
                logger.error('Failed to start server', error);
                reject(error);
            }
        });
    }

    /**
     * Stop the API server
     */
    public async stop(): Promise<void> {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    logger.info('Data API server stopped');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    /**
     * Get the Express application instance
     */
    public getApp(): Application {
        return this.app;
    }

    /**
     * Get server information
     */
    public getServerInfo(): any {
        return {
            port: this.port,
            apiPrefix: this.apiPrefix,
            environment: config.get('nodeEnv'),
            isRunning: this.server !== null
        };
    }

    /**
     * Graceful shutdown handler
     */
    private async gracefulShutdown(signal: string): Promise<void> {
        logger.info(`Received ${signal}, starting graceful shutdown...`);

        try {
            // Stop accepting new connections
            await this.stop();

            // Give ongoing requests time to complete
            await new Promise(resolve => setTimeout(resolve, 5000));

            logger.info('Graceful shutdown completed');
            process.exit(0);
        } catch (error) {
            logger.error('Error during graceful shutdown', error);
            process.exit(1);
        }
    }
}

export default DataAPIService;