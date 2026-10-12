"""Build only reviewed public assets for this repository's GitHub Pages entry."""
from pathlib import Path
import base64
import hashlib
import json
import runpy

root = Path(__file__).resolve().parent.parent
built = runpy.run_path(str(root / 'scripts/build.py'))
output = root / 'docs'
output.mkdir(exist_ok=True)
endpoint = 'https://r4lxq8tmi6.feishuapp.com/app/app_17fvb4dy65y/public/consult'
files = {}
for route, asset in built['assets'].items():
    name = 'index.html' if route == '/' else route.lstrip('/')
    content = base64.b64decode(asset['data'])
    if name == 'app.js':
        source = content.decode()
        assert source.count("fetch('/api/consult',") == 1
        content = source.replace("fetch('/api/consult',", f"fetch('{endpoint}',").encode()
    if name == 'index.html':
        source = content.decode()
        policy = "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self' https://r4lxq8tmi6.feishuapp.com; form-action 'self'; base-uri 'none'"
        source = source.replace('<head>', '<head><meta http-equiv="Content-Security-Policy" content="' + policy + '">', 1)
        source = source.replace('v=20261012-responsive', 'v=20261012-pages')
        content = source.encode()
    target = output / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
    files[name] = hashlib.sha256(content).hexdigest()
(output / '.nojekyll').write_text('')
(output / 'pages-release.json').write_text(json.dumps({'files': files, 'consultEndpoint': endpoint}, indent=2) + '\n')
print(f'Built {len(files)} reviewed static resources in docs/; cookie-free form API configured')
