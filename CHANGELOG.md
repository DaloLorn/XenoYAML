# XenoYAML Changelog

## 0.1.0 (May 1st, 2026)

- Basic import-only release. Hoping to handle exports tomorrow before moving into the meatier bits.

## 0.2.0 (May 2nd, 2026)

- The exporter is now fully operational!
- Fixed an issue importing template references where any unexpected data (e.g. `descriptor`) would be discarded.
- Early preparations to enable use as a standalone CLI tool. (By which I mean "you can actually use it as a CLI tool now if you run `npm link` on it!")

<details>

<summary>Backend code changes, no user significance</summary>

- Fixed an issue where the importer would accidentally invert negative infinities.
- Fixed an issue where a template reference without an actual reference would crash the exporter.
- Fixed an issue where parentless templates would crash the exporter.
- Fixed an issue where inner template references would crash the exporter on trying to prevent self-inheritance. (Self-inheritance is, after all, only relevant in matters of *actual inheritance.*)
- Fixed an issue where the exporter would incorrectly generate a string instead of a fully-formed template reference for the Parent field.
- Tweaked the formatting on the exporter output.
- Fixed an issue where the exporter would produce a _components object with one entry, instead of the proper _components array.
- Did a bit of refactoring (including taking a page out of my day job and installing ESLint and Prettier!)

</details>