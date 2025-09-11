import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs-extra';
import Joi from 'joi';
import { logger, config } from '../utils';
import { validateRequest } from '../middleware';
import {
    productSearchSchema,
    productCategoryParamsSchema
} from './validation.schemas';
import {
    ApiResponse,
    ProductsData,
    Product,
    NotFoundError,
    AppError
} from '../types';

const router = Router();

/**
 * Product routes with comprehensive validation and error handling
 */

// Get all products
router.get(
    '/',
    validateRequest({ query: productSearchSchema }),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { q, category, limit, page = 1 } = req.query as any;

            const products = await getProducts();
            let filteredProducts = products.all_products || [];

            // Apply search filter
            if (q) {
                const searchTerm = q.toLowerCase();
                filteredProducts = filteredProducts.filter((product: Product) =>
                    product.short_description?.toLowerCase().includes(searchTerm) ||
                    product.long_description?.toLowerCase().includes(searchTerm) ||
                    product.article_number?.toLowerCase().includes(searchTerm) ||
                    product.product_group?.description?.toLowerCase().includes(searchTerm)
                );
            }

            // Apply category filter
            if (category) {
                filteredProducts = filteredProducts.filter((product: Product) =>
                    product.product_group?.description?.toLowerCase() === category.toLowerCase()
                );
            }

            let responseData = filteredProducts;

            // Apply pagination only if limit is specified
            if (limit) {
                const startIndex = (page - 1) * limit;
                const endIndex = startIndex + limit;
                responseData = filteredProducts.slice(startIndex, endIndex);
            }

            const response: ApiResponse<Product[]> = {
                success: true,
                data: responseData,
                timestamp: new Date().toISOString()
            };

            // Add pagination metadata only if limit is specified
            if (limit) {
                const startIndex = (page - 1) * limit;
                const endIndex = startIndex + limit;
                (response as any).pagination = {
                    page,
                    limit,
                    total: filteredProducts.length,
                    totalPages: Math.ceil(filteredProducts.length / limit),
                    hasNext: endIndex < filteredProducts.length,
                    hasPrev: page > 1
                };
            }

            res.json(response);
        } catch (error) {
            next(error);
        }
    }
);

// Get products by category
router.get(
    '/category/:category',
    validateRequest({ params: productCategoryParamsSchema }),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { category } = req.params;

            const products = await getProducts();
            const categoryProducts = products.product_categories?.[category];

            if (!categoryProducts) {
                throw new NotFoundError(`Category '${category}' not found`);
            }

            const response: ApiResponse<Product[]> = {
                success: true,
                data: categoryProducts,
                timestamp: new Date().toISOString()
            };

            res.json(response);
        } catch (error) {
            next(error);
        }
    }
);

// Get product categories
router.get(
    '/categories',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const products = await getProducts();
            const categories = Object.keys(products.product_categories || {});

            const categoriesWithCounts = categories.map(category => ({
                name: category,
                count: products.product_categories[category]?.length || 0
            }));

            const response: ApiResponse<any[]> = {
                success: true,
                data: categoriesWithCounts,
                timestamp: new Date().toISOString()
            };

            res.json(response);
        } catch (error) {
            next(error);
        }
    }
);

// Get single product by article number
router.get(
    '/:articleNumber',
    validateRequest({
        params: Joi.object({
            articleNumber: Joi.string().required()
        })
    }),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { articleNumber } = req.params;

            const products = await getProducts();
            const product = products.all_products?.find(
                (p: Product) => p.article_number === articleNumber
            );

            if (!product) {
                throw new NotFoundError(`Product with article number '${articleNumber}' not found`);
            }

            const response: ApiResponse<Product> = {
                success: true,
                data: product,
                timestamp: new Date().toISOString()
            };

            res.json(response);
        } catch (error) {
            next(error);
        }
    }
);

// Search products (alternative endpoint)
router.get(
    '/search/:searchTerm',
    validateRequest({
        params: Joi.object({
            searchTerm: Joi.string().min(1).max(100).required()
        }),
        query: Joi.object({
            limit: Joi.number().integer().min(1).optional() // Removed max limit and default
        })
    }),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { searchTerm } = req.params;
            const { limit } = req.query as any;

            const products = await getProducts();
            const allProducts = products.all_products || [];

            const searchTermLower = searchTerm.toLowerCase();
            const filteredProducts = allProducts.filter((product: Product) =>
                product.short_description?.toLowerCase().includes(searchTermLower) ||
                product.long_description?.toLowerCase().includes(searchTermLower) ||
                product.article_number?.toLowerCase().includes(searchTermLower) ||
                product.barcode?.toLowerCase().includes(searchTermLower)
            );

            const response: ApiResponse<Product[]> = {
                success: true,
                data: limit ? filteredProducts.slice(0, limit) : filteredProducts,
                timestamp: new Date().toISOString()
            };

            res.json(response);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * Helper function to load products data
 */
async function getProducts(): Promise<ProductsData> {
    const productsPath = path.join(process.cwd(), config.get('productsOutputPath'));

    if (!await fs.pathExists(productsPath)) {
        throw new AppError('Products file not found. Run data conversion first.', 404);
    }

    try {
        return await fs.readJson(productsPath) as ProductsData;
    } catch (error) {
        logger.error('Failed to read products file', error);
        throw new AppError('Failed to load products data', 500);
    }
}

export default router;