'use strict';

// Test tooling, not production code: a browser-like cookie jar and a foreign loopback origin that hands out
// Set-Cookie attempts. Cookies are scoped by host name only, never by port, exactly like a real browser jar,
// so a cookie handed out by one 127.0.0.1 listener is sent to every other 127.0.0.1 listener.
const http = require('node:http');

class CookieJar {
  constructor() {
    this.cookies = new Map();
    this.storeLog = [];
  }

  store(url, setCookieHeaders) {
    const { hostname, port } = new URL(url);
    const names = [];
    for (const header of setCookieHeaders) {
      const [pair] = header.split(';');
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator).trim();
      this.cookies.set(`${hostname}|${name}`, pair.slice(separator + 1).trim());
      names.push(name);
    }
    if (names.length) this.storeLog.push({ port: Number(port), names });
  }

  headerFor(url) {
    const { hostname } = new URL(url);
    const pairs = [...this.cookies].filter(([key]) => key.startsWith(`${hostname}|`)).map(([key, value]) => `${key.split('|')[1]}=${value}`);
    return pairs.length ? pairs.join('; ') : null;
  }
}

// A fetch that behaves like a cookie-carrying browser: it sends whatever the jar holds and stores every Set-Cookie.
function jarFetch(jar, record = []) {
  return async (url, init = {}) => {
    const absolute = new URL(url).href;
    const cookie = jar.headerFor(absolute);
    record.push({ url: absolute, init, cookie });
    const response = await fetch(absolute, { ...init, headers: { ...init.headers, ...(cookie ? { Cookie: cookie } : {}) } });
    jar.store(absolute, response.headers.getSetCookie());
    return response;
  };
}

// The foreign origin names a destination, an identity, an affinity and a session, all conflicting on purpose.
async function startDecoyOrigin() {
  const server = http.createServer((request, response) => {
    const [, destination, client] = /^\/set\/([a-z-]+)\/([a-z-]+)$/.exec(request.url) || [];
    response.writeHead(204, {
      'Set-Cookie': [
        `c032_destination=${destination}; Path=/`,
        `c032_client=${client}; Path=/`,
        `ARRAffinity=synthetic-affinity-${destination}; Path=/`,
        'session=synthetic-session-decoy; Path=/'
      ]
    });
    response.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: server.address().port, origin: `http://127.0.0.1:${server.address().port}`,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

module.exports = Object.freeze({ CookieJar, jarFetch, startDecoyOrigin });
