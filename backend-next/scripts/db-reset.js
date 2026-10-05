#!/usr/bin/env node
// Drop and recreate the throwaway test database (port 54329 cluster only).
const { Client } = require('pg');
(async () => {
  const c = new Client({ host: 'localhost', port: 54329, user: 'postgres', database: 'postgres' });
  await c.connect();
  await c.query('DROP DATABASE IF EXISTS levoy WITH (FORCE)');
  await c.query('CREATE DATABASE levoy OWNER levoy');
  await c.end();
  console.log('database levoy recreated');
})().catch(e => { console.error(e); process.exit(1); });
