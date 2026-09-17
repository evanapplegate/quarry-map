# Quarry map

MapLibre map of English building-stone quarries (BGS Building Stone Database for England) over BGS 1:625k bedrock geology, with 3D terrain on a globe.

- `index.html`: the map
- `basemap_style.json`: Esri Dark Gray Canvas vector style plus terrain and hillshade
- `data/quarries.geojson`, `data/bedrock_tiles/`, `data/bedrock_key.json`: built data
- `scripts/`: rebuilds the data from the source files (not in this repo)

Labels render in Optima from the viewer's installed fonts, with a sans-serif fallback elsewhere.

Data: British Geological Survey © UKRI. Basemap: Esri. Terrain: Mapzen terrain tiles on AWS.
