# Cross-reference report

Votes: + adopted, - private.

- OpenStreetMap: 35,708 features over the whole borough. Road geometry, TfL operator tag, access tags, bays, chargers, kerb restrictions.
- Newham highway map: 6,568 adopted-highway boundary lines. Which roads the council has adopted.
- Land Registry (via planning.data.gov.uk): 1,580 freehold parcels, Gallions Reach area only. Weak signal: covers most adopted roads too and names no owner.
- Newham parking zones: 41 zone polygons, 37 named zones, hours parsed from Newham's text. Zone boundaries and hours.
- Newham pay-by-phone lists: 26 zone lists, 1,057 records, 993 after dedupe, 939 on streets mapped. Pay-by-phone bays, hours and maximum stay.
- Newham traffic order notice (Gazette, 2017): 129 controlled streets, 16 'permit issue only' (Beckton extension only). Cross-check for adopted or private streets.
- Newham parking policy (Oct 2025): TLRN road list, fines, estate rules. Confirms the TfL roads and fine levels.
- Newham estate land layer: 457 council estate hard-surface areas. Council estate land, outside the civil enforcement area.
- TfL Unified API: 24 road corridors. Confirms A13 only: the A117 and A1020 are not listed as corridors.
- Operator sites: Gallions Reach Shopping Park (UKPC), Beckton Gateway. Car park limits and operators.

Checked, nothing to add:
- Newham EV charge points layer (dated Oct 2020): none in the Gallions Reach area
- Newham road signs layer: empty for this area
- Newham car parks layer: 6 records, none near Gallions Reach
- TfL car park places: none within 4 km of Gallions Reach
- Open Charge Map: needs an API key, not used
- DfT digital traffic orders (D-TRO): API access needs registration, not used yet

Confidence: {'high': 2949, 'medium': 4965, 'low': 1903}. Roads where sources disagree: 1547.
Dedupe: {'spaces_merged_into_polygons': 4713, 'dup_ev': 5, 'dup_cycle': 25, 'dup_taxi': 0}
Road km: {'tfl': 99.8, 'other': 712.8, 'newham': 454.2, 'private': 191.5}