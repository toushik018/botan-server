/**
 * API and service related types
 */

// API Response types
export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
    timestamp: string;
}

export interface PaginatedResponse<T = any> extends ApiResponse<T[]> {
    pagination?: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

// Query parameter types
export interface ProductSearchQuery {
    q?: string;
    category?: string;
    limit?: number;
    page?: number;
}

export interface OrderHistoryQuery {
    limit?: number;
    since?: string;
    page?: number;
}

export interface ProductRecommendationQuery {
    clientNumber?: string;
    category?: string;
    limit?: number;
}

// FTP related types
export interface FTPConfig {
    host: string;
    port: number;
    user: string;
    password: string;
    secure: boolean;
    secureOptions?: {
        rejectUnauthorized?: boolean;
    };
    connTimeout?: number;
    pasvTimeout?: number;
    keepalive?: number;
}

export interface FTPFileInfo {
    name: string;
    size: number;
    localPath: string;
    remotePath: string;
}

export interface FTPSyncStats {
    downloaded: number;
    skipped: number;
    errors: number;
    files: FTPFileInfo[];
}

export interface FTPSyncResult {
    adressen: FTPSyncStats;
    artikel: FTPSyncStats;
    history: FTPSyncStats;
    totalDownloaded: number;
    totalSkipped: number;
    totalErrors: number;
    startTime: Date;
    endTime: Date | null;
    duration: number | null;
}

// Python converter types
export interface PythonConverterConfig {
    pythonPath?: string;
    scriptPath?: string;
    workingDir?: string;
}

export interface ConversionResult {
    success: boolean;
    exitCode: number;
    stdout: string;
    stderr: string;
    summary: any;
    timestamp: string;
}

export interface ConversionStatus {
    dataDirectory: {
        exists: boolean;
        fileCount: number;
        lastModified: string | null;
    };
    productsFile: {
        exists: boolean;
        size: number;
        lastModified: string | null;
    };
    summary: any;
    lastConversion: string | null;
}

// Job scheduler types
export interface JobStep {
    name: string;
    startTime: Date;
    endTime?: Date;
    status: 'running' | 'completed' | 'failed';
    error?: any;
}

export interface JobStatus {
    id: string;
    type: string;
    startTime: Date;
    endTime: Date | null;
    duration: number | null;
    status: 'running' | 'completed' | 'failed';
    steps: JobStep[];
    error: any;
    ftpStats: FTPSyncResult | null;
    conversionResults: ConversionResult | null;
}

export interface ScheduledTask {
    name: string;
    task: any; // node-cron task
    schedule: string;
    description: string;
}

// System status types
export interface SystemStatus {
    dataDirectory: {
        exists: boolean;
        fileCount: number;
    };
    productsFile: {
        exists: boolean;
        lastModified: string | null;
        size: number;
    };
    lastUpdate: string | null;
}

// AI Context types
export interface ClientContextForAI {
    client: {
        number: string;
        name: string;
        city: string;
        priceGroup: string;
        isBlocked: boolean;
    };
    recentOrders: any[];
    orderStats: any;
}

// Environment configuration types
export interface AppConfig {
    nodeEnv: string;
    port: number;

    // FTP Configuration
    ftp: FTPConfig;

    // Data Paths
    dataSourcePath: string;
    dataOutputPath: string;
    productsOutputPath: string;

    // Sync Schedule
    syncSchedule: string;

    // API Configuration
    apiPrefix: string;
    maxFileSize: string;
    corsOrigin: string;

    // Logging
    logLevel: string;
    logFile: string;
}

// Error types
export class AppError extends Error {
    constructor(
        message: string,
        public statusCode: number = 500,
        public isOperational: boolean = true
    ) {
        super(message);
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

export class ValidationError extends AppError {
    constructor(message: string) {
        super(message, 400);
    }
}

export class NotFoundError extends AppError {
    constructor(message: string) {
        super(message, 404);
    }
}