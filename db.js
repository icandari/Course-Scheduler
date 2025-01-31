const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// Handle connection errors gracefully
pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

module.exports = pool;