const http = require('http');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const ejs = require('ejs');

// Store loaded routes configurations
let routes = new Map();

// Function to load a single route configuration
function loadRouteConfig(filePath) {
    try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const config = JSON.parse(fileContent);
        
        // Validate required fields
        if (!config.urlContext || !config.backend) {
            console.error(`Error in ${filePath}: Missing required fields (urlContext or backend)`);
            return null;
        }
        
        return config;
    } catch (error) {
        console.error(`Error loading ${filePath}:`, error.message);
        return null;
    }
}

// Function to load all route configurations
function loadAllRoutes() {
    const routesDir = path.join(__dirname, 'routes');
    
    // Create routes directory if it doesn't exist
    if (!fs.existsSync(routesDir)) {
        fs.mkdirSync(routesDir);
    }
    
    // Clear existing routes
    routes.clear();
    
    // Read all JSON files in the routes directory
    try {
        const files = fs.readdirSync(routesDir);
        files.forEach(file => {
            if (path.extname(file) === '.json') {
                const filePath = path.join(routesDir, file);
                const config = loadRouteConfig(filePath);
                if (config) {
                    routes.set(config.urlContext, config);
                }
            }
        });
    } catch (error) {
        console.error('Error loading routes:', error.message);
    }
}

// Watch for changes in the routes directory
function watchRoutes() {
    const routesDir = path.join(__dirname, 'routes');
    
    fs.watch(routesDir, (eventType, filename) => {
        if (filename && path.extname(filename) === '.json') {
            console.log(`Route configuration changed: ${filename}`);
            loadAllRoutes();
        }
    });
}

// Function to handle proxy requests
async function proxyRequest(req, res, config) {
    const targetUrl = new URL(`http://${config.backend}`);
    let path = req.url;
    
    // Apply path modifications
    if (config.removePrefix && path.startsWith(config.removePrefix)) {
        path = path.slice(config.removePrefix.length);
    }
    if (config.addPrefix) {
        path = config.addPrefix + path;
    }
    
    // Apply CORS if configured
    if (config.cors) {
        cors(config.cors)(req, res, () => {});
    }

    // Apply security headers if configured
    if (config.security) {
        helmet(config.security)(req, res, () => {});
    }
    
    const options = {
        hostname: targetUrl.hostname,
        port: targetUrl.port,
        path: path,
        method: req.method,
        headers: req.headers,
        timeout: config.timeout // Set connection timeout
    };
    
    try {
        const proxyReq = http.request(options, (proxyRes) => {
            // Set response timeout
            proxyRes.setTimeout(config.timeout, () => {
                proxyRes.destroy();
                res.writeHead(504);
                res.end('Gateway Timeout - Response took too long');
            });

            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);
            
            if (config.log) {
                console.log(`Proxied ${req.method} ${req.url} -> ${config.backend}${path}`);
            }
        });

        // Set timeout if configured
        if (config.timeout) {
            const shouldApplyTimeout = !config.ignoreTimeout?.some(pattern => 
                new RegExp(pattern).test(req.url)
            );

            if (shouldApplyTimeout) {
                proxyReq.setTimeout(config.timeout, () => {
                    proxyReq.destroy();
                    res.writeHead(504);
                    res.end('Gateway Timeout');
                });
            }
        }
        
        req.pipe(proxyReq);
        
        proxyReq.on('error', (error) => {
            console.error('Proxy request error:', error.message);
            if (!res.headersSent) {
                if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
                    res.writeHead(504);
                    res.end('Gateway Timeout - Backend Unreachable');
                } else {
                    res.writeHead(502);
                    res.end('Bad Gateway');
                }
            }
        });
    } catch (error) {
        console.error('Error creating proxy request:', error.message);
        res.writeHead(500);
        res.end('Internal Server Error');
    }
}

// Function to render EJS template
async function renderTemplate(res, template, data = {}) {
    try {
        const templatePath = path.join(__dirname, 'views', template);
        const html = await ejs.renderFile(templatePath, data);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
    } catch (error) {
        console.error('Error rendering template:', error.message);
        res.writeHead(500);
        res.end('Internal Server Error');
    }
}

// Function to render 404 page
async function render404(res) {
    try {
        const templatePath = path.join(__dirname, 'views', '404.ejs');
        const html = await ejs.renderFile(templatePath);
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(html);
    } catch (error) {
        console.error('Error rendering 404 page:', error.message);
        res.writeHead(404);
        res.end('Not Found');
    }
}

// Function to get system health status
async function getHealthStatus() {
    return {
        status: 'healthy',
        // uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        // routes: Array.from(routes.keys()),
        // memory: process.memoryUsage()
    };
}

// Create the server
const server = http.createServer(async (req, res) => {
    // Handle root route
    if (req.url === '/') {
        await renderTemplate(res, 'index.ejs', { routes });
        return;
    }

    // Handle health check
    if (req.url === '/health') {
        const health = await getHealthStatus();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(health));
        return;
    }

    // Handle documentation
    if (req.url === '/documentation') {
        await renderTemplate(res, 'documentation.ejs');
        return;
    }

    // Find matching route
    let matchedRoute = null;
    for (const [urlContext, config] of routes) {
        if (req.url.startsWith(urlContext)) {
            matchedRoute = config;
            break;
        }
    }
    
    if (matchedRoute) {
        proxyRequest(req, res, matchedRoute);
    } else {
        await render404(res);
    }
});

// Initialize routes and start watching
loadAllRoutes();
watchRoutes();

// Add unhandled error handler
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the server
const PORT = process.env.PORT || 9000;
server.listen(PORT, () => {
    console.log(`Reverse proxy server running on port ${PORT}`);
    console.log('Watching for route configuration changes...');
});