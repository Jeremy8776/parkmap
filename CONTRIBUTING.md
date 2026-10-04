# Contributing

Thanks for helping. This guide is only as good as its data, and the best data is a person standing on the road.

## The most useful contribution

Stand on a road, open the app, and compare the card with the signs and lines. Then open an issue using the **Data correction** template with:

- the road name and a rough location (or use "Something wrong?" on the card, which copies the details)
- what the app said, and what the sign or line actually says
- a photo of the sign if you can

## Code

1. Branch from `dev`: `git switch dev && git switch -c my-change`
2. Run the tests: `python -m unittest discover -s tests && node tests/rules.test.js`
3. If you changed data code or the app, rebuild so `docs/` matches: `python build.py`
4. Open a pull request into `dev`. `prod` is only updated from `dev` when a release is ready, and publishing to GitHub Pages happens from `prod`.

Rules of thumb: small focused modules, a header comment on anything non-obvious, tests for new pure logic, and files kept under about 500 lines. Be honest in user-facing wording: say "inferred" when it is, and never show a green light for parking the data cannot prove.

## Data and licences

Do not add data from sources whose licence does not allow it. Parkopedia, AppyParking and similar apps are off limits as data sources. If you add a source, add it to `DATA_LICENCES.md`.
