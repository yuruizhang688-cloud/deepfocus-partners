from pathlib import Path
import json, base64, hashlib, re, shutil

root = Path(__file__).resolve().parent.parent
text = (root / 'source-plan.md').read_text()
row = re.search(r'^\| 代理费金额 \| 人民币([\d,]+)元 \| 人民币([\d,]+)元 \|$', text, re.M)
assert row
num = lambda s: int(s.replace(',', ''))
c = {'deposit': num(re.search(r'金额为\*\*人民币([\d,]+)元', text).group(1)), 'feeFirst': num(row[1]), 'feeSecond': num(row[2])}
for key, name in [('first','一级合伙人直接成交'),('second','二级合伙人直接成交'),('override','一级获得二级成交提成'),('feeReward','一级获得二级代理费提成')]:
    line = next(l for l in text.splitlines() if l.startswith('| '+name+' |'))
    c[key] = int(re.search(r'\| (\d+)% \|',line)[1])
assert '| 合作期限 | 1年 | 1年 |' in text
assert f'代理费提成为{c["feeSecond"]*c["feeReward"]/100:,.0f}元' in text
page = (root/'web/index.html').read_text()
values = {k:f'{v:,}' if k.startswith('fee') or k=='deposit' else str(v) for k,v in c.items()}
values.update(reward=f'{c["feeSecond"]*c["feeReward"]/100:,.0f}',totalSecond=str(c['second']+c['override']),termsJSON=json.dumps(c,ensure_ascii=False))
values.update(firstWidth=str(c['first']*27),firstLabelX=str(220+c['first']*13.5),secondWidth=str(c['second']*27),secondLabelX=str(220+c['second']*13.5),overrideX=str(220+c['second']*27),overrideWidth=str(c['override']*27),overrideLabelX=str(220+c['second']*27+c['override']*13.5))
for k,v in values.items(): page=page.replace('{{'+k+'}}',v)
assert not re.search(r'\{\{.+?\}\}',page),'未替换的生成参数'
dist=root/'dist'
if dist.exists(): shutil.rmtree(dist)
(dist/'server').mkdir(parents=True); (dist/'.openai').mkdir()
shutil.copy2(root/'.openai/hosting.json',dist/'.openai/hosting.json')
assets = {'/': {'mime':'text/html; charset=utf-8','data':base64.b64encode(page.encode()).decode()}}
for path in (root/'web').rglob('*'):
    if not path.is_file() or path.name=='index.html': continue
    mime={'.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2','.pdf':'application/pdf','.txt':'text/plain; charset=utf-8'}.get(path.suffix,'application/octet-stream')
    assets['/'+str(path.relative_to(root/'web'))]={'mime':mime,'data':base64.b64encode(path.read_bytes()).decode()}
bundle='const ASSETS = '+json.dumps(assets,separators=(',',':'))+';\n'+(root/'worker/index.js').read_text()
(dist/'server/index.js').write_text(bundle)
(root/'terms.json').write_text(json.dumps(c,indent=2)+'\n')
(root/'source.sha256').write_text(hashlib.sha256(text.encode()).hexdigest()+'\n')
print('Built external Site Worker; '+str(len(assets))+' embedded public assets; terms '+json.dumps(c))
