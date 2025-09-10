/**
 * Type extensions for Express
 */

declare global {
    namespace Express {
        interface Request {
            id?: string;
        }
    }
}

export { };