import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs-extra';
import { logger, config } from '../utils';
import { validateRequest } from '../middleware';
import { statusQuerySchema } from './validation.schemas';
import {
    ApiResponse,
    SystemStatus,
    AppError
} from '../types';

const router = Router();

/**
 * System and health monitoring routes
 */

// Health check endpoint
router.get(
    '/health',
    async (req: Request, res: Response): Promise<void> => {
        const response: ApiResponse<any> = {
            success: true,
            data: {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                version: require('../../package.json').version,
                environment: config.get('nodeEnv'),
                memory: process.memoryUsage()
            },
            timestamp: new Date().toISOString()
        };

        res.json(response);
    }
);

// System status endpoint
router.get(
    '/status',
    validateRequest({ query: statusQuerySchema }),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { detailed } = req.query as any;

            const status = await getSystemStatus(detailed);

            const response: ApiResponse<SystemStatus> = {
                success: true,
                data: status,
                timestamp: new Date().toISOString()
            };

            res.json(response);
        } catch (error) {
            next(error);
        }
    }
);

// Configuration endpoint (sanitized)
router.get(
    '/config',
    async (req: Request, res: Response): Promise<void> => {
        const sanitizedConfig = config.getSanitizedConfig();

        const response: ApiResponse<any> = {
            success: true,
            data: sanitizedConfig,
            timestamp: new Date().toISOString()
        };

        res.json(response);
    }
);

// Metrics endpoint
router.get(
    '/metrics',
    async (req: Request, res: Response): Promise<void> => {
        const metrics = {
            process: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                cpu: process.cpuUsage(),
                pid: process.pid,
                platform: process.platform,
                version: process.version
            },
            system: {
                loadavg: require('os').loadavg(),
                freemem: require('os').freemem(),
                totalmem: require('os').totalmem(),
                cpus: require('os').cpus().length
            },
            timestamp: new Date().toISOString()
        };

        const response: ApiResponse<any> = {
            success: true,
            data: metrics,
            timestamp: new Date().toISOString()
        };

        res.json(response);
    }
);

/**
 * Helper functions
 */
async function getSystemStatus(detailed: boolean = false): Promise<SystemStatus> {
    try {
        const dataDir = path.join(process.cwd(), config.get('dataOutputPath'));
        const productsFile = path.join(process.cwd(), config.get('productsOutputPath'));
        const summaryFile = path.join(process.cwd(), 'conversion_summary.json');

        const status: SystemStatus = {
            dataDirectory: {
                exists: await fs.pathExists(dataDir),
                fileCount: 0
            },
            productsFile: {
                exists: await fs.pathExists(productsFile),
                lastModified: null,
                size: 0
            },
            lastUpdate: null
        };

        // Check data directory
        if (status.dataDirectory.exists) {
            try {
                const files = await fs.readdir(dataDir);
                status.dataDirectory.fileCount = files.filter(f => f.endsWith('.json')).length;
            } catch (error) {
                logger.warn('Failed to read data directory', { error, dataDir });
            }
        }

        // Check products file
        if (status.productsFile.exists) {
            try {
                const stats = await fs.stat(productsFile);
                status.productsFile.lastModified = stats.mtime.toISOString();
                status.productsFile.size = stats.size;
            } catch (error) {
                logger.warn('Failed to stat products file', { error, productsFile });
            }
        }

        // Check for conversion summary
        if (await fs.pathExists(summaryFile)) {
            try {
                const summary = await fs.readJson(summaryFile);
                status.lastUpdate = summary.conversion_summary?.timestamp || null;

                if (detailed) {
                    (status as any).conversionSummary = summary;
                }
            } catch (error) {
                logger.warn('Failed to read conversion summary', { error, summaryFile });
            }
        }

        // Add detailed information if requested
        if (detailed) {
            (status as any).detailed = {
                paths: {
                    dataDir,
                    productsFile,
                    summaryFile
                },
                config: config.getSanitizedConfig(),
                systemTime: new Date().toISOString()
            };
        }

        return status;
    } catch (error) {
        logger.error('Error getting system status', error);
        throw new AppError('Failed to get system status', 500);
    }
}

export default router;