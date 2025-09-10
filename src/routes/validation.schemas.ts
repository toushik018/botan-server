import Joi from 'joi';

/**
 * Validation schemas for API endpoints
 */

// Common schemas
export const clientNumberSchema = Joi.string()
    .pattern(/^[0-9]+$/)
    .min(1)
    .max(20)
    .required()
    .messages({
        'string.pattern.base': 'Client number must contain only digits',
        'string.min': 'Client number must be at least 1 character',
        'string.max': 'Client number must not exceed 20 characters'
    });

export const paginationSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
});

// Product endpoints
export const productSearchSchema = Joi.object({
    q: Joi.string().min(1).max(100).optional(),
    category: Joi.string().min(1).max(50).optional(),
    limit: Joi.number().integer().min(1).max(100).default(50),
    page: Joi.number().integer().min(1).default(1)
});

export const productCategoryParamsSchema = Joi.object({
    category: Joi.string().min(1).max(50).required()
});

// Client endpoints
export const clientParamsSchema = Joi.object({
    clientNumber: clientNumberSchema
});

export const orderHistoryQuerySchema = Joi.object({
    limit: Joi.number().integer().min(1).max(1000).default(100),
    since: Joi.string().isoDate().optional(),
    page: Joi.number().integer().min(1).default(1)
});

// AI endpoints
export const aiClientContextParamsSchema = Joi.object({
    clientNumber: clientNumberSchema
});

export const productRecommendationsSchema = Joi.object({
    clientNumber: clientNumberSchema.optional(),
    category: Joi.string().min(1).max(50).optional(),
    limit: Joi.number().integer().min(1).max(50).default(10)
});

// System endpoints (no specific validation needed for most)
export const healthCheckSchema = Joi.object({});

export const statusQuerySchema = Joi.object({
    detailed: Joi.boolean().default(false)
});