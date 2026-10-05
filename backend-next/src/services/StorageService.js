'use strict';

const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const integrations = require('../config/integrations');
const { UPLOADS_DIR, ROOT_DIR } = require('../config/upload');

// Where uploaded files really live.
//   STORAGE_DRIVER=local (default)  files stay under backend-next/uploads
//   STORAGE_DRIVER=r2               files are kept in Cloudflare R2; the local copy is only a cache
//
// Callers keep using the relative path they always stored ("/uploads/recordings/x.m4a"): that path is
// the object key (under the "levoy/" prefix, because the bucket is shared with other products), and the
// local file is made on demand. So switching drivers needs no database change.
const PREFIX = 'levoy/';
const TYPES = { '.m4a': 'audio/mp4', '.amr': 'audio/amr', '.3gp': 'audio/3gpp', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.weba': 'audio/webm',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.csv': 'text/csv', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

class StorageService {
  driver() { return process.env.STORAGE_DRIVER === 'r2' && integrations.r2() ? 'r2' : 'local'; }

  // "/uploads/exports/a.xlsx" → "levoy/uploads/exports/a.xlsx"; refuses anything outside /uploads or with "..".
  key(rel) {
    const clean = String(rel || '').replace(/\\/g, '/');
    if (!clean.startsWith('/uploads/') || clean.includes('..') || clean.includes('//') || clean.length > 400) throw new Error(`Refusing storage path ${rel}`);
    return PREFIX + clean.slice(1);
  }

  abs(rel) {
    this.key(rel);                                   // validates
    const p = path.resolve(ROOT_DIR, rel.replace(/^\/+/, ''));
    if (!p.startsWith(path.resolve(UPLOADS_DIR) + path.sep)) throw new Error(`Refusing storage path ${rel}`);
    return p;
  }

  client() {
    if (!this._s3) {
      const { S3Client } = require('@aws-sdk/client-s3');
      this._s3 = new S3Client({
        region: 'auto', endpoint: process.env.R2_ENDPOINT, forcePathStyle: true,
        credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
      });
    }
    return this._s3;
  }

  contentType(rel) { return TYPES[path.extname(rel).toLowerCase()] || 'application/octet-stream'; }

  // A file was just written under uploads/: move it to the driver's real home.
  async persist(rel) {
    if (this.driver() !== 'r2') return;
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const file = this.abs(rel);
    await this.client().send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME, Key: this.key(rel), Body: fs.createReadStream(file), ContentLength: fs.statSync(file).size, ContentType: this.contentType(rel),
    }));
    fs.unlinkSync(file);                              // R2 now holds it; the cache is rebuilt on demand
  }

  // Write bytes that never came from an upload (exports, backups).
  async putBuffer(rel, buffer, contentType) {
    if (this.driver() === 'r2') {
      const { PutObjectCommand } = require('@aws-sdk/client-s3');
      await this.client().send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: this.key(rel), Body: buffer, ContentType: contentType || this.contentType(rel) }));
      return;
    }
    const file = this.abs(rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buffer);
  }

  // Make sure the file exists locally (downloading it from R2 if needed) and return its absolute path, or null.
  async ensureLocal(rel) {
    const file = this.abs(rel);
    if (fs.existsSync(file)) return file;
    if (this.driver() !== 'r2') return null;
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    try {
      const r = await this.client().send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: this.key(rel) }));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = file + '.part';
      await pipeline(r.Body, fs.createWriteStream(tmp));
      fs.renameSync(tmp, file);
      return file;
    } catch (e) {
      if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  }

  async getBuffer(rel) {
    const f = await this.ensureLocal(rel);
    return f ? fs.readFileSync(f) : null;
  }

  async exists(rel) { return !!(await this.ensureLocal(rel)); }

  async remove(rel) {
    let file; try { file = this.abs(rel); } catch { return; }
    try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch { /* already gone */ }
    if (this.driver() === 'r2') {
      const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
      await this.client().send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: this.key(rel) }));
    }
  }

  // Drop cached copies older than `maxAgeHours` (only meaningful with R2 — the local driver's files ARE the data).
  sweepCache(maxAgeHours = 24) {
    if (this.driver() !== 'r2') return 0;
    let removed = 0;
    const cutoff = Date.now() - maxAgeHours * 3600_000;
    const walk = dir => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (fs.statSync(p).mtimeMs < cutoff) { try { fs.unlinkSync(p); removed++; } catch { /* in use */ } }
      }
    };
    if (fs.existsSync(UPLOADS_DIR)) walk(UPLOADS_DIR);
    return removed;
  }
}

module.exports = new StorageService();
