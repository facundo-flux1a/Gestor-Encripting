#!/usr/bin/env node
/**
 * Verifica campo `retencion` en GET /api/v1/documents/full
 * Uso: node --env-file=.env scripts/test-retencion-curl.mjs
 */
import crypto from 'crypto';
import mysql from 'mysql2/promise';

const BASE_URL = (process.env.BASE_URL || 'http://localhost:9002').replace(/\/$/, '');
const EMPRESA_ID = Number(process.env.EMPRESA_ID || 64);
const USER_ID = Number(process.env.USER_ID || 6);
const AÑO = process.env.AÑO || '2026';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL no definida');
  process.exit(1);
}

const rawKey = `muvail_curltest_${Date.now()}`;
const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
const keyPrefix = rawKey.slice(0, 14);

const conn = await mysql.createConnection(process.env.DATABASE_URL);
let keyId = null;

try {
  const [insert] = await conn.query(
    `INSERT INTO api_keys (nombre, key_hash, key_prefix, empresa_id, usuario_id, activa)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [`curl-test-retencion-${Date.now()}`, keyHash, keyPrefix, EMPRESA_ID, USER_ID]
  );
  keyId = insert.insertId;

  const endpoints = [
    `${BASE_URL}/api/v1/documents/full?año=${encodeURIComponent(AÑO)}`,
    `${BASE_URL}/api/v1/documents?año=${encodeURIComponent(AÑO)}`,
  ];

  for (const url of endpoints) {
    console.log('---');
    console.log('GET', url);
    console.log(`curl -sS -H "X-Api-Key: ${rawKey}" "${url}" | jq '.data[] | select(.retencion != 0) | {id, numero_documento, retencion, importe_total}'`);
    console.log('');

    const res = await fetch(url, { headers: { 'X-Api-Key': rawKey } });
    const text = await res.text();
    console.log('HTTP', res.status);

    if (!res.ok) {
      console.log(text.slice(0, 500));
      continue;
    }

    const json = JSON.parse(text);
    const docs = json.data || [];
    const withRet = docs.filter((d) => Number(d.retencion) !== 0);
    const r690 = withRet.filter((d) => Math.abs(Number(d.retencion) - 6.9) < 0.01);

    console.log('total:', docs.length);
    console.log('campo retencion en todos:', docs.every((d) => Object.prototype.hasOwnProperty.call(d, 'retencion')));
    console.log('con retencion != 0:', withRet.length);
    console.log('con retencion 6.90:', r690.length);

    if (r690.length) {
      console.log('ejemplos 6.90:', JSON.stringify(r690.slice(0, 3).map((d) => ({
        id: d.id,
        numero_documento: d.numero_documento,
        retencion: d.retencion,
        importe_total: d.importe_total,
      })), null, 2));
    } else if (withRet.length) {
      console.log('ejemplos retencion:', JSON.stringify(withRet.slice(0, 5).map((d) => ({
        id: d.id,
        numero_documento: d.numero_documento,
        retencion: d.retencion,
      })), null, 2));
    }
  }
} finally {
  if (keyId) {
    await conn.query('UPDATE api_keys SET activa = 0 WHERE id = ? AND usuario_id = ?', [keyId, USER_ID]);
    console.log('API key temporal revocada (id', keyId + ')');
  }
  await conn.end();
}
