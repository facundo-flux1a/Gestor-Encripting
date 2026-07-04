import re

with open('diff_report.txt', 'r') as f:
    content = f.read()

files = content.split('==== src/')
for block in files[1:]:
    lines = block.split('\n')
    filename = 'src/' + lines[0].replace(' ====', '').strip()
    
    # Check if there are meaningful changes beyond just Prisma migration
    meaningful = False
    for line in lines:
        if line.startswith('+') or line.startswith('-'):
            if not line.startswith('+++') and not line.startswith('---'):
                if 'prisma' not in line.lower() and 'db.query' not in line and 'RowDataPacket' not in line:
                    meaningful = True
                    break
    
    if meaningful:
        print(f"File with potential logical diff: {filename}")
