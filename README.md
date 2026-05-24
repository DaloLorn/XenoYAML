# XenoYAML
Xenonauts 2 modding tool designed to simplify editing of the game's entity templates by converting them into a more legible, more flexible YAML-based format.

Right now, it has the following capabilities (as of 0.9.x):
- Importing Artitas projects up to (and presumably exceeding) the size of the all_templates zip (tested in 7.20.4)
- Merging across screen boundaries at import
- Basic templating support via YAML anchors and merge keys
- Advanced templating support via the `$builders` mechanic
- Limited support for automatic recursive merging of two YAML trees
- Rudimentary type awareness to further simplify imported data
- Exporting the project back to Artitas-compatible JSON

## System Requirements
- Just about any consumer-grade operating system of the past... 30 years or so?
- A relatively recent version of [Node.js](https://nodejs.org/en)

## Installation
1. Download or clone this repository.
2. Open a shell window (Command Prompt, Bash, etc.) and run `npm install --production`.
    - You can also run `npm link` afterwards, to enable its use as a global NPM package!
3. Wait for the operation to complete.

## Running the application
If you haven't run `npm link` (see above):
1. Open a shell window inside the repo's root folder (containing this readme).
2. Run `node` to bring up an up-to-date help message.

Otherwise:
1. Open a shell window anywhere.
2. Run `xenoyaml` to bring up an up-to-date help message.

## Format Documentation
No formal documentation exists at this time, but `analysis.md` contains some relevant ramblings of mine. Additionally, the `manual` command can provide detailed explanations of each of the XenoYAML tools, and I've converted [Xeno2-PlayableServitors](https://github.com/DaloLorn/Xeno2-PlayableServitors) into a high-grade XenoYAML sample project (in addition to all the other things it was doing).

A few notable deviations from Artitas:
- No explicit `$type`/`$t` values.
    - Template metadata really doesn't need to be explicitly provided in the first place. Maybe in Unity and the broader context of X2's data loader, but not for a template-centric workflow like the one I'm making!
    - Components are stored as a dictionary, not an array. Why? Because it more closely represents the idea that Artitas entities can only have one component of any given type.
        - I do not currently have an answer to situations where a component still manages to be defined twice (i.e. once with `$type` and once with `$t`), but my working theory is that the game will crash on trying to load such a deformed template anyway.
    - Nested Artitas objects (e.g. the contents of a `GCAbilityDefinitions`) are stored as single-object dictionaries. Not my best work, I suppose, but I don't currently have a better idea.
- The names of Artitas types (components, selectors, etc.) are prefixed with the `:` character, as in `:LocalizableGUID`, to help transform XenoYAML back to Artitas-compatible JSON.
- `ar_Template` references support one of three formats:
    - The standard Artitas format: `[contentPack]-:-[screen]-::-[path]` (though the `.json` extension is optional)
    - The XenoYAML shorthand format: `[contentPack]%[screen]%[path]` (again, extension optional)
    - The XenoYAML object format, used by default when importing: `{pack: contentPack, screen: screen, path: path}` (extension still optional!)
- Extra metadata has been added to help XenoYAML detect self-inheriting templates and break the circle on export by inheriting from the `xenonauts` content pack, as per current Goldhawk guidelines.
