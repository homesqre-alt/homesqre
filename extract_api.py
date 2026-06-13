import os, re

res = set()
pattern = re.compile(r'api\.(get|post|put|patch|delete)\(([`\'\"].*?[`\'\"])')
src_dir = r'p:\HOMESQRE CLONE\homesqre\frontend\src'

for root, _, files in os.walk(src_dir):
    for file in files:
        if file.endswith(('.js', '.jsx', '.ts', '.tsx')):
            with open(os.path.join(root, file), 'r', encoding='utf-8') as f:
                content = f.read()
                matches = pattern.findall(content)
                for method, url in matches:
                    res.add(f'{method.upper()} {url}')

with open(r'p:\HOMESQRE CLONE\homesqre\frontend_api_calls.txt', 'w') as out:
    for i in sorted(list(res)):
        out.write(f"{i}\n")
