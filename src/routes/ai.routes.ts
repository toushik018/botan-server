import { Router, Request, Response, NextFunction } from 'express';
import { logger } from '../utils';
import { validateRequest } from '../middleware';
import {
    aiClientContextParamsSchema,
    productRecommendationsSchema
} from './validation.schemas';
import {
    ApiResponse,
    ClientContextForAI,
    Product,
    NotFoundError
} from '../types';
import path from 'path';
import fs from 'fs-extra';
import { config } from '../utils';

const router = Router();

/**
 * AI-optimized routes for fast data access during voice calls
 */

// Get compact client context for AI
router.get(
    '/client-context/:clientNumber',
    validateRequest({ params: aiClientContextParamsSchema }),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { clientNumber } = req.params;

            const context = await getClientContextForAI(clientNumber);
            if (!context) {
                throw new NotFoundError(`Client context for '${clientNumber}' not found`);
            }

            const response: ApiResponse<ClientContextForAI> = {
                success: true,
                data: context,
                timestamp: new Date().toISOString()
            };

            res.json(response);
        } catch (error) {
            next(error);
        }
    }
);

// Get product recommendations
router.get(
    '/product-recommendations',
    validateRequest({ query: productRecommendationsSchema }),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { clientNumber, category, limit } = req.query as any;

            const recommendations = await getProductRecommendations({
                clientNumber,
                category,
                limit: limit || 10
            });

            const response: ApiResponse<Product[]> = {
                success: true,
                data: recommendations,
                timestamp: new Date().toISOString()
            };

            res.json(response);
        } catch (error) {
            next(error);
        }
    }
);

// Get quick client summary (minimal data for AI)
router.get(
    '/client-summary/:clientNumber',
    validateRequest({ params: aiClientContextParamsSchema }),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { clientNumber } = req.params;

            const summary = await getClientSummary(clientNumber);
            if (!summary) {
                throw new NotFoundError(`Client summary for '${clientNumber}' not found`);
            }

            const response: ApiResponse<any> = {
                success: true,
                data: summary,
                timestamp: new Date().toISOString()
            };

            res.json(response);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * Helper functions optimized for AI consumption
 */
async function getClientContextForAI(clientNumber: string): Promise<ClientContextForAI | null> {
    const clientFile = path.join(process.cwd(), config.get('dataOutputPath'), `${clientNumber}.json`);

    if (!await fs.pathExists(clientFile)) {
        return null;
    }

    try {
        const client = await fs.readJson(clientFile);

        return {
            client: {
                number: client.client_profile.client_number,
                name: client.client_profile.billing_address.name,
                city: client.client_profile.billing_address.city,
                priceGroup: client.client_profile.price_group,
                isBlocked: client.client_profile.is_blocked
            },
            recentOrders: (client.order_history || []).slice(0, 10),
            orderStats: client.order_statistics
        };
    } catch (error) {
        logger.error(`Failed to get AI context for client ${clientNumber}`, error);
        return null;
    }
}

async function getProductRecommendations(options: {
    clientNumber?: string;
    category?: string;
    limit: number;
}): Promise<Product[]> {
    const productsPath = path.join(process.cwd(), config.get('productsOutputPath'));

    if (!await fs.pathExists(productsPath)) {
        return [];
    }

    try {
        const products = await fs.readJson(productsPath);
        let recommendations = products.all_products || [];

        // Filter by category if specified
        if (options.category) {
            recommendations = recommendations.filter((product: Product) =>
                product.product_group?.description?.toLowerCase() === options.category!.toLowerCase()
            );
        }

        // If client specified, personalize recommendations
        if (options.clientNumber) {
            const clientFile = path.join(process.cwd(), config.get('dataOutputPath'), `${options.clientNumber}.json`);

            if (await fs.pathExists(clientFile)) {
                try {
                    const client = await fs.readJson(clientFile);

                    if (client.order_history) {
                        // Get recently ordered articles
                        const recentArticles = client.order_history
                            .slice(0, 20)
                            .map((order: any) => order.article_number);

                        // Filter out recently ordered items
                        recommendations = recommendations.filter((product: Product) =>
                            !recentArticles.includes(product.article_number)
                        );
                    }
                } catch (error) {
                    logger.warn(`Failed to personalize recommendations for client ${options.clientNumber}`, error);
                }
            }
        }

        // Return top recommendations
        return recommendations.slice(0, options.limit);
    } catch (error) {
        logger.error('Failed to get product recommendations', error);
        return [];
    }
}

async function getClientSummary(clientNumber: string): Promise<any | null> {
    const context = await getClientContextForAI(clientNumber);

    if (!context) {
        return null;
    }

    return {
        name: context.client.name,
        city: context.client.city,
        isBlocked: context.client.isBlocked,
        totalOrders: context.orderStats?.total_orders || 0,
        lastOrderDate: context.orderStats?.last_order_date,
        topProducts: context.recentOrders
            .slice(0, 5)
            .map(order => ({
                article: order.article_number,
                description: order.article_info?.short_description || 'Unknown'
            }))
    };
}

export default router;