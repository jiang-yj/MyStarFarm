"""Map the supplied workbook to stable gameplay ids. Missing balance values use provisional defaults."""
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1];path=root/'src/data/catalog.json'
data=json.loads(path.read_text());book=json.loads((root/'src/data/workbook-items.json').read_text())
ids=['coffee','rice','tulip','parsnip','orangeCarrot','greenBean','blueJazz','garlic','potato','kale','berry','cauliflower','rhubarb','ancient','hops','wheat','pepper','summerSquash','blueberry','corn','tomato','sunflower','carrot','summerSpangle','taro','poppy','melon','redCabbage','starfruit','eggplant','broccoli','cranberry','grape','bokChoy','beet','amaranth','yam','artichoke','fairyRose','pumpkin','sweetGemBerry','powdermelon','qiFruit','tea','cactusFruit']
fishids=['commonCarp','herring','smallmouthBass','anchovy','sunfish','sardine','redSnapper','silverCarp','shad','bullhead','largemouthBass','ghostfish','halibut','woodskip','flounder','legend']
animalids=['chicken','duck','rabbit','cow','sheep','pig','voidChicken']
legacy={key:data['crops'][key] for key in ['carrot','corn','berry','ancient']}
assets={'workbook-sprout':book['sprout']['path'],'animal-chicken-static':'/art/items/chicken-static.png'};crops={};items={}
assert len(fishids)==len(book['fish']), 'Add stable ids for all workbook fish'
for n,(id,row) in enumerate(zip(ids,book['crops'])):
 old=legacy.get(id);minutes=[10,15,20,30,45,60,90,120,180,240][min(n//5,9)]
 price=20+(n//5)*15+(n%5)*5;sell=price*2;duration=minutes*60000;exp=5+n//4
 if old: price,sell,duration,exp=old['price'],old['sell'],old['duration'],old['exp']
 itemicon='crop-'+id; matureicon='crop-'+id+'-mature'; assets[itemicon]=row['item']['path'];assets[matureicon]=row['mature']['path']
 crops[id]={'name':row['name'],'icon':itemicon,'seedIcon':itemicon,'matureIcon':matureicon,'sproutIcon':'workbook-sprout','seed':id+'Seed','price':price,'sell':sell,'duration':duration,'exp':exp,'sourceRow':row['row']}
 items[id]={'name':row['name'],'icon':itemicon,'sell':sell};items[id+'Seed']={'name':row['name']+'种子','icon':itemicon,'sell':price//2}
data['crops']=crops
fish={}
for n,(id,row) in enumerate(zip(fishids,book['fish'])):
 ico='fish-'+id;assets[ico]=row['image']['path'];price=65+n*10
 fish[id]={'name':row['name'],'icon':ico,'price':price,'sell':price*2,'duration':14400000}
for id,f in fish.items():
 items[id]={'name':f['name'],'icon':f['icon'],'sell':f['sell']};items[id+'Fry']={'name':f['name']+'苗','icon':f['icon'],'sell':f['price']//2}
data['fish']=fish
products=[('egg','鸡蛋',65),('duckEgg','鸭蛋',85),('rabbitFur','兔毛',130),('milk','牛奶',160),('wool','羊毛',150),('truffle','松露',220),('voidEgg','虚空鸡蛋',200)]
prices=[180,260,420,500,600,850,1000];durations=[3600000,3600000,7200000,10800000,10800000,14400000,14400000]
animals={}
for n,(id,row,(product,name,sell)) in enumerate(zip(animalids,book['animals'],products)):
 ico='animal-'+id;assets[ico]=row['image']['path']
 animals[id]={'name':row['name'],'icon':ico,'price':prices[n],'product':product,'duration':durations[n],'sell':sell}
 producticon='product-'+product;assets[producticon]=row['product']['image']['path']
 items[product]={'name':row['product']['name'],'icon':producticon,'sell':sell}
data['animals']=animals;items['hay']={'name':'饲料','icon':'hay','sell':2};data['items']=items
for item in data['mystery']:
 if item['id']=='ancientSeed':item.update(name='上古水果种子',icon=crops['ancient']['seedIcon'])
data['mystery']=[item for item in data['mystery'] if item['id']!='koiFry']
data['fishingPool']=[{'id':id,'weight':4} for id in fishids]
newquests=[('potato','炖汤的土豆','小镇食堂',4),('tomato','红彤彤的沙拉','小镇食堂',4),('tulip','送给春天的花','花店阿禾',3),('wheat','面包出炉啦','面包师朵朵',5),('blueberry','蓝莓小甜点','面包师朵朵',3),('commonCarp','小镇鲜鱼宴','钓鱼爷爷',2)]
for quest in data['quests']:
 if quest['item']=='carp':quest['item']='commonCarp'
questids={q['id'] for q in data['quests']}
for id,name,npc,count in newquests:
 if id not in questids:data['quests'].append({'id':id,'name':name,'npc':npc,'item':id,'count':count,'gold':items[id]['sell']*count,'medals':4,'exp':25,'hours':48})
path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
(root/'src/data/item-assets.json').write_text(json.dumps(assets,ensure_ascii=False,indent=2)+'\n')
print(f"Catalog: {len(crops)} crops, {len(fish)} fish (workbook), {len(animals)} animals, {len(items)} inventory items")
