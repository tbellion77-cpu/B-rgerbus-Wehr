"""Erzeugt buergerbus/index.html: src/app.html + data/network.json + MapLibre-CSS in einer Datei."""
import json, pathlib, urllib.request
root = pathlib.Path(__file__).resolve().parent.parent
html = (root/"src/app.html").read_text()
net = json.loads((root/"data/network.json").read_text())
cssf = root/"tools/.maplibre-gl-4.7.1.css"
if not cssf.exists():
    cssf.write_bytes(urllib.request.urlopen("https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css").read())
html = html.replace("/*__MAPLIBRE_CSS__*/", cssf.read_text())
html = html.replace("/*__NETWORK__*/", json.dumps(net, ensure_ascii=False, separators=(",",":")).replace("</","<\\/"))
# Artifact-Fassung (Gerüst wird beim Veröffentlichen ergänzt) und eigenständige Seite
(root/"tools/.artifact.html").write_text(html)
page = ('<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<style>body{margin:0}[hidden]{display:none!important}</style>\n</head>\n<body>\n' + html + '\n</body>\n</html>\n')
(root/"index.html").write_text(page)
print("index.html", len(page)//1024, "KB")
