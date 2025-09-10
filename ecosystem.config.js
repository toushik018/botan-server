module.exports = {
    apps: [
        {
            name: 'botan-server',
            script: 'dist/server.js',
            instances: 1,
            exec_mode: 'fork',
            env: {
                NODE_ENV: 'production',
                PORT: 5000
            },
            // Production optimizations
            max_memory_restart: '1G',
            watch: false,
            ignore_watch: ['node_modules', 'logs', 'data'],

            // Auto-restart configuration
            autorestart: true,
            max_restarts: 5,
            min_uptime: '10s',

            // Logging
            log_file: './logs/pm2.log',
            out_file: './logs/pm2-out.log',
            error_file: './logs/pm2-error.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

            // Process monitoring
            kill_timeout: 5000,
            wait_ready: true,
            listen_timeout: 10000
        }
    ]
};