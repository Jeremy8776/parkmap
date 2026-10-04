# Data sources and licences

The code is MIT (see `LICENSE`). The data is not ours. Everything the map shows is derived from the sources below, and each keeps its own licence and attribution rule. If you reuse `docs/tiles/` or the data inside `docs/index.html`, you take on these terms.

| Source | Used for | Licence and what you must do |
|---|---|---|
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | Road geometry, TfL `operator` tag, access tags, bays, charge points, kerb restrictions, private land areas | ODbL 1.0. Credit "OpenStreetMap contributors". **Share-alike:** a database derived from OSM data (our tiles are one) must be offered under ODbL too. |
| Newham Council open data (ArcGIS): highway boundary, controlled parking zones, estate hard surface, borough boundary | Which roads are adopted, zone shapes and hours, council estate land | Published by Newham Council on its open data site. We understand this to be the Open Government Licence v3.0, but check each layer's own licence before reuse. Credit "Newham Council". |
| Newham pay-by-phone location lists (xlsx, per zone) | Pay-by-phone bays, hours and maximum stay | Published on newham.gov.uk. Not committed here: `fetch_region.py zones` downloads them. Facts only (street, hours, maximum stay) are carried into the page. |
| HM Land Registry INSPIRE index polygons (via planning.data.gov.uk) | A weak ownership signal, Gallions Reach area only | OGL v3.0. "Contains HM Land Registry data © Crown copyright and database right." |
| The Gazette, notice 2879566 (2017 Beckton CPZ extension) | Cross-check of controlled and permit-only streets | OGL v3.0. |
| TfL Unified API | Which road corridors TfL lists (A13 only is confirmed) | TfL Open Data terms. "Powered by TfL Open Data". |
| Newham Parking Policy and Procedures (Oct 2025) | TfL road list, fine levels, estate rules | Read for facts only. The document is not redistributed. |
| Operator sites (Gallions Reach Shopping Park, Beckton Gateway) | Car park time limits | Facts read from the public pages. Limits can change. Check the signs. |

## Map background

The map background is Esri's World Light Gray, Dark Gray, Street and Imagery tile services, loaded live from `server.arcgisonline.com`. Esri's terms apply, and they can require an Esri account or key for heavy or commercial use. If this project grows, swap the background for a provider whose terms you have accepted. The base layers are defined in `js/30-map.js` (`BASES`).

## What we did not use

Parkopedia and AppyParking were looked at as design references only. None of their data, prices, hours or text is used or copied.

## Accuracy

Road ownership beyond the council's own adopted-highway map is **inferred**, and bay rules are inferred from the road and zone, because no public dataset records either per bay. Every road carries the evidence behind its classification and a confidence level, and the app shows it. The sign on the street always wins.
