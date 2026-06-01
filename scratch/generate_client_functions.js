const fs = require('fs');

const lines = fs.readFileSync('src/services/document-service.ts', 'utf8').split('\n');

function extractAndModify(startLine, endLine, replaceRules) {
  // Line numbers are 1-indexed, array is 0-indexed
  let text = lines.slice(startLine - 1, endLine).join('\n');
  
  for (const rule of replaceRules) {
    if (rule.type === 'replaceAll') {
      text = text.replaceAll(rule.search, rule.replace);
    } else {
      text = text.replace(rule.search, rule.replace);
    }
  }
  return text;
}

// 1. getDocumentsByProviderName (Lines 2052-2090)
const getDocsStr = extractAndModify(2052, 2090, [
  { search: 'getDocumentsByProviderName', replace: 'getDocumentsByClientName', type: 'replaceAll' },
  { search: "ed.rol = 'proveedor' OR ed.rol = 'emisor'", replace: "ed.rol = 'cliente' OR ed.rol = 'receptor'", type: 'replace' }
]);

// 2. getProviderByFiscalId (Lines 2092-2117)
const getClientStr = extractAndModify(2092, 2117, [
  { search: 'getProviderByFiscalId', replace: 'getClientByFiscalId', type: 'replaceAll' },
  { search: "rol = 'proveedor' OR rol = 'emisor'", replace: "rol = 'cliente' OR rol = 'receptor'", type: 'replace' }
]);

// 3. getProductsByProviderName (Lines 2119-2218)
const getProdsStr = extractAndModify(2119, 2218, [
  { search: 'getProductsByProviderName', replace: 'getProductsByClientName', type: 'replaceAll' },
  { search: "ed.rol = 'proveedor' OR ed.rol = 'emisor'", replace: "ed.rol = 'cliente' OR ed.rol = 'receptor'", type: 'replace' }
]);

// 4. getAllProductLinesByProviderName (Lines 2220-2283)
const getAllProdsStr = extractAndModify(2220, 2283, [
  { search: 'getAllProductLinesByProviderName', replace: 'getAllProductLinesByClientName', type: 'replaceAll' },
  { search: "ed.rol = 'proveedor' OR ed.rol = 'emisor'", replace: "ed.rol = 'cliente' OR ed.rol = 'receptor'", type: 'replace' }
]);

// 5. getProviderAnalytics (Lines 2376-2523)
const getAnalyticsStr = extractAndModify(2376, 2523, [
  { search: 'getProviderAnalytics', replace: 'getClientAnalytics', type: 'replaceAll' },
  { search: 'getProviderByFiscalId', replace: 'getClientByFiscalId', type: 'replaceAll' },
  { search: "ed.rol = 'proveedor' OR ed.rol = 'emisor'", replace: "ed.rol = 'cliente' OR ed.rol = 'receptor'", type: 'replaceAll' }
]);

const appendContent = `\n\n// ==========================================\n// CLIENT FUNCTIONS (Duplicated from Providers)\n// ==========================================\n\n` + 
  [getClientStr, getDocsStr, getProdsStr, getAllProdsStr, getAnalyticsStr].join('\n\n') + '\n';

fs.appendFileSync('src/services/document-service.ts', appendContent);
console.log('Appended client functions successfully using exact lines!');
