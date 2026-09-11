const globalThis = require('./fireyejs1.234.24.js');
let encoded =globalThis.__fyModule.getUBHeader();
const decoded = decodeURIComponent(encoded);
console.log(decoded);