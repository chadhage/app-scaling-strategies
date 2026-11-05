'use strict';

const { BlobServiceClient } = require('@azure/storage-blob');
const { ManagedIdentityCredential } = require('@azure/identity');
const { fail } = require('./contract.cjs');

class BlobStore {
  constructor(accountUrl, container) {
    this.container = new BlobServiceClient(accountUrl, new ManagedIdentityCredential()).getContainerClient(container);
  }

  async ready() {
    await this.container.getProperties();
  }

  async get(key) {
    const client = this.container.getBlockBlobClient(key);
    try {
      const response = await client.download();
      if (response.contentLength > 65536) throw fail('oversized-state', 'Stored demo state exceeds its limit.', 500);
      const chunks = [];
      let size = 0;
      for await (const chunk of response.readableStreamBody) {
        size += chunk.length;
        if (size > 65536) throw fail('oversized-state', 'Stored demo state exceeds its limit.', 500);
        chunks.push(chunk);
      }
      return { value: JSON.parse(Buffer.concat(chunks).toString('utf8')), etag: response.etag };
    } catch (error) {
      if (error.statusCode === 404) return null;
      throw error;
    }
  }

  async put(key, value, etag = null) {
    const body = JSON.stringify(value);
    if (Buffer.byteLength(body) > 65536) throw fail('oversized-state', 'Demo state exceeds its limit.');
    try {
      const result = await this.container.getBlockBlobClient(key).upload(body, Buffer.byteLength(body), {
        conditions: etag ? { ifMatch: etag } : { ifNoneMatch: '*' },
        blobHTTPHeaders: { blobContentType: 'application/json' }
      });
      return result.etag;
    } catch (error) {
      if (error.statusCode === 409 || error.statusCode === 412) {
        throw fail('state-conflict', 'Another writer changed this state; no update was applied.', 409);
      }
      throw error;
    }
  }
}

module.exports = { BlobStore };
