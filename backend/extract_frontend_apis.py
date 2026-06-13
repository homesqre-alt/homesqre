import os, re, json
front_apis = set()
for root, _, files in os.walk(r'p:\HOMESQRE CLONE\homesqre\frontend\src'):
    for f in files:
        if f.endswith('.js') or f.endswith('.jsx'):
            with open(os.path.join(root, f), 'r', encoding='utf-8') as file:
                content = file.read()
                matches = re.findall(r'api\.(get|post|put|patch|delete)\([\'\"\`]?(/[\w\-\/]+)', content)
                for method, path in matches:
                    front_apis.add(f'{method.upper()} {path}')
print(json.dumps(list(front_apis), indent=2))
