"""Build data/quarries.geojson from data/bsde_quarries.geojson: slim properties, normalise status,
and classify rock type from the BSDE stone names (edit RULES to change the classes).
Run from the project root: python3 scripts/build_quarries.py"""
import json,collections,re,sys
# (family, class, keywords) - first match wins; tested on the parent stone group first, then on all stone names
RULES=[
 ('Igneous','Granite',['granite','granodiorite','elvan','diorite','lamprophyre']),
 ('Igneous','Volcanic & dolerite',['volcanic','greenstone','whin','dolerite','basalt','dhustone','clee hill','tuff','dyke','lizard','intrusi','hurdwick','malvern stone','serpentin']),
 ('Limestone','Chalk',['chalk','clunch','totternhoe']),
 ('Other','Flint, chert & sarsen',['flint','chert','sarsen','puddingstone','cobble','boulder','gravel']),
 ('Other','Ironstone & carstone',['ironstone','big carr','small carr','carstone','northampton sand','ferricrete','marlstone']),
 ('Limestone','Magnesian limestone',['magnesian']),
 ('Limestone','Carboniferous limestone',['carboniferous limestone','tyne limestone','alston formation limestone','great scar','great limestone','yoredale limestone','black rock limestone','clitheroe','chatburn','pendleside','middop','lower limestone shales','stainmore formation limestone','vobster','bampton limestone','westleigh','coppice limestone','hallwill']),
 ('Limestone','Portland & Purbeck',['portland','purbeck','chilmark']),
 ('Limestone','Lias limestone',['lias','ham stone','barnstone']),
 ('Limestone','Jurassic oolitic limestone',['oolite','bath stone','lincolnshire limestone','blisworth','forest marble','birdlip','chipping norton','taynton','cornbrash','corallian','white limestone','todber','cotswold','doulting','stonesfield','collyweston',"king's cliffe",'wellingborough','hampen','osmington','middle jurassic','tilestone',"fuller's earth",'helmdon','scarborough limestone','salperton','highworth','aston limestone','freestone','dogger limestone','rutland formation','stanion','weldon','alwalton','cucklington']),
 ('Limestone','Other limestone',['limestone','marble','ragstone','tufa','cementstone','septaria','calcspar','spar','alabaster','gypsum']),
 ('Slate','Slate & phyllite',['slate','phyllite','killas','schist','windermere','skiddaw','tavy','bedruthan',"jacket's",'burraton','liddaton','lydford','shale','mudstone']),
 ('Sandstone','Millstone Grit',['millstone grit','namurian','stainmore formation']),
 ('Sandstone','Coal Measures sandstone',['coal measures','pennant','milnrow','warwickshire group','halesowen','keele','enville','salop','mangotsfield','etruria','barren red']),
 ('Sandstone','Other Carboniferous sandstone',['carboniferous sandstone','yoredale sandstone','border group','ballagan','culm','bude','alston formation sandstone','cromhall','downend','minn sandstone','hatherleigh','cheddleton','hurdlow','harlow hill']),
 ('Sandstone','Permo-Triassic sandstone',['sherwood','keuper','permo-triassic','triassic','bunter','skerry','mottled','bridgnorth','bromsgrove','grinshill','arden','new red','waterstones','exeter group','pebble beds','budleigh','breccia','wildmoor','hopwas','collyhurst','mercia','north curry','redcliffe','dolomitic conglomerate','alveley','malpas','nottinghamshire']),
 ('Sandstone','Old Red & Devonian sandstone',['old red','brownstone','downton castle','meadfoot sandstone','pickwell down','hangman','staddon','dartmouth group sandstone','tintern','baggy','raglan','wiveliscombe','trehills']),
 ('Sandstone','Jurassic & Cretaceous sandstone',['wealden','greensand','hythe','bargate','sandrock','saltwick','scalby','cloughton','estuarine','dogger sandstone','kellaways','tunbridge wells','wadhurst','woburn','folkestone','malmstone','ravenscar','staithes','bognor','eastbourne','nettlestone','reading beds','kingsthorpe']),
 ('Sandstone','Lower Palaeozoic sandstone',['greywacke','ludlow','coniston','hoar edge','chatwall','bailey hill','clun stone','bayston','whitcliffe','horton flags','cheney longville','quartzite','hartshill','mytton','may hill','comley','bridges sandstone','austwick','acton scott','weston flags','whittery','hollybush','nordon','portscatho','grampound']),
 ('Sandstone','Other sandstone',['sandstone','grit','flag','rock','delph','sand']),
]
clean=lambda s: re.sub(r'\s*#\d+','',s or '').lower()
def classify(p):
    names=[p.get('STONE_NAME%d'%i) for i in range(1,11)]; names=[n for n in names if n and n!='_']
    parent=clean(names[0].split('*')[-1]) if names else ''
    full=clean(' '.join(names))+' '+(p.get('STONE_NAMES') or '').lower()
    for s in (parent,full):
        for fam,cls,kws in RULES:
            if any(k in s for k in kws): return fam,cls
    return 'Other','Unclassified'

if __name__=='__main__':
    main={'Active','Inactive','Dormant','Historic','Ceased'}
    d=json.load(open('data/bsde_quarries.geojson')); fs=[]; n=collections.Counter()
    for f in d['features']:
        p=f['properties']; q={k:p[k].strip() for k in ['PIT_NAME','ALTERNATIVE_NAME','STONE_NAMES','MPA_NAME'] if isinstance(p.get(k),str) and p[k].strip() not in ('','-','_')}
        st=p.get('quarryStatus'); q['status']=st if st in main else 'Other'
        if st and st not in main: q['status_detail']=st
        q['family'],q['rock']=classify(p)
        if st=='Active': n[q['rock']]+=1
        x,y=f['geometry']['coordinates'][:2]
        fs.append({'type':'Feature','geometry':{'type':'Point','coordinates':[round(x,5),round(y,5)]},'properties':q})
    json.dump({'type':'FeatureCollection','features':fs},open('data/quarries.geojson','w'),separators=(',',':'))
    print(len(fs),'quarries; active by class:',dict(n))
