import json, time, urllib.request, urllib.parse, sys, math
UA={"User-Agent":"buergerbus-prototype/0.1"}
cache={}
def q(street, extra=""):
    key=street+extra
    if key in cache: return cache[key]
    p={"street":street,"city":"Wehr","postalcode":"79664","country":"de","format":"jsonv2","limit":10,"polygon_geojson":1}
    url="https://nominatim.openstreetmap.org/search?"+urllib.parse.urlencode(p)
    r=json.load(urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=30)); time.sleep(1.1)
    cache[key]=r; return r
def free(text):
    url="https://nominatim.openstreetmap.org/search?"+urllib.parse.urlencode({"q":text+", Wehr","format":"jsonv2","limit":5,"viewbox":"7.85,47.66,7.96,47.58","bounded":1})
    r=json.load(urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=30)); time.sleep(1.1); return r
def coords(res):
    pts=[]
    for x in res:
        g=x.get("geojson",{})
        if g.get("type")=="LineString": pts+=g["coordinates"]
        elif g.get("type")=="MultiLineString":
            for l in g["coordinates"]: pts+=l
        else: pts.append([float(x["lon"]),float(x["lat"])])
    return pts
def d(a,b): return math.hypot((a[0]-b[0])*math.cos(math.radians(47.6)),a[1]-b[1])*111000
def cross(s1,s2):
    A=coords(q(s1)); B=coords(q(s2))
    if not A or not B: return None
    best=min(((d(a,b),a,b) for a in A for b in B))
    return [round((best[1][0]+best[2][0])/2,6),round((best[1][1]+best[2][1])/2,6)], round(best[0])
if __name__=="__main__":
    cmd=sys.argv[1]
    if cmd=="x": print(cross(sys.argv[2],sys.argv[3]))
    elif cmd=="s": r=q(sys.argv[2]); print([(x["display_name"][:60],x["lat"],x["lon"]) for x in r][:3])
    else: print([(x["display_name"][:90],x["lat"],x["lon"]) for x in free(sys.argv[2])])
