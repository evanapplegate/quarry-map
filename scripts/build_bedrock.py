"""Build the bedrock vector tiles: reads data/bedrock_625k_england.gpkg (EPSG:27700), reprojects to WGS84,
bakes in the colours from the categorised style in quarry_map.qgz, writes /tmp/bedrock.geojson.
Run from the project root, then tile it:
  python3 scripts/build_bedrock.py
  tippecanoe -e data/bedrock_tiles -l bedrock -Z0 -z10 --no-tile-compression --coalesce-densest-as-needed --detect-shared-borders --simplification=4 /tmp/bedrock.geojson"""
import sqlite3,struct,json,math,zipfile,io
import xml.etree.ElementTree as ET
# colors from the QGIS categorized renderer
r=ET.parse(io.BytesIO(zipfile.ZipFile('quarry_map.qgz').read('quarry_map.qgs'))).getroot(); colors={}
for m in r.find('projectlayers'):
    if m.findtext('datasource','').startswith('./data/bedrock_625k_england') and m.find('renderer-v2').get('type')=='categorizedSymbol':
        rv=m.find('renderer-v2'); syms={s.get('name'):s for s in rv.find('symbols')}
        for c in rv.find('categories'):
            col=[o.get('value') for o in syms[c.get('symbol')].iter('Option') if o.get('name')=='color']
            if col: colors[c.get('value')]='#%02x%02x%02x'%tuple(int(v) for v in col[0].split(',')[:3])
# OSGB36 / British National Grid -> WGS84 (inverse TM on Airy 1830 + Helmert, ~5 m)
a,b=6377563.396,6356256.909; F0=0.9996012717; lat0=math.radians(49); lon0=math.radians(-2); N0,E0=-100000,400000
e2=1-b*b/(a*a); n=(a-b)/(a+b)
def M(lat):
    return b*F0*((1+n+5/4*n**2+5/4*n**3)*(lat-lat0)-(3*n+3*n**2+21/8*n**3)*math.sin(lat-lat0)*math.cos(lat+lat0)+(15/8*n**2+15/8*n**3)*math.sin(2*(lat-lat0))*math.cos(2*(lat+lat0))-35/24*n**3*math.sin(3*(lat-lat0))*math.cos(3*(lat+lat0)))
def en2ll(E,N):
    lat=lat0; m=0
    while True:
        lat=(N-N0-m)/(a*F0)+lat; m=M(lat)
        if abs(N-N0-m)<1e-4: break
    s=math.sin(lat); nu=a*F0/math.sqrt(1-e2*s*s); rho=a*F0*(1-e2)/(1-e2*s*s)**1.5; eta2=nu/rho-1; t=math.tan(lat); c=1/math.cos(lat); dE=E-E0
    VII=t/(2*rho*nu); VIII=t/(24*rho*nu**3)*(5+3*t*t+eta2-9*t*t*eta2); IX=t/(720*rho*nu**5)*(61+90*t*t+45*t**4)
    X=c/nu; XI=c/(6*nu**3)*(nu/rho+2*t*t); XII=c/(120*nu**5)*(5+28*t*t+24*t**4); XIIA=c/(5040*nu**7)*(61+662*t*t+1320*t**4+720*t**6)
    lat=lat-VII*dE**2+VIII*dE**4-IX*dE**6; lon=lon0+X*dE-XI*dE**3+XII*dE**5-XIIA*dE**7
    s=math.sin(lat); nu=a/math.sqrt(1-e2*s*s)
    x=nu*math.cos(lat)*math.cos(lon); y=nu*math.cos(lat)*math.sin(lon); z=nu*(1-e2)*s
    tx,ty,tz=446.448,-125.157,542.060; sc=-20.4894e-6; rx,ry,rz=(math.radians(v/3600) for v in (0.1502,0.2470,0.8421))
    x2=tx+(1+sc)*x-rz*y+ry*z; y2=ty+rz*x+(1+sc)*y-rx*z; z2=tz-ry*x+rx*y+(1+sc)*z
    A,B=6378137.0,6356752.3141; E2=1-B*B/(A*A); p=math.hypot(x2,y2); la=math.atan2(z2,p*(1-E2))
    for _ in range(6):
        nu=A/math.sqrt(1-E2*math.sin(la)**2); la=math.atan2(z2+E2*nu*math.sin(la),p)
    return [round(math.degrees(math.atan2(y2,x2)),5),round(math.degrees(la),5)]
def wkb(buf,o):
    bo='<' if buf[o]==1 else '>'; t,=struct.unpack_from(bo+'I',buf,o+1); o+=5
    dims=2+(1 if (t&0x80000000 or 1000<=t%10000<2000 or t%10000>=3000) else 0)+(1 if (t&0x40000000 or t%10000>=2000) else 0); t=(t&0xffff)%1000
    def ring(o):
        k,=struct.unpack_from(bo+'I',buf,o); o+=4; pts=[]
        for i in range(k):
            x,y=struct.unpack_from(bo+'dd',buf,o); o+=8*dims; pts.append(en2ll(x,y))
        return pts,o
    if t==3:
        k,=struct.unpack_from(bo+'I',buf,o); o+=4; rings=[]
        for i in range(k): rg,o=ring(o); rings.append(rg)
        return {'type':'Polygon','coordinates':rings},o
    if t==6:
        k,=struct.unpack_from(bo+'I',buf,o); o+=4; polys=[]
        for i in range(k): g,o=wkb(buf,o); polys.append(g['coordinates'])
        return {'type':'MultiPolygon','coordinates':polys},o
    raise ValueError(t)
c=sqlite3.connect('data/bedrock_625k_england.gpkg'); fs=[]; miss=set()
for g,i,d,rd,per in c.execute('select geom,LEX_RCS_I,LEX_RCS_D,RCS_D,MAX_PERIOD from bedrock'):
    flags=g[3]; env=[0,32,48,48,64][(flags>>1)&7]
    geom,_=wkb(g,8+env)
    if i not in colors: miss.add(i)
    fs.append({'type':'Feature','geometry':geom,'properties':{'unit':d,'rock':rd,'period':per,'color':colors.get(i,'#888888')}})
json.dump({'type':'FeatureCollection','features':fs},open('/tmp/bedrock.geojson','w'))
print(len(fs),'features',len(colors),'colors','missing:',miss)
