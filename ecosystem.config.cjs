module.exports = {
  apps: [
    {
      name: 'rpa-property-bot',
      script: 'index.js',
      instances: 1,
      autorestart: false,
      watch: false,
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
