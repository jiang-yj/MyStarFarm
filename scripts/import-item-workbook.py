"""Read WPS DISPIMG references; copy original embedded bytes without modifying images."""
import json,re,zipfile,posixpath,hashlib
from pathlib import Path
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT.parent/'物品分类.xlsx'
NS={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main','xdr':'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing','a':'http://schemas.openxmlformats.org/drawingml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
with zipfile.ZipFile(SOURCE) as z:
 strings=[''.join(n.itertext()) for n in ET.fromstring(z.read('xl/sharedStrings.xml'))]
 cells={}
 for c in ET.fromstring(z.read('xl/worksheets/sheet1.xml')).findall('.//s:c',NS):
  v=c.find('s:v',NS); f=c.find('s:f',NS)
  if c.get('t')=='s' and v is not None: cells[c.get('r')]=strings[int(v.text)]
  elif f is not None: cells[c.get('r')]=f.text
  elif v is not None: cells[c.get('r')]=v.text
 rels={n.get('Id'):n.get('Target') for n in ET.fromstring(z.read('xl/_rels/cellimages.xml.rels')) if n.get('TargetMode')!='External'}
 images={}
 for pic in ET.fromstring(z.read('xl/cellimages.xml')).findall('.//xdr:pic',NS):
  prop=pic.find('.//xdr:cNvPr',NS);blip=pic.find('.//a:blip',NS)
  target=posixpath.normpath('xl/'+rels[blip.get('{'+NS['r']+'}embed')]); raw=z.read(target)
  filename=Path(target).name.lower();(ROOT/'public/art/items'/filename).write_bytes(raw)
  images[prop.get('name')]={'path':'/art/items/'+filename,'description':prop.get('descr',''),'sha256':hashlib.sha256(raw).hexdigest()}
 def image(cell):
  match=re.search(r'ID_[A-Fa-f0-9]+',cells.get(cell,''))
  if not match or match[0] not in images: raise ValueError('Missing image: '+cell)
  return {**images[match[0]],'cell':cell,'imageId':match[0]}
 result={'source':SOURCE.name,'sheet':'Sheet1','sprout':image('D2'),'crops':[{'name':cells['B'+str(r)],'row':r,'item':image('C'+str(r)),'mature':image('D'+str(r))} for r in range(4,49)],'fish':[{'name':cells['G'+str(r)],'row':r,'image':image('H'+str(r))} for r in range(4, max(int(re.sub(r'\D','',c)) for c in cells if re.fullmatch(r'G\d+',c) and cells[c] != '鱼类名称') + 1)],'animals':[{'name':cells['K'+str(r)],'row':r,'image':image('L'+str(r)),'product':{'name':cells['M'+str(r)],'image':image('N'+str(r))}} for r in range(4,11)]}
 (ROOT/'src/data/workbook-items.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'crops':len(result['crops']),'fish':len(result['fish']),'animals':len(result['animals']),'sprout':result['sprout'],'firstCrop':result['crops'][0]},ensure_ascii=False,indent=2))
