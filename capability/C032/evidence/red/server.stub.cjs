'use strict';

// Loadable naive stub kept as the RED subject. It is the cookie-session design this card guards against:
// it trusts cookies and query parameters, invents a default identity and sets a sticky destination cookie.
// It is never required by production code or by the GREEN suites.
const http = require('node:http');

const destinations = {
  blue: { id: 'synthetic-destination-blue', version: '1.0.0' },
  green: { id: 'synthetic-destination-green', version: '2.0.0' }
};
const known = {
  'c032-synthetic-opaque-alpha-0001': 'synthetic-client-alpha',
  'c032-synthetic-opaque-beta-0002': 'synthetic-client-beta'
};

function cookiesOf(header) {
  const jar = {};
  for (const part of String(header || '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name) jar[name] = value.join('=');
  }
  return jar;
}

function createLocalServer() {
  const served = new Map();
  return http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname !== '/api/v1/observation') {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      return response.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'No such path.' } }));
    }
    const cookies = cookiesOf(request.headers.cookie);
    const bearer = /^Bearer (\S+)$/.exec(request.headers.authorization || '');
    const client = known[bearer && bearer[1]] || cookies.c032_client || 'synthetic-client-alpha';
    const counter = (served.get(client) || 0) + 1;
    served.set(client, counter);
    const planned = counter <= 2 ? destinations.blue : destinations.green;
    const wanted = url.searchParams.get('destination') || cookies.c032_destination || planned.id;
    const destination = Object.values(destinations).find((item) => item.id === wanted) || planned;
    response.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': `c032_destination=${destination.id}; Path=/`,
      'X-C032-Destination': destination.id
    });
    response.end(JSON.stringify({
      apiContract: 'cookieless-observation/1', businessData: 'synthetic',
      client: { id: client }, destination, state: { counter }, stamp: 'C032-loopback-r1'
    }));
  });
}

module.exports = Object.freeze({ createLocalServer });
