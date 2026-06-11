const fs = require('fs');
const file = 'src/services/document-service.ts';
let content = fs.readFileSync(file, 'utf8');

// Add helper at the top if not exists
if (!content.includes('const serializeData =')) {
  content = content.replace(
    "import { DocumentEntity } from '@/types/company';",
    "import { DocumentEntity } from '@/types/company';\n\nconst serializeData = (data: any) => JSON.parse(JSON.stringify(data, (k, v) => typeof v === 'bigint' ? Number(v) : v));"
  );
}

// Replace JSON.parse(JSON.stringify(X)) with serializeData(X)
content = content.replace(/JSON\.parse\(JSON\.stringify\(([^)]+)\)\)/g, 'serializeData($1)');

// Also replace console.log JSON.stringify to use the replacer
content = content.replace(/JSON\.stringify\(([^,]+),\s*null,\s*2\)/g, "JSON.stringify($1, (k, v) => typeof v === 'bigint' ? Number(v) : v, 2)");

fs.writeFileSync(file, content);
console.log("Replaced successfully!");
