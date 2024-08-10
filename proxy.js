const cluster = require('cluster');
const os = require('os');
const fs = require('fs');
const http = require('http');
const httpProxy = require('http-proxy');
const path = require('path');

if (cluster.isMaster) {
    const numCPUs = os.cpus().length;
    const numWorkers = numCPUs * 2;

    console.log(`Master ${process.pid} is running`);

    for (let i = 0; i < numWorkers; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died`);
        cluster.fork();
    });
} else {
    const proxy = httpProxy.createProxyServer({
        proxyTimeout: 60000,
        secure: false
    });

    const settingsPath = path.resolve(__dirname, 'settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

    const server = http.createServer((req, res) => {
        const hostname = req.headers.host.split(':')[0];
        const domainConfig = settings.domains[hostname];

        if (!domainConfig || !domainConfig.enabled) {
            res.writeHead(404);
            res.end('Domain is disabled or not found');
            return;
        }

        proxy.web(req, res, {
            target: domainConfig.backend,
            secure: domainConfig.tls ? domainConfig.verifySSL : false
        }, (err) => {
            if (err) {
                console.error('Proxy error:', err);
                res.writeHead(502, { 'Content-Type': 'text/plain' });
                res.end('Bad gateway');
            }
        });
    });

    server.listen(80, () => {
        console.log(`Worker ${process.pid} is running proxy on port 80`);
    });

    process.on('uncaughtException', (err) => {
        console.error('Uncaught exception:', err);
        process.exit(1);
    });
}
