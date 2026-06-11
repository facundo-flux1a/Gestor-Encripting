const fs = require('fs');
const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');

const models = {};
let currentModel = null;

const lines = schema.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (line.startsWith('model ')) {
    currentModel = line.split(' ')[1];
    models[currentModel] = [];
  } else if (line.startsWith('}')) {
    currentModel = null;
  } else if (currentModel && lines[i-1] && lines[i-1].includes('/// @encrypted')) {
    const fieldName = line.split(/\s+/)[0];
    if (fieldName) {
      models[currentModel].push(fieldName);
    }
  }
}

console.log(JSON.stringify(models, null, 2));
