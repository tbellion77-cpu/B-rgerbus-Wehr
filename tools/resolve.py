import json, geo
S={
"hauptstr":("Wehr Hauptstr./Seniorenresidenz",("x","Hauptstraße","Talstraße"),"~"),
"elektro":("Elektro-Center",("x","Hauptstraße","Talstraße"),"~"),
"talstr":("Talstraße",("s","Talstraße"),""),
"famz":("Familienzentrum",("p",47.6236091,7.9019929),""),
"aerzte_sued":("Ärztehaus Bündtenfeldstraße / Süd",("p",47.6218,7.9033),""),
"aerzte_nord":("Ärztehaus Bündtenfeldstraße / Nord",("p",47.6222,7.9037),""),
"dinkelberg":("Enkendorfstr./Abzw. Dinkelbergstr.",("x","Enkendorfstraße","Dinkelbergstraße"),""),
"brunnmatt":("Enkendorfstr./Abzw. Brunnmattstr.",("x","Enkendorfstraße","Brunnmattstraße"),""),
"sbg":("Enkendorfstraße Haltestelle SBG",("x","Enkendorfstraße","Öflinger Straße"),"~"),
"buchen_hoelzle":("Buchenweg/Am Hölzle",("x","Buchenweg","Am Hölzle"),""),
"eichen_birken":("Eichenweg/Birkenweg",("x","Eichenweg","Birkenweg"),""),
"birken_buchen":("Birkenweg/Buchenweg",("x","Birkenweg","Buchenweg"),""),
"novartis":("Novartis / Rewe / Aldi",("p",47.61972,7.90560),""),
"mediathek":("Mediathek",("p",47.6262605,7.9062470),""),
"meier_wald":("Meierhof-/Waldstr.",("x","Meierhofstraße","Waldstraße"),""),
"meier_staufen":("Meierhof-/Staufenstr.",("x","Meierhofstraße","Staufenstraße"),""),
"meier_hachberg":("Meierhof-/Hachbergstr.",("x","Meierhofstraße","Hachbergstraße"),""),
"vonschoenau":("Von-Schönau-Str.",("p",47.6272,7.9127),""),
"ekz":("Einkaufszentrum / Ärztehaus",("p",47.6302871,7.9048554),""),
"zelg_anfang":("Anfang Zelgstraße",("p",47.6348926,7.9029877),"~"),
"zelg_rs":("Zelgstraße Realschule",("p",47.6379943,7.9031172),"~"),
"finken":("Finkenweg / Mettlerweg",("x","Finkenweg","Mettlerweg"),""),
"mettler":("Mettler-/Blumenweg /Görlitzer Straße",("x","Mettlerweg","Blumenweg"),""),
"haydn":("Joseph-Haydn-Str. Spielplatz",("s","Joseph-Haydn-Straße"),""),
"seeb_mozart":("Seeboden-/Mozartstraße",("x","Seebodenstraße","Mozartstraße"),""),
"seeb_bifang":("Seebodenstraße/Bifangweg",("x","Seebodenstraße","Bifangweg"),""),
"seeb_bandol":("Seeboden-/Bandolstraße",("x","Seebodenstraße","Bandolstraße"),""),
"friedrich":("Friedrichstraße",("p",47.6331529,7.9042501),""),
"wald_werrach":("Wald-/Werrachstr.",("x","Waldstraße","Werrachstraße"),""),
"werrach_schloss":("Werrachstr./Unterer Schlossweg",("x","Werrachstraße","Unterer Schloßweg"),""),
"werrach_lind":("Werrach-/Lindstr.",("x","Werrachstraße","Lindstraße"),""),
"werrach_klingen":("Werrach-/Klingenstr.",("x","Werrachstraße","Klingenstraße"),""),
"schwimmbad":("Schwimmbad",("p",47.6362427,7.9114008),""),
"todtmoos_klingen":("Todtmooser Str./Klingenstraße",("x","Todtmooser Straße","Klingenstraße"),""),
"kirche":("Katholische Kirche",("p",47.6295144,7.9012888),""),
"henkel":("Fa. Henkel",("p",47.6085,7.9100),"~"),
"knebelhalde":("Kreuzmattstr./Abzw. Zur Knebelhalde",("x","Kreuzmattstraße","Zur Knebelhalde"),""),
"diakonie":("Paul-Gräb-Str. / Diakonie",("p",47.5995188,7.9154243),""),
"tagespflege":("Wehrastraße / Tagespflege",("p",47.5957267,7.9126556),""),
"oefl_schule":("Öflingen Schule",("p",47.5924488,7.9133205),""),
"kulturm":("KulTurm / Kiga St. Michael",("p",47.5903,7.9122),"~"),
"kinderarzt":("Kinderarzt / Basler Straße",("x","Basler Straße","Wehratalstraße"),"~"),
"brennet":("Basler Straße / Bahnhof Brennet",("p",47.5822835,7.9107255),""),
"brennetweg":("Brennetweg / Riedstraße",("x","Brennetweg","Riedstraße"),""),
"wehratal_kiga":("Wehratalstraße / Kiga St. Michael",("p",47.5897123,7.9125727),""),
"dorfladen":("Jungholzer Straße / Dorfladen",("p",47.5915161,7.9145086),""),
"uhland":("Uhlandstr./Abzw. Goethestr.",("x","Uhlandstraße","Goethestraße"),""),
"goethe_schiller":("Goethestr./Abzw.Schillerstr.",("x","Goethestraße","Schillerstraße"),""),
"goethe_schmad":("Goethestr./Abzw. Schmadstr.",("x","Goethestraße","Schmadstraße"),""),
"sonnhalde":("Sonnhalde",("p",47.5955409,7.9186725),""),
"wehratal_diak":("Wehratalstraße / Diakonie",("x","Wehratalstraße","Paul-Gräb-Straße"),""),
"hemmet":("Wehr Hemmet/B 518",("p",47.6069121,7.9138779),""),
}
out={}
for k,(name,m,flag) in S.items():
    try:
        if m[0]=="p": c=[m[2],m[1]]; dist=0
        elif m[0]=="x":
            r=geo.cross(m[1],m[2]); c,dist=(r if r else (None,None))
        else:
            pts=geo.coords(geo.q(m[1])); c=pts[len(pts)//2] if pts else None; dist=0
    except Exception as e: c=None; dist=str(e)
    out[k]={"name":name,"lon":c and round(c[0],6),"lat":c and round(c[1],6),"approx":bool(flag) or (isinstance(dist,(int,float)) and dist>60)}
    print(k, c, dist, flag)
json.dump(out,open("../data/stops.raw.json","w"),ensure_ascii=False,indent=1)
