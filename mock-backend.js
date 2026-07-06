const http = require('http');
const fs = require('fs');

let data;
try {
  data = JSON.parse(fs.readFileSync('mock-backend.json', 'utf8'));
} catch (err) {
  data = {};
}

const server = http.createServer((req, res) => {
  const correlationId = req.headers['x-correlation-id'] || req.headers['x-request-id'] || 'no-id';
  
  // Imprimir log con el ID de correlación
  console.log(`[${correlationId}] ${req.method} ${req.url}`);
  
  // CORS y cabeceras
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Correlation-ID', correlationId);

  // Parse path simple
  const path = req.url.split('?')[0].replace(/^\/|\/$/g, '');
  const parts = path.split('/');
  const resource = parts[0];

  if (resource === 'health' || path === 'ping') {
    res.statusCode = 200;
    return res.end(JSON.stringify({ status: 'ok', mock: true }));
  }

  if (data[resource]) {
    res.statusCode = 200;
    // Si piden un ID (/users/1) devolvemos el primer elemento para simular
    if (parts.length > 1 && Array.isArray(data[resource])) {
      return res.end(JSON.stringify(data[resource][0] || {}));
    }
    return res.end(JSON.stringify(data[resource]));
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: "Not found" }));
});

const PORT = 4000;
server.listen(PORT, () => {
  console.log(`Mock Backend (Native) is running on http://localhost:${PORT}`);
  console.log(`Intercepting requests to log X-Correlation-ID headers...`);
});
