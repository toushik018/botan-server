import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { logger } from '../utils';
import { ValidationError } from '../types';

/**
 * Request validation middleware using Joi schemas
 */
export const validateRequest = (schema: {
    query?: Joi.ObjectSchema;
    params?: Joi.ObjectSchema;
    body?: Joi.ObjectSchema;
}) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        const errors: string[] = [];

        // Validate query parameters
        if (schema.query) {
            const { error } = schema.query.validate(req.query);
            if (error) {
                errors.push(`Query: ${error.details.map(d => d.message).join(', ')}`);
            }
        }

        // Validate path parameters
        if (schema.params) {
            const { error } = schema.params.validate(req.params);
            if (error) {
                errors.push(`Params: ${error.details.map(d => d.message).join(', ')}`);
            }
        }

        // Validate request body
        if (schema.body) {
            const { error } = schema.body.validate(req.body);
            if (error) {
                errors.push(`Body: ${error.details.map(d => d.message).join(', ')}`);
            }
        }

        if (errors.length > 0) {
            logger.warn('Request validation failed', {
                path: req.path,
                method: req.method,
                errors
            });

            const validationError = new ValidationError(`Validation failed: ${errors.join('; ')}`);
            return next(validationError);
        }

        next();
    };
};

/**
 * Request logging middleware
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();

    // Log request
    logger.info('Incoming request', {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        query: Object.keys(req.query).length > 0 ? req.query : undefined
    });

    // Override res.end to log response
    const originalEnd = res.end;
    res.end = function (chunk?: any, encoding?: any, cb?: any): any {
        const duration = Date.now() - startTime;

        logger.logRequest(req, res, duration);

        // Call the original end method
        return originalEnd.call(this, chunk, encoding, cb);
    };

    next();
};

/**
 * Error handling middleware
 */
export const errorHandler = (
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    logger.error('Request error', {
        path: req.path,
        method: req.method,
        error: {
            name: error.name,
            message: error.message,
            stack: error.stack
        }
    });

    // Default error response
    let statusCode = 500;
    let message = 'Internal server error';

    // Handle specific error types
    if (error instanceof ValidationError) {
        statusCode = error.statusCode;
        message = error.message;
    } else if (error.name === 'ValidationError') {
        statusCode = 400;
        message = error.message;
    }

    res.status(statusCode).json({
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
};

/**
 * 404 handler middleware
 */
export const notFoundHandler = (req: Request, res: Response): void => {
    logger.warn('Route not found', {
        method: req.method,
        path: req.path,
        ip: req.ip
    });

    res.status(404).json({
        success: false,
        error: 'Route not found',
        path: req.path,
        timestamp: new Date().toISOString()
    });
};

/**
 * CORS configuration
 */
export const corsOptions = {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);

        // In development, allow all origins
        if (process.env.NODE_ENV === 'development') {
            return callback(null, true);
        }

        // In production, check against allowed origins
        const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || ['*'];
        if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200
};