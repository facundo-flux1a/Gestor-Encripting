const fs = require('fs');
const path = require('path');

const directories = [
  './src/workers',
  './src/services',
  './src/lib',
  './src/app/api',
  './src/components'
];

// Removed emoji regex, matches most emojis used
const emojiRegex = /[🍪🧠📦✅❌⚠️🔄🚀💾📊📝🏢🛒💰⏳🔑📬📄📅🎯🔧💡🌐🎫🎉🔥⛔🚫🚨❗❓✨🏥📋🔍🏆✂🖼🛑⏱️]/g;

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.js')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      if (emojiRegex.test(content)) {
        // Clean up emojis and trailing/leading spaces left behind
        content = content.replace(emojiRegex, '');
        // We might have double spaces now, but that's fine.
        fs.writeFileSync(fullPath, content);
        console.log('Cleaned emojis in:', fullPath);
      }
    }
  }
}

for (const dir of directories) {
  if (fs.existsSync(dir)) {
    processDirectory(dir);
  }
}
console.log('Done cleaning emojis.');
