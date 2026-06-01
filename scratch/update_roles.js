const fs = require('fs');

let content = fs.readFileSync('src/services/document-service.ts', 'utf8');

// 1. getDocumentsByProviderName
content = content.replace(
  /export async function getDocumentsByProviderName\(\s*fiscalId: string,\s*empresaIds\?: number\[\]\s*\): Promise<Document\[\]> {/,
  `export async function getDocumentsByProviderName(\n  fiscalId: string,\n  empresaIds?: number[],\n  roles: string[] = ['proveedor', 'emisor']\n): Promise<Document[]> {`
);

// 2. getProviderByFiscalId
content = content.replace(
  /export async function getProviderByFiscalId\(fiscalId: string\): Promise<DocumentEntity \| null> {/,
  `export async function getProviderByFiscalId(fiscalId: string, roles: string[] = ['proveedor', 'emisor']): Promise<DocumentEntity | null> {`
);
content = content.replace(
  /WHERE identificador_fiscal = \? AND\(rol = 'proveedor' OR rol = 'emisor'\)/,
  "WHERE identificador_fiscal = ? AND rol IN (${roles.map(r => `'${r}'`).join(',')})"
);

// 3. getProductsByProviderName
content = content.replace(
  /export async function getProductsByProviderName\(\s*fiscalId: string,\s*empresaIds\?: number\[\]\s*\): Promise<DocumentLine\[\]> {/,
  `export async function getProductsByProviderName(\n  fiscalId: string,\n  empresaIds?: number[],\n  roles: string[] = ['proveedor', 'emisor']\n): Promise<DocumentLine[]> {`
);

// 4. getAllProductLinesByProviderName
content = content.replace(
  /export async function getAllProductLinesByProviderName\(\s*fiscalId: string,\s*empresaIds\?: number\[\]\s*\): Promise<DocumentLine\[\]> {/,
  `export async function getAllProductLinesByProviderName(\n  fiscalId: string,\n  empresaIds?: number[],\n  roles: string[] = ['proveedor', 'emisor']\n): Promise<DocumentLine[]> {`
);

// 5. getProductHistory
content = content.replace(
  /export async function getProductHistory\(\s*providerFiscalId: string,\s*identifier: string,\s*searchBy: 'code' \| 'description' = 'code',\s*descriptionFilter\?: string\s*\): Promise<{ productInfo: DocumentLine \| null, history: DocumentLine\[\] }> {/,
  `export async function getProductHistory(\n  providerFiscalId: string,\n  identifier: string,\n  searchBy: 'code' | 'description' = 'code',\n  descriptionFilter?: string,\n  roles: string[] = ['proveedor', 'emisor']\n): Promise<{ productInfo: DocumentLine | null, history: DocumentLine[] }> {`
);

// 6. getProviderAnalytics
content = content.replace(
  /export async function getProviderAnalytics\(\s*fiscalId: string,\s*empresaIds\?: number\[\]\s*\): Promise<ProviderAnalyticsData \| null> {/,
  `export async function getProviderAnalytics(\n  fiscalId: string,\n  empresaIds?: number[],\n  roles: string[] = ['proveedor', 'emisor']\n): Promise<ProviderAnalyticsData | null> {`
);
content = content.replace(
  /const provider = await getProviderByFiscalId\(fiscalId\);/,
  "const provider = await getProviderByFiscalId(fiscalId, roles);"
);

// Replace the hardcoded role check in the queries (there are 5 instances)
content = content.replaceAll(
  "AND(ed.rol = 'proveedor' OR ed.rol = 'emisor')",
  "AND ed.rol IN (${roles.map(r => `'${r}'`).join(',')})"
);

fs.writeFileSync('src/services/document-service.ts', content);
console.log('document-service.ts updated successfully');
