from pathlib import Path
import json,base64
root=Path(__file__).resolve().parent.parent
web=root/'client/partner-site'
assets={}
for p in web.rglob('*'):
    if not p.is_file() or p.name=='terms.json': continue
    key='/' if p.name=='index.html' else '/'+str(p.relative_to(web))
    mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'}.get(p.suffix,'application/octet-stream')
    assets[key]={'mime':mime,'data':base64.b64encode(p.read_bytes()).decode()}
(root/'server/modules/partners/assets.ts').write_text('export const ASSETS: Record<string,{mime:string;data:string}> = '+json.dumps(assets,separators=(',',':'))+';\n')
print('Embedded reviewed partner page and',len(assets)-1,'public assets')
