import cron from 'node-cron';
import { logger, config } from '../utils';
import { FTPSyncService } from './ftp-sync.service';
import { PythonConverterService } from './python-converter.service';
import {
    JobStatus,
    JobStep,
    ScheduledTask,
    FTPSyncResult,
    ConversionResult,
    AppError
} from '../types';

/**
 * Enhanced Job Scheduler Service with TypeScript and comprehensive error handling
 */
export class JobSchedulerService {
    private ftpSync: FTPSyncService;
    private converter: PythonConverterService;
    private jobs: Map<string, JobStatus> = new Map();
    private scheduledTasks: ScheduledTask[] = [];
    private isRunning: boolean = false;
    private jobHistory: JobStatus[] = [];
    private readonly maxHistoryEntries: number;
    private readonly syncSchedule: string;

    constructor(options: {
        maxHistoryEntries?: number;
        syncSchedule?: string;
        ftpConfig?: any;
        converterConfig?: any;
    } = {}) {
        this.maxHistoryEntries = options.maxHistoryEntries || 100;
        this.syncSchedule = options.syncSchedule || config.get('syncSchedule');

        this.ftpSync = new FTPSyncService(options.ftpConfig);
        this.converter = new PythonConverterService(options.converterConfig);
    }

    /**
     * Start the job scheduler
     */
    public start(): void {
        if (this.isRunning) {
            logger.warn('Job scheduler is already running');
            return;
        }

        logger.info('Starting job scheduler...', {
            syncSchedule: this.syncSchedule,
            timezone: 'Local System Timezone'
        });

        try {
            // Validate cron schedule
            if (!cron.validate(this.syncSchedule)) {
                throw new AppError(`Invalid cron schedule: ${this.syncSchedule}`, 500);
            }

            // Schedule the main sync job - Using local system timezone
            const syncTask = cron.schedule(this.syncSchedule, async () => {
                await this.runFullDataSync();
            }, {
                scheduled: false
                // Removed timezone to use local system timezone
            });

            this.scheduledTasks.push({
                name: 'daily-data-sync',
                task: syncTask,
                schedule: this.syncSchedule,
                description: 'Daily FTP sync and data conversion'
            });

            // Optional: Schedule health check every hour - Using local timezone
            const healthCheckTask = cron.schedule('0 * * * *', async () => {
                await this.runHealthCheck();
            }, {
                scheduled: false
                // Removed timezone to use local system timezone
            });

            this.scheduledTasks.push({
                name: 'hourly-health-check',
                task: healthCheckTask,
                schedule: '0 * * * *',
                description: 'Hourly system health check'
            });

            // Start all scheduled tasks
            this.scheduledTasks.forEach(({ task, name }) => {
                task.start();
                logger.info(`Scheduled task '${name}' started`);
            });

            this.isRunning = true;
            logger.info('Job scheduler started successfully', {
                tasksCount: this.scheduledTasks.length
            });

        } catch (error) {
            logger.error('Failed to start job scheduler', error);
            throw error;
        }
    }

    /**
     * Stop the job scheduler
     */
    public stop(): void {
        if (!this.isRunning) {
            logger.warn('Job scheduler is not running');
            return;
        }

        logger.info('Stopping job scheduler...');

        // Stop all scheduled tasks
        this.scheduledTasks.forEach(({ task, name }) => {
            task.stop();
            logger.info(`Scheduled task '${name}' stopped`);
        });

        this.scheduledTasks = [];
        this.isRunning = false;

        logger.info('Job scheduler stopped');
    }

    /**
     * Run complete data synchronization pipeline manually
     */
    public async runFullDataSync(): Promise<JobStatus> {
        const jobId = `sync-${Date.now()}`;
        const startTime = new Date();

        logger.logJobStart(jobId, 'full-data-sync');

        const jobStatus: JobStatus = {
            id: jobId,
            type: 'full-data-sync',
            startTime,
            endTime: null,
            duration: null,
            status: 'running',
            steps: [],
            error: null,
            ftpStats: null,
            conversionResults: null
        };

        this.jobs.set(jobId, jobStatus);

        try {
            // Step 1: Environment validation
            await this.addJobStep(jobStatus, 'environment-validation', async () => {
                await this.converter.validateEnvironment();
                logger.debug(`[${jobId}] Environment validation passed`);
            });

            // Step 2: FTP Sync
            await this.addJobStep(jobStatus, 'ftp-sync', async () => {
                logger.info(`[${jobId}] Starting FTP synchronization`);
                jobStatus.ftpStats = await this.ftpSync.syncAll();
                logger.info(`[${jobId}] FTP sync completed`, {
                    downloaded: jobStatus.ftpStats.totalDownloaded,
                    skipped: jobStatus.ftpStats.totalSkipped,
                    errors: jobStatus.ftpStats.totalErrors
                });
            });

            // Step 3: Data Conversion
            await this.addJobStep(jobStatus, 'data-conversion', async () => {
                logger.info(`[${jobId}] Starting XML to JSON conversion`);
                jobStatus.conversionResults = await this.converter.runConversion();
                logger.info(`[${jobId}] Data conversion completed successfully`);
            });

            // Job completed successfully
            jobStatus.endTime = new Date();
            jobStatus.duration = jobStatus.endTime.getTime() - jobStatus.startTime.getTime();
            jobStatus.status = 'completed';

            logger.logJobComplete(jobId, 'full-data-sync', jobStatus.duration);

            // Save to history
            this.addToHistory(jobStatus);

        } catch (error) {
            logger.logJobError(jobId, 'full-data-sync', error as Error);

            jobStatus.endTime = new Date();
            jobStatus.duration = jobStatus.endTime.getTime() - jobStatus.startTime.getTime();
            jobStatus.status = 'failed';
            jobStatus.error = {
                message: (error as Error).message,
                stack: (error as Error).stack
            };

            // Update current step as failed
            if (jobStatus.steps.length > 0) {
                const currentStep = jobStatus.steps[jobStatus.steps.length - 1];
                if (!currentStep.endTime) {
                    currentStep.endTime = new Date();
                    currentStep.status = 'failed';
                    currentStep.error = error;
                }
            }

            this.addToHistory(jobStatus);
            throw error;
        }

        return jobStatus;
    }

    /**
     * Run FTP sync only
     */
    public async runFTPSyncOnly(): Promise<JobStatus> {
        const jobId = `ftp-${Date.now()}`;
        const startTime = new Date();

        logger.logJobStart(jobId, 'ftp-sync-only');

        const jobStatus: JobStatus = {
            id: jobId,
            type: 'ftp-sync-only',
            startTime,
            endTime: null,
            duration: null,
            status: 'running',
            steps: [],
            error: null,
            ftpStats: null,
            conversionResults: null
        };

        this.jobs.set(jobId, jobStatus);

        try {
            await this.addJobStep(jobStatus, 'ftp-sync', async () => {
                jobStatus.ftpStats = await this.ftpSync.syncAll();
            });

            jobStatus.endTime = new Date();
            jobStatus.duration = jobStatus.endTime.getTime() - jobStatus.startTime.getTime();
            jobStatus.status = 'completed';

            logger.logJobComplete(jobId, 'ftp-sync-only', jobStatus.duration);
            this.addToHistory(jobStatus);

        } catch (error) {
            logger.logJobError(jobId, 'ftp-sync-only', error as Error);

            jobStatus.endTime = new Date();
            jobStatus.duration = jobStatus.endTime.getTime() - jobStatus.startTime.getTime();
            jobStatus.status = 'failed';
            jobStatus.error = {
                message: (error as Error).message,
                stack: (error as Error).stack
            };

            this.addToHistory(jobStatus);
            throw error;
        }

        return jobStatus;
    }

    /**
     * Run conversion only
     */
    public async runConversionOnly(): Promise<JobStatus> {
        const jobId = `convert-${Date.now()}`;
        const startTime = new Date();

        logger.logJobStart(jobId, 'conversion-only');

        const jobStatus: JobStatus = {
            id: jobId,
            type: 'conversion-only',
            startTime,
            endTime: null,
            duration: null,
            status: 'running',
            steps: [],
            error: null,
            ftpStats: null,
            conversionResults: null
        };

        this.jobs.set(jobId, jobStatus);

        try {
            await this.addJobStep(jobStatus, 'data-conversion', async () => {
                jobStatus.conversionResults = await this.converter.runConversion();
            });

            jobStatus.endTime = new Date();
            jobStatus.duration = jobStatus.endTime.getTime() - jobStatus.startTime.getTime();
            jobStatus.status = 'completed';

            logger.logJobComplete(jobId, 'conversion-only', jobStatus.duration);
            this.addToHistory(jobStatus);

        } catch (error) {
            logger.logJobError(jobId, 'conversion-only', error as Error);

            jobStatus.endTime = new Date();
            jobStatus.duration = jobStatus.endTime.getTime() - jobStatus.startTime.getTime();
            jobStatus.status = 'failed';
            jobStatus.error = {
                message: (error as Error).message,
                stack: (error as Error).stack
            };

            this.addToHistory(jobStatus);
            throw error;
        }

        return jobStatus;
    }

    /**
     * Run health check
     */
    public async runHealthCheck(): Promise<void> {
        try {
            logger.debug('Running scheduled health check');

            // Check data freshness
            const isDataFresh = await this.converter.isDataFresh(25); // 25 hours tolerance

            if (!isDataFresh) {
                logger.warn('Data is not fresh, consider running sync');
            }

            // Log system metrics
            const metrics = {
                dataFresh: isDataFresh,
                activeJobs: this.jobs.size,
                schedulerRunning: this.isRunning,
                memoryUsage: process.memoryUsage(),
                uptime: process.uptime()
            };

            logger.logMetrics(metrics);

        } catch (error) {
            logger.error('Health check failed', error);
        }
    }

    /**
     * Get job status
     */
    public getJobStatus(jobId: string): JobStatus | null {
        return this.jobs.get(jobId) || null;
    }

    /**
     * Get all active jobs
     */
    public getActiveJobs(): JobStatus[] {
        return Array.from(this.jobs.values()).filter(job => job.status === 'running');
    }

    /**
     * Get job history
     */
    public getJobHistory(limit?: number): JobStatus[] {
        const history = [...this.jobHistory].reverse(); // Most recent first
        return limit ? history.slice(0, limit) : history;
    }

    /**
     * Get scheduler status
     */
    public getSchedulerStatus(): any {
        return {
            isRunning: this.isRunning,
            scheduledTasks: this.scheduledTasks.map(task => ({
                name: task.name,
                schedule: task.schedule,
                description: task.description
            })),
            activeJobs: this.getActiveJobs().length,
            totalJobsInHistory: this.jobHistory.length
        };
    }

    /**
     * Private helper methods
     */
    private async addJobStep(
        jobStatus: JobStatus,
        stepName: string,
        stepFunction: () => Promise<void>
    ): Promise<void> {
        const step: JobStep = {
            name: stepName,
            startTime: new Date(),
            status: 'running'
        };

        jobStatus.steps.push(step);

        try {
            await stepFunction();
            step.endTime = new Date();
            step.status = 'completed';
        } catch (error) {
            step.endTime = new Date();
            step.status = 'failed';
            step.error = error;
            throw error;
        }
    }

    private addToHistory(jobStatus: JobStatus): void {
        // Remove the job from active jobs
        this.jobs.delete(jobStatus.id);

        // Add to history
        this.jobHistory.push({ ...jobStatus });

        // Trim history if it exceeds max entries
        if (this.jobHistory.length > this.maxHistoryEntries) {
            this.jobHistory = this.jobHistory.slice(-this.maxHistoryEntries);
        }
    }
}

export default JobSchedulerService;