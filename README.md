# ParkMap

**Who owns the road, who enforces parking, and when does the permit zone apply?**

ParkMap is a free, open-source parking guide for Newham, London. Pick a road and a planned stay to see its likely ownership, enforcement, permit-zone hours, ticket information and the evidence behind the answer. Detailed parking rules currently cover Newham only.

### [⬇ Download ParkMap for Android (v0.2.0 APK)](https://github.com/Jeremy8776/parkmap/releases/download/v0.2.0/parkmap-v0.2.0-debug.apk)

*Debug-signed test build, not a Play Store release. [How to install](#get-it) · [Other releases](../../releases)*

> **Check the signs before parking.** ParkMap is a guide based on open data, not a guarantee that you can park. A permit zone being off does not override yellow lines, loading restrictions or bay signs. See [Accuracy and limits](#accuracy-and-limits).

## What it does

- **Roads and enforcement.** See whether a road appears to be TfL-managed, Newham-adopted or private/unadopted. The card shows the sources and how confident the classification is.
- **Your whole stay.** Choose a day, time and duration (1h, 2h, 4h or all day), or use Now, This evening or Overnight. ParkMap checks whether the permit zone overlaps your stay and when it next starts or ends.
- **Zones, bays and lines.** See Newham's 41 permit zones, pay-by-phone bays, limited-stay bays and mapped kerb markings. Some bay types are inferred, so check the street signs.
- **Map cues.** A blue ring means the permit zone is off for your chosen stay; amber means it is running or a car park's limit may be exceeded. Neither means a spot is safe or free to use.
- **Nearby places and GPS.** Find bays and car parks near your position. If GPS places you off a mapped road, ParkMap shows the nearest road and its distance, but its rules may not apply where you stand.
- **Tickets and offline use.** Find penalty amounts, discount windows and appeal routes for TfL, Newham and private operators. Roads and rules are bundled in the app; the map background needs a connection. The phone layout supports light and dark modes.

## Get it

**Android:** Use the [APK download above](https://github.com/Jeremy8776/parkmap/releases/download/v0.2.0/parkmap-v0.2.0-debug.apk), then open the downloaded file. If Android prompts you, allow your browser to install unknown apps. This is a test build; it installs separately from the earlier Newham Parking APK.

**Updates:** Starting with the next signed release, the Android app checks GitHub Releases when opened and offers to download a newer APK. ParkMap checks the APK's SHA-256 digest, then Android asks you to confirm installation. It cannot install silently. The v0.2.0 debug APK was signed with a different key, so it must be uninstalled once before installing the first signed release; subsequent signed releases can update in place. Do not uninstall until that release is available.

**Web and iPhone:** The web app is prepared for GitHub Pages at `https://jeremy8776.github.io/parkmap/`, but is **not published yet**. Once deployed from `prod`, it can be added to a phone's home screen. There is no separate iPhone app.

## How it works

```
sources/fetch_region.py   download raw open data into data/region/ (OSM, Newham ArcGIS, pay-by-phone lists, TfL)
build.py                  classify roads, cross-reference sources, infer bays, cut into tiles, write docs/
docs/                     the built site: index.html, tiles/, service worker, manifest. GitHub Pages and the APK serve this
js/ ui.css template.html  the app source, concatenated into docs/index.html
android/                  Capacitor wrapper that bundles docs/ into an APK
tests/                    Python and JavaScript unit tests
```

Road classification is a vote across independent sources (OpenStreetMap tags, Newham's adopted-highway map, the 2017 Gazette traffic order notice, Land Registry parcels, the TfL API, Newham's TfL road list). Every road keeps its votes, so the card can show who agreed and who didn't. Data is cut into small tiles that load as you pan, drawn in batches so the map stays smooth.

### Build it yourself

You need Python 3.11+ and Node 20+ (JDK 17 and the Android SDK only for the APK).

```bash
git clone https://github.com/Jeremy8776/parkmap
cd parkmap

python sources/fetch_region.py arc zones osm tfl   # download source data (about 45 MB, needs network, takes a few minutes)
python sources/fetch_pd.py                         # Land Registry parcels for the Gallions Reach area
python build.py                                    # writes docs/

python -m http.server -d docs 8000                 # then open http://localhost:8000
```

Tests: `python -m unittest discover -s tests && node tests/rules.test.js`

Android: `npm install && npx cap sync android && cd android && ./gradlew assembleDebug`. The APK lands in `android/app/build/outputs/apk/debug/`.

## Accuracy and limits

Be honest about what this is:

- **Ownership is inferred.** No public dataset says who owns every road. TfL roads and Newham's adopted highway are solid. "Private or unadopted" means *no adopted-highway boundary was found*, and newer adoptions can be missing. About a fifth of roads have sources that disagree, and the card says so.
- **Bay rules are inferred.** OpenStreetMap has no per-bay signs, so a Newham bay inside a zone is shown as a permit bay. Pay-by-phone and limited-stay bays are signed separately.
- **Yellow-line hours are not in any open data.** We show mapped lines, not their hours.
- **Land Registry parcels are only fetched for the Gallions Reach area**, and they name no owner. They carry low weight.
- **Car park limits** (for example Gallions Reach Shopping Park, Beckton Gateway) come from the operators' public pages and can change. Parkopedia lists some of these as closed at times where we say open, so treat them as unverified.
- **Only Newham has rules.** Neighbouring boroughs show roads and TfL Red Routes, not their zones. TfL Red Routes for all of Greater London are an optional layer.
- **Phone tested:** a Samsung S24+ ran the debug APK, including location, map, ticket help, time controls and local roads while offline. This is one device, not a guarantee for other phones.
- **Data is a snapshot** (pulled 04/10/2026). It does not update itself.

## Contributing

Bug reports and data corrections are welcome. The most useful thing you can do is stand on a road, compare the card with the signs, and open an issue with what you saw. See [CONTRIBUTING.md](CONTRIBUTING.md). Branches: `dev` for work, `prod` for what is live.

## Licence

Code: [MIT](LICENSE). Data: not ours, see [DATA_LICENCES.md](DATA_LICENCES.md). Notably, OpenStreetMap-derived data is ODbL and share-alike, and the Esri map background has its own terms. Parkopedia and AppyParking were design references only. No data or text was taken from them.
