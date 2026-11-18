const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, 'index.html');
const port = Number(process.env.PORT || 3000);
http.createServer((req,res)=>{
 if(req.url === '/health'){res.writeHead(200,{'Content-Type':'text/plain'});return res.end('OK');}
 if(req.url === '/' || req.url === '/index.html'){
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(500);return res.end('Internal error');}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'});res.end(data);});
 }else{res.writeHead(404);res.end('Not found');}
}).listen(port,'0.0.0.0',()=>console.log('Bayroq Quest listening on '+port));
