import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs-extra';
import { logger, config } from '../utils';
import { validateRequest } from '../middleware';
import {
    clientParamsSchema,
    orderHistoryQuerySchema
} from './validation.schemas';
import {
    ApiResponse,
    ClientData,
    OrderItem,
    NotFoundError,
    AppError
} from '../types';

const router = Router();

/**
 * Client routes with validation and comprehensive data handling
 */

// Get client profile data
router.get(
    '/:clientNumber',
    validateRequest({ params: clientParamsSchema }),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { clientNumber } = req.params;

            const client = await getClient(clientNumber);
            if (!client) {
                throw new NotFoundError(`Client with number '${clientNumber}' not found`);
            }

            const response: ApiResponse<ClientData> = {
                success: true,
                data: client,
                timestamp: new Date().toISOString()
            };

            res.json(response);
        } catch (error) {
            next(error);
        }
    }
);

// Get client order history
router.get(
    '/:clientNumber/orders',
    validateRequest({
        params: clientParamsSchema,
        query: orderHistoryQuerySchema
    }),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { clientNumber } = req.params;
            const { limit, since, page } = req.query as any;

            const orders = await getClientOrders(clientNumber, { limit, since, page });

            const response: ApiResponse<OrderItem[]> = {
                success: true,
                data: orders.data,
                timestamp: new Date().toISOString()
            };

            // Add pagination if applicable
            if (orders.pagination) {
                (response as any).pagination = orders.pagination;
            }

            res.json(response);
        } catch (error) {
            next(error);
        }
    }
);

// Get client statistics
router.get(
    '/:clientNumber/stats',
    validateRequest({ params: clientParamsSchema }),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { clientNumber } = req.params;

            const client = await getClient(clientNumber);
            if (!client) {
                throw new NotFoundError(`Client with number '${clientNumber}' not found`);
            }

            const response: ApiResponse<any> = {
                success: true,
                data: client.order_statistics,
                timestamp: new Date().toISOString()
            };

            res.json(response);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * Helper functions
 */
async function getClient(clientNumber: string): Promise<ClientData | null> {
    const clientFile = path.join(process.cwd(), config.get('dataOutputPath'), `${clientNumber}.json`);

    if (!await fs.pathExists(clientFile)) {
        return null;
    }

    try {
        return await fs.readJson(clientFile) as ClientData;
    } catch (error) {
        logger.error(`Failed to read client file for ${clientNumber}`, error);
        throw new AppError('Failed to load client data', 500);
    }
}

async function getClientOrders(
    clientNumber: string,
    options: { limit?: number; since?: string; page?: number } = {}
): Promise<{ data: OrderItem[]; pagination?: any }> {
    const client = await getClient(clientNumber);
    if (!client) {
        throw new NotFoundError(`Client with number '${clientNumber}' not found`);
    }

    let orders = client.order_history || [];

    // Filter by date if specified
    if (options.since) {
        orders = orders.filter(order => order.date && order.date >= options.since!);
    }

    // Apply pagination
    const page = options.page || 1;
    const limit = options.limit || 100;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    const paginatedOrders = orders.slice(startIndex, endIndex);

    const result: { data: OrderItem[]; pagination?: any } = {
        data: paginatedOrders
    };

    // Add pagination metadata if needed
    if (orders.length > limit) {
        result.pagination = {
            page,
            limit,
            total: orders.length,
            totalPages: Math.ceil(orders.length / limit),
            hasNext: endIndex < orders.length,
            hasPrev: page > 1
        };
    }

    return result;
}

export default router;