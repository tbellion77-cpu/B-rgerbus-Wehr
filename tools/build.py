"""Baut data/network.json: Haltestellen, Linien (Fahrzeit-Offsets laut Fahrplan Stand März 2024), Routengeometrie via OSRM."""
import json, urllib.request, time
stops=json.load(open("../data/stops.raw.json"))
stops["hauptstr"].update(lon=7.90490,lat=47.62625,approx=True)
stops["elektro"].update(lon=7.90474,lat=47.62760,approx=True)
stops["henkel"].update(lon=7.91054,lat=47.61141,approx=True)  # auf Öflinger Straße, genaue Lage unbekannt
L={
"1":{"name":"Linie 1: Enkendorf/Hölzle","color":"#2f6fdb","stops":[
 ("hauptstr",0),("elektro",1),("talstr",2),("famz",3),("aerzte_sued",4),("dinkelberg",5),("brunnmatt",6),("sbg",7),
 ("buchen_hoelzle",9),("eichen_birken",10),("birken_buchen",11),("buchen_hoelzle",12),("sbg",15),("novartis",16),
 ("aerzte_nord",17),("famz",18),("talstr",19),("elektro",20),("hauptstr",21)]},
"2":{"name":"Linie 2: Meierhof","color":"#1f8a5b","stops":[
 ("hauptstr",22),("mediathek",23),("meier_wald",24),("meier_staufen",25),("meier_hachberg",26),("vonschoenau",27),
 ("meier_wald",28),("mediathek",29),("hauptstr",30)]},
"3":{"name":"Linie 3: Zelg/Seeboden","color":"#c2362f","stops":[
 ("hauptstr",31),("ekz",33),("zelg_anfang",34),("zelg_rs",35),("finken",36),("mettler",37),("haydn",39),("seeb_mozart",40),
 ("seeb_bifang",41),("seeb_bandol",42),("friedrich",43),("ekz",44),("hauptstr",46)]},
"4":{"name":"Linie 4: Breitmatt","color":"#9b3fb5","stops":[
 ("hauptstr",47),("mediathek",48),("wald_werrach",49),("werrach_schloss",50),("werrach_lind",50),("werrach_klingen",51),
 ("schwimmbad",52),("todtmoos_klingen",53),("ekz",54),("kirche",55),("elektro",56),("hauptstr",58)]},
"5":{"name":"Linie 5: Kreuzmatt/Öflingen","color":"#d9822b","stops":[
 ("hauptstr",60),("aerzte_sued",62),("dinkelberg",63),("brunnmatt",64),("sbg",65),("henkel",66),("knebelhalde",67),
 ("diakonie",69),("tagespflege",70),("oefl_schule",71),("kulturm",72),("kinderarzt",74),("brennet",75),("brennetweg",76),
 ("wehratal_kiga",77),("dorfladen",79),("uhland",80),("goethe_schiller",81),("goethe_schmad",82),("sonnhalde",83),
 ("wehratal_diak",84),("hemmet",85),("sbg",87),("novartis",88),("aerzte_nord",89),("famz",90),("talstr",91),("elektro",92),("hauptstr",92)]},
}
for k,l in L.items():
    seq=[stops[s] for s,_ in l["stops"]]
    coords=";".join(f'{p["lon"]},{p["lat"]}' for p in seq)
    url=f"https://router.project-osrm.org/route/v1/driving/{coords}?overview=false&steps=true&geometries=geojson&continue_straight=false"
    r=json.load(urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"buergerbus-prototype/0.1"}),timeout=60)); time.sleep(1)
    legs=[]
    for leg in r["routes"][0]["legs"]:
        g=[]
        for st in leg["steps"]:
            for c in st["geometry"]["coordinates"]:
                c=[round(c[0],6),round(c[1],6)]
                if not g or g[-1]!=c: g.append(c)
        legs.append(g)
    l["legs"]=legs; l["km"]=round(r["routes"][0]["distance"]/1000,1)
    l["stops"]=[{"id":s,"t":t} for s,t in l["stops"]]
    print(k,l["km"],"km")
# Umläufe: jede Runde startet an der Hauptstraße mit Linie 1; Linie 5 (+60 min) nicht in jeder Runde
rounds={"mwf":[{"start":"08:00","l5":True},{"start":"10:00","l5":False},{"start":"11:00","l5":True}],
        "tt":[{"start":"14:00","l5":True},{"start":"16:00","l5":False},{"start":"17:00","l5":True}]}
net={"source":"BürgerBus Wehr – Ihr Fahrplan, Stand März 2024 (wehr.de)","note":"Haltestellen-Koordinaten aus OpenStreetMap ermittelt; mit 'approx' markierte bitte vor Ort prüfen.",
     "stops":stops,"lines":L,"rounds":rounds,"days":{"mwf":[1,3,5],"tt":[2,4]}}
json.dump(net,open("../data/network.json","w"),ensure_ascii=False,separators=(",",":"))
