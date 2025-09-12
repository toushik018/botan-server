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

            // Enhanced logging configuration
            output: '/opt/botan-server/logs/out.log',
            error: '/opt/botan-server/logs/error.log',
            log: '/opt/botan-server/logs/combined.log',
            merge_logs: true,
            time: true,
            env: {
                NODE_ENV: 'production',
                PORT: 5000,
                TRUST_PROXY: 'true',
                DEBUG: '*',
                LOG_LEVEL: 'debug'
            },

            // Process monitoring
            kill_timeout: 5000
            // Removed wait_ready and listen_timeout to fix launching issues
        }
    ]
};