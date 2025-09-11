module.exports = {
    apps: [
        {
            name: 'botan-server',
            script: 'dist/server.js',
            instances: 1,
            exec_mode: 'fork',
            env: {
                NODE_ENV: 'development',
                PORT: 5000,
                TRUST_PROXY: 'true'
            },
            env_production: {
                NODE_ENV: 'production',
                PORT: 5000,
                TRUST_PROXY: 'true'
            },
            // Production optimizations
            max_memory_restart: '1G',
            watch: false,
            ignore_watch: ['node_modules', 'logs', 'data'],

            // Auto-restart configuration
            autorestart: true,
            max_restarts: 5,
            min_uptime: '10s',

            // Logging configuration
            log_file: '/opt/botan-server/logs/botan-pm2.log',
            out_file: '/opt/botan-server/logs/botan-pm2-out.log',
            error_file: '/opt/botan-server/logs/botan-pm2-error.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true,

            // Process monitoring
            kill_timeout: 5000
            // Removed wait_ready and listen_timeout to fix launching issues
        }
    ]
};