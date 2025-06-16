# Node Router

A dynamic reverse proxy server with auto-reloading configuration, built with Node.js. This server allows you to configure routing rules through JSON files and automatically applies changes without requiring a restart.

## Features

- Dynamic route configuration through JSON files
- Auto-reload when route configurations change
- Support for path prefixing and removal
- CORS configuration per route
- Security headers via Helmet
- Timeout configuration with ignore patterns
- Health monitoring endpoint
- Built-in documentation UI

## Requirements

- Node.js 16.20.2 or higher
- npm (Node Package Manager)

## Installation

1. Clone the repository:
   ```bash
   git clone [repository-url]
   cd node-router
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

1. Start the server:
   ```bash
   npm start
   ```
   The server will start on port 9000 by default. You can change this by setting the PORT environment variable.

2. Create route configurations:
   - Place JSON configuration files in the `routes` directory
   - The server will automatically load new configurations and apply changes

3. Access the server:
   - Main dashboard: `http://localhost:9000/`
   - Documentation: `http://localhost:9000/documentation`
   - Health status: `http://localhost:9000/health`

## Route Configuration

Create JSON files in the `routes` directory with the following structure:

```json
{
  "urlContext": "/api",
  "backend": "backend-server:8080",
  "removePrefix": "/api",
  "addPrefix": "/v1",
  "log": true,
  "timeout": 5000,
  "ignoreTimeout": ["/api/health", "/api/status"],
  "cors": {
    "origin": "*",
    "methods": "GET,HEAD,PUT,PATCH,POST"
  },
  "security": {
    "frameguard": true,
    "xssFilter": true
  }
}
```

See the documentation page for detailed configuration options.

## License

This project is licensed under the GNU General Public License v2.0 - see the [LICENSE](LICENSE) file for details.