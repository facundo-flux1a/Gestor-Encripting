import re

with open('diff_report.txt', 'r') as f:
    content = f.read()

files = content.split('==== src/')
for block in files[1:]:
    lines = block.split('\n')
    filename = 'src/' + lines[0].replace(' ====', '').strip()
    
    missing_lines = []
    for line in lines:
        # Looking for lines that exist in PROD but not in TEST
        # (Lines starting with '-' and not immediately followed by '---' which is the file header)
        if line.startswith('-') and not line.startswith('---'):
            # Filter out lines that are clearly SQL or raw DB related, as they were replaced by Prisma
            text = line[1:].strip()
            if not text: continue
            if 'db.query' in text or 'pool.query' in text or 'connection.query' in text: continue
            if 'SELECT ' in text or 'UPDATE ' in text or 'INSERT ' in text or 'DELETE ' in text: continue
            if 'FROM ' in text or 'WHERE ' in text or 'JOIN ' in text: continue
            if 'RowDataPacket' in text: continue
            if 'import db ' in text or 'import pool ' in text or 'import connection ' in text: continue
            
            # If it's a structural change related to raw SQL removal (like array destructuring [rows]), skip
            if re.match(r'^const\s+\[\w+\]\s*=\s*await', text): continue
            
            missing_lines.append(text)
            
    if missing_lines:
        print(f"--- {filename} ---")
        for ml in missing_lines[:10]:
            print(f"- {ml}")
        if len(missing_lines) > 10:
            print(f"... and {len(missing_lines)-10} more lines")
        print()
