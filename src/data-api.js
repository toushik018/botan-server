const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const fs = require('fs-extra');
const logger = require('./logger');

/**
 * Data API Service
 * Serves processed JSON data to AI systems via REST endpoints
 */
class DataAPIService {
    constructor(options = {}) {
        this.app = express();
        this.port = options.port || process.env.PORT || 3000;
        this.dataPath = options.dataPath || path.join(process.cwd(), 'data');
        this.productsPath = options.productsPath || path.join(process.cwd(), 'products.json');
        this.apiPrefix = options.apiPrefix || process.env.API_PREFIX || '/api/v1';

        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    /**
     * Setup Express middleware
     */
    setupMiddleware() {
        // Security and performance middleware
        this.app.use(helmet());
        this.app.use(compression());
        this.app.use(cors({
            origin: process.env.CORS_ORIGIN || '*',
            credentials: true
        }));

        // Body parsing
        this.app.use(express.json({ limit: process.env.MAX_FILE_SIZE || '50mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: process.env.MAX_FILE_SIZE || '50mb' }));

        // Request logging
        this.app.use((req, res, next) => {
            logger.info(`${req.method} ${req.path}`, {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                query: req.query
            });
            next();
        });
    }

    /**
     * Setup API routes
     */
    setupRoutes() {
        const router = express.Router();

        // Health check endpoint
        router.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                version: require('../package.json').version
            });
        });

        // Get all products
        router.get('/products', async (req, res) => {
            try {
                const products = await this.getProducts();
                res.json({
                    success: true,
                    data: products,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                logger.error('Error fetching products:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to fetch products',
                    message: error.message
                });
            }
        });

        // Get products by category
        router.get('/products/category/:category', async (req, res) => {
            try {
                const products = await this.getProductsByCategory(req.params.category);
                res.json({
                    success: true,
                    data: products,
                    category: req.params.category,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                logger.error('Error fetching products by category:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to fetch products by category',
                    message: error.message
                });
            }
        });

        // Search products
        router.get('/products/search', async (req, res) => {
            try {
                const { q, category, limit } = req.query;
                const products = await this.searchProducts(q, { category, limit: parseInt(limit) || 50 });
                res.json({
                    success: true,
                    data: products,
                    query: q,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                logger.error('Error searching products:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to search products',
                    message: error.message
                });
            }
        });

        // Get client data
        router.get('/clients/:clientNumber', async (req, res) => {
            try {
                const client = await this.getClient(req.params.clientNumber);
                if (!client) {
                    return res.status(404).json({
                        success: false,
                        error: 'Client not found',
                        clientNumber: req.params.clientNumber
                    });
                }
                res.json({
                    success: true,
                    data: client,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                logger.error('Error fetching client:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to fetch client data',
                    message: error.message
                });
            }
        });

        // Get client order history
        router.get('/clients/:clientNumber/orders', async (req, res) => {
            try {
                const { limit, since } = req.query;
                const orders = await this.getClientOrders(req.params.clientNumber, {
                    limit: parseInt(limit) || 100,
                    since
                });
                res.json({
                    success: true,
                    data: orders,
                    clientNumber: req.params.clientNumber,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                logger.error('Error fetching client orders:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to fetch client orders',
                    message: error.message
                });
            }
        });

        // Get system status and data freshness
        router.get('/status', async (req, res) => {
            try {
                const status = await this.getSystemStatus();
                res.json({
                    success: true,
                    data: status,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                logger.error('Error fetching system status:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to fetch system status',
                    message: error.message
                });
            }
        });

        // Compact endpoint for AI calls - most frequently needed data
        router.get('/ai/client-context/:clientNumber', async (req, res) => {
            try {
                const context = await this.getClientContextForAI(req.params.clientNumber);
                res.json({
                    success: true,
                    data: context,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                logger.error('Error fetching AI client context:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to fetch client context',
                    message: error.message
                });
            }
        });

        // Compact endpoint for product recommendations
        router.get('/ai/product-recommendations', async (req, res) => {
            try {
                const { clientNumber, category, limit } = req.query;
                const recommendations = await this.getProductRecommendations({
                    clientNumber,
                    category,
                    limit: parseInt(limit) || 10
                });
                res.json({
                    success: true,
                    data: recommendations,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                logger.error('Error fetching product recommendations:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to fetch recommendations',
                    message: error.message
                });
            }
        });

        this.app.use(this.apiPrefix, router);

        // Root endpoint
        this.app.get('/', (req, res) => {
            res.json({
                service: 'BotanBot Data API',
                version: require('../package.json').version,
                endpoints: {
                    health: `${this.apiPrefix}/health`,
                    products: `${this.apiPrefix}/products`,
                    clients: `${this.apiPrefix}/clients/:clientNumber`,
                    status: `${this.apiPrefix}/status`
                },
                documentation: `${this.apiPrefix}/health`
            });
        });
    }

    /**
     * Setup error handling
     */
    setupErrorHandling() {
        // 404 handler
        this.app.use('*', (req, res) => {
            res.status(404).json({
                success: false,
                error: 'Endpoint not found',
                path: req.originalUrl
            });
        });

        // Global error handler
        this.app.use((err, req, res, next) => {
            logger.error('Unhandled error:', err);
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
            });
        });
    }

    /**
     * Get all products
     */
    async getProducts() {
        if (!await fs.pathExists(this.productsPath)) {
            throw new Error('Products file not found. Run data conversion first.');
        }
        return await fs.readJson(this.productsPath);
    }

    /**
     * Get products by category
     */
    async getProductsByCategory(category) {
        const products = await this.getProducts();
        const categoryProducts = products.product_categories?.[category];

        if (!categoryProducts) {
            return [];
        }

        return categoryProducts;
    }

    /**
     * Search products
     */
    async searchProducts(query, options = {}) {
        const products = await this.getProducts();
        const allProducts = products.all_products || [];

        if (!query) return allProducts.slice(0, options.limit || 50);

        const searchTerm = query.toLowerCase();
        const filtered = allProducts.filter(product =>
            product.short_description?.toLowerCase().includes(searchTerm) ||
            product.long_description?.toLowerCase().includes(searchTerm) ||
            product.article_number?.toLowerCase().includes(searchTerm) ||
            product.product_group?.description?.toLowerCase().includes(searchTerm)
        );

        if (options.category) {
            return filtered.filter(product =>
                product.product_group?.description?.toLowerCase() === options.category.toLowerCase()
            );
        }

        return filtered.slice(0, options.limit || 50);
    }

    /**
     * Get client data
     */
    async getClient(clientNumber) {
        const clientFile = path.join(this.dataPath, `${clientNumber}.json`);
        if (!await fs.pathExists(clientFile)) {
            return null;
        }
        return await fs.readJson(clientFile);
    }

    /**
     * Get client orders
     */
    async getClientOrders(clientNumber, options = {}) {
        const client = await this.getClient(clientNumber);
        if (!client) return [];

        let orders = client.order_history || [];

        if (options.since) {
            orders = orders.filter(order => order.date >= options.since);
        }

        return orders.slice(0, options.limit || 100);
    }

    /**
     * Get system status
     */
    async getSystemStatus() {
        const status = {
            dataDirectory: {
                exists: await fs.pathExists(this.dataPath),
                fileCount: 0
            },
            productsFile: {
                exists: await fs.pathExists(this.productsPath),
                lastModified: null,
                size: 0
            },
            lastUpdate: null
        };

        if (status.dataDirectory.exists) {
            const files = await fs.readdir(this.dataPath);
            status.dataDirectory.fileCount = files.filter(f => f.endsWith('.json')).length;
        }

        if (status.productsFile.exists) {
            const stats = await fs.stat(this.productsPath);
            status.productsFile.lastModified = stats.mtime.toISOString();
            status.productsFile.size = stats.size;
        }

        // Check for conversion summary
        const summaryPath = path.join(process.cwd(), 'conversion_summary.json');
        if (await fs.pathExists(summaryPath)) {
            const summary = await fs.readJson(summaryPath);
            status.lastUpdate = summary.conversion_summary?.timestamp;
        }

        return status;
    }

    /**
     * Get compact client context for AI
     */
    async getClientContextForAI(clientNumber) {
        const client = await this.getClient(clientNumber);
        if (!client) return null;

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
    }

    /**
     * Get product recommendations based on client history
     */
    async getProductRecommendations(options = {}) {
        const products = await this.getProducts();
        let recommendations = products.all_products || [];

        if (options.category) {
            recommendations = recommendations.filter(product =>
                product.product_group?.description?.toLowerCase() === options.category.toLowerCase()
            );
        }

        // If client specified, could analyze their order history for personalized recommendations
        if (options.clientNumber) {
            const client = await this.getClient(options.clientNumber);
            if (client && client.order_history) {
                // Simple recommendation: products they haven't ordered recently
                const recentArticles = client.order_history
                    .slice(0, 20)
                    .map(order => order.article_number);

                recommendations = recommendations.filter(product =>
                    !recentArticles.includes(product.article_number)
                );
            }
        }

        return recommendations.slice(0, options.limit || 10);
    }

    /**
     * Start the server
     */
    async start() {
        return new Promise((resolve) => {
            this.server = this.app.listen(this.port, () => {
                logger.info(`Data API server running on port ${this.port}`);
                logger.info(`API endpoints available at: http://localhost:${this.port}${this.apiPrefix}`);
                resolve();
            });
        });
    }

    /**
     * Stop the server
     */
    async stop() {
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
}

module.exports = DataAPIService;