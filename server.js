require('dotenv').config(); // Load environment variables from .env

const express = require('express');
const path = require('path');
const axios = require('axios'); // Add this at the top with other imports
const app = express();
const PORT = process.env.PORT || 3000;


// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Import and mount API routes
const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);

/**
 * Serve HTML Files Based on Routes
 * This catch-all route handles serving HTML files for frontend navigation
 */
app.get('*', (req, res) => {
    // Extract the pathname without query parameters
    const pathname = req.path;

    // Define a mapping of routes to HTML files
    const routeToFileMap = {
        '/course_details.html': 'course_details.html',
        '/edit_class.html': 'edit_class.html',
        '/add_new_class.html': 'add_new_class.html',
        '/search.html': 'search.html',
        '/change_plan.html': 'change_plan.html', // Add this line
    };

    const fileName = routeToFileMap[pathname];

    if (fileName) {
        res.sendFile(path.join(__dirname, 'public', fileName));
    } else {
        res.status(404).send('Page not found');
    }
});

// Add these routes specifically for the ML service
app.get('/api/classes/for-courses', async (req, res) => {
    try {
        const courseIds = req.query.ids.split(',').map(id => parseInt(id, 10));
        
        // Validate course IDs
        if (!courseIds.every(id => !isNaN(id))) {
            return res.status(400).json({ error: 'Invalid course IDs' });
        }
        
        // Build query to get classes for these courses
        const { rows } = await pool.query(`
            SELECT DISTINCT c.*
            FROM classes c
            JOIN classes_in_course cic ON c.id = cic.class_id
            WHERE cic.course_id = ANY($1::int[])
        `, [courseIds]);
        
        res.json(rows);
    } catch (error) {
        console.error('Error fetching classes for courses:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Update this proxy route in your server.js
app.post('/api/generate-schedule', async (req, res) => {
    try {
        // Try multiple possible URLs in order (Docker, local, env)
        const possibleUrls = [
            'http://ml_service:5000/generate-schedule', // Docker Compose service
            'http://localhost:5001/generate-schedule',  // Local dev (custom)
            'http://localhost:5000/generate-schedule',  // Local dev (default Flask)
            process.env.ML_SERVICE_URL ? `${process.env.ML_SERVICE_URL}/generate-schedule` : null
        ].filter(Boolean);

        const headers = {
            'Content-Type': 'application/json',
            'Origin': process.env.NODE_ENV === 'production'
                ? 'https://course-scheduler-web.onrender.com'
                : 'http://localhost:3000'
        };

        let lastError = null;
        for (const url of possibleUrls) {
            try {
                console.log(`Attempting to connect to ML service at: ${url}`);
                const response = await axios.post(url, req.body, { headers, timeout: 30000 });
                console.log(`Successfully received response from ML service at: ${url}`);
                return res.json(response.data);
            } catch (error) {
                console.warn(`Failed to connect to ${url}: ${error.message}`);
                lastError = error;
            }
        }

        // If none succeeded, return the last error
        throw lastError || new Error('Failed to connect to any ML service URL');
    } catch (error) {
        console.error('Error connecting to ML service:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });

        res.status(error.response?.status || 500).json({
            error: 'Failed to connect to ML service',
            details: error.response?.data || error.message
        });
    }
});

// Add a test endpoint to verify ML service connectivity
app.get('/api/ml-status', async (req, res) => {
    try {
        // Try multiple possible URLs in order
        const possibleUrls = [
            'http://ml_service:5000/ping',  // Docker service name
            'http://localhost:5001/ping',   // Local development
            process.env.ML_SERVICE_URL ? `${process.env.ML_SERVICE_URL}/ping` : null
        ].filter(Boolean);
        
        let lastError = null;
        
        for (const url of possibleUrls) {
            try {
                console.log(`Testing ML service connection at: ${url}`);
                const response = await axios.get(url, { timeout: 5000 });
                
                console.log(`ML service is online at: ${url}`);
                return res.json({
                    status: 'connected',
                    url: url,
                    response: response.data
                });
            } catch (error) {
                console.log(`Failed to connect to ${url}: ${error.message}`);
                lastError = error;
            }
        }
        
        // If we get here, all URLs failed
        throw lastError || new Error("Failed to connect to any ML service URL");
    } catch (error) {
        console.error('Error checking ML service status:', error);
        res.status(500).json({
            status: 'disconnected',
            error: error.message
        });
    }
});

// Add endpoint for schedule evaluation
app.post('/api/evaluate-schedule', async (req, res) => {
    try {
        // Similar URL structure as generate-schedule
        const possibleUrls = [
            'http://ml_service:5000/evaluate',
            'http://localhost:5001/evaluate',
            process.env.ML_SERVICE_URL ? `${process.env.ML_SERVICE_URL}/evaluate` : null
        ].filter(Boolean);
        
        // Same implementation pattern as generate-schedule
        let lastError = null;
        
        for (const url of possibleUrls) {
            try {
                const response = await axios.post(url, req.body, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 10000
                });
                
                return res.json(response.data);
            } catch (error) {
                lastError = error;
            }
        }
        
        throw lastError || new Error("Failed to connect to any ML service URL");
    } catch (error) {
        console.error('Error evaluating schedule:', error);
        res.status(error.response?.status || 500).json({
            error: 'Failed to evaluate schedule',
            details: error.message
        });
    }
});

/**
 * Fallback Route for Undefined Endpoints
 * This should be placed after all other routes
 */
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Start the server
app.listen(PORT, () => {
    console.log(`🚀 Server is running at http://localhost:${PORT}`);
});