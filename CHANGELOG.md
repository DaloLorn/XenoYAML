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

## 0.3.0 (May 2nd, 2026)

- **BREAKING:** The `path` metadata variable has been renamed to `$path` to improve type safety for the new `--mergeScreens` flag. You will need to reimport existing projects from JSON.
- Fixed an issue where XenoYAML would overzealously strip siblings of `$content` nodes on import due to a mistaken assumption on my part.
- While I was at it, tidied up the export transformer a bit to remove redundant logic.
- Fixed the package entry point so `npm link` properly installs the package. I got so excited about finding out what was wrong with it earlier, I forgot to test if my latest fix worked...
- Implemented `--mergeScreens` import flag, which generates a single unified YAML tree for all screens. The unified format is autodetected at export, so the flag isn't needed there.
  - Due to safety concerns, this flag is currently automatically deactivated if XenoYAML can't find the content pack's `template` folder.
- Implemented `--pretty` export flag, which formats the exported JSON with 2-space indentation for readability. This is not recommended for general use, as it slows template loading; you should prefer to use XenoYAML files as the authoritative source for editing or version control.

## 0.4.0 (May 4th, 2026)

- Added a progress bar to the initial project load, to avoid confusion when the application seemingly hangs on loading larger projects.
- Migrated from `stdio` to `yargs` as the main CLI provider.
  - **IMPORTANT:** You will need to run `npm install` again after updating. However, rerunning `npm link` will not be necessary.
  - `stdio` is still used to provide the progress bar functionality.
  - `--import` is now a command (e.g. `xenoyaml import`, or its many aliases) instead of a flag.
  - While XenoYAML still assumes the default operation is exporting a project, you can explicitly specify you're exporting via commands such as `xenoyaml export`. This has no effect on the exporter's functionality.
  - The `--mergeScreens` and `--pretty` flags are now only usable with their corresponding commands.
  - The `--outputFolder` option now has different (and shorter) documentation depending on the command it's used with.
- Cleaned up some leftover logging from 0.3.0's development.
- Added `merge <source> <target> [output]` command (aliases: `m`, `associate`, `combine`). Combines the contents of the provided `source` and `target` XenoYAML files, writing the combined XenoYAML to `output` (or `target`, if no `output` argument was provided).
  - This is a useful supplement to `--mergeScreens`, allowing you to more easily merge two related files with different paths. (For example, merging strategy and GC actors.)
  - XenoYAML will delete any surplus files left over from the operation (`source` is always deleted, `target` is deleted if `output` was provided).
  - This operation will automatically abort if the files contain overlapping templates (checks for identical YAML paths to `$path`). However, this can be overridden with the `--unsafe` flag.
      - It will *always* abort if the files define conflicting aliases in `$aliases`, or have different `$schema` fields.
    - If `--unsafe` forces a merge, the source files will not be deleted unless the `--forceDelete` flag was used. (`--forceDelete` automatically enables `--unsafe`.)
  - The results of this operation can be previewed using the `--dryRun` flag.
  - This operation will **always** abort if the files don't have the same schema version (see below).
- Added `manual <command>` command (aliases: `m`, `guide`, `man`, `instructions`). This prints detailed information about `command` that would not comfortably fit into the autogenerated Yargs help message. (Frankly, even some of the stuff I *did* put in there is too verbose...)
- Added full support for YAML anchors, aliases, and merges.
  - Support has also been added for a dedicated `$aliases` field, for those who want to define all their aliases in one place.
  - For those not familiar with these YAML features, the [Playable Servitors](https://github.com/DaloLorn/Xeno2-PlayableServitors) repo has been updated to use them extensively.
- Added a `$schema` field to denote schema versions, as I'm deathly afraid of the logistical implications of my tendency to suddenly make backwards-incompatible changes to the XenoYAML schema. Should there be any more changes, a migration tool will be provided to update old projects without reimporting.
  - Newly imported files will have `$schema: 0.4.0` automatically injected at the top of the file.
- Fixed an issue where the exporter wasn't correctly cleaning up path separators for its log messages.

### 0.4.1 (May 9th, 2026)

- Fixed an oversight that was causing the importer to prepend `parsedFile` to all imported file paths (which would thus cause the exporter to erroneously export to `parsedFile/so/and/so.json`).

## 0.5.0 (May 10th, 2026)

- Fixed a typo in the changelog that said 0.4.1 was released on *Max 9th*. :man_facepalming:
- Added a new `$builders` field, for when YAML aliases inevitably prove inadequate!
  - Builders are essentially parameterized objects, and are evaluated immediately after aliases.
    - This may encourage you to use aliases in your builder definitions. I feel a sense of morbid curiosity regarding the outcomes.
  - Builders are only evaluated in the `components` and `excluded` contexts. Anywhere else, they have no effect.
  - Builders are loaded into a global pool from all files in the project.
    - This has the side effect of making no-arg builders usable as global aliases.
    - This does not *currently* obey project root inference: Only those files being exported will contribute their builders to the export.
      - A fix for this will be included in a later release when my brain is a little less fried. Until then, please either define all your builders in the files or folders that are using them, or make sure to always export your entire XenoYAML project at once!
  - Each builder name must start with the `$` prefix.
  - Builders may contain an `$args` array with argument names. These arguments will then be mapped onto the template.
  - Builders must contain a YAML subtree (I advise objects, but I will neither confirm nor deny the feasibility of array builders) to serve as a template.
  - The contents of the builder template can be overridden at runtime by passing a non-arg subtree to the builder.
  - Unless I am mistaken, the contents of the template can also be overridden by providing a sibling subtree with the same structure as the template.

<details>

<summary>Example Usage</summary>

```yaml
$builders:
  $NoLocale:
    :LocalizableGUID: []
  $HasTechs:
    $args: # The $args array is never merged into the subtree.
      - $techs
    # Interestingly, a builder could probably return multiple objects, like an alias.
    # (I haven't tried it yet.)
    #
    # This is not always advisable: Some builders like $HasTechs here
    # might be invoked in an array context (as opposed to the component dictionary),
    # resulting in deformed objects.
    :ADelegatePq:
      Operator: All
      Number: 0
      selector:
        :PlayerSe:
          Player: xenonauts
      Variant: Unlocks
      modifierStorage: null
      prerequisites: $techs # The value of `prerequisites` will be set to whatever is passed to $techs at runtime - see the sample tech below.
  $HasTech:
    $args:
      - $pack
      - $tech
    :ProjectPq:
      Project:
        :ar_Template:
          # Noteworthy behavior: Omitting an argument will omit its associated field.
          # (This is probably only ever safe for :ar_Template, when I think about it...)
          # Anyway, in this context, we don't *generally* need a content pack,
          # but what if we ever do?
          #
          # Funnily, a $TemplateRef builder could be created
          # to build template refs anywhere in the project...
          pack: $pack 
          screen: ST
          path: $tech
      Status: Finished
      Variant: Unlocks
      modifierStorage: null

strategy:
  projects/research:
    vehicle_servitor_heavy:
      parent:
        screen: ST
        path: masters/projects/research/research_duration1
      name: vehicle_servitor_heavy
      $path: ""
      components:
        $NoLocale: {} # No-arg builders still need to be invoked with an object!
        :Description: Intensive study of the aliens' Heavy
          Servitor drones, aimed at advancing our Servitor reconstruction protocols.
        :Name: Heavy Servitor Reconstruction
        :Prerequisites:
          
          # Let's break this down a bit:
          # The $HasTechs builder specifies that the player (via :PlayerSe)
          # must meet all of the prerequisites outlined in the $techs array.
          # Then, $techs contains an array of $HasTech builder calls,
          # each of which specifies that a project must be completed.
          #
          # This makes $HasTechs a bit of a misnomer, because :PlayerSe
          # is also the selector used to check if you have money or OP.
          # But never mind that.
          - $HasTechs:
              $techs:
                - $HasTech:
                    $tech: projects/research/vehicle_servitor
                - $HasTech: 
                    $tech: projects/research/alien_weapons_fusion
                - $HasTech:
                    $tech: projects/research/abstract_alien_antigrav_emitter
```

</details>

### 0.5.1 (May 10th, 2026)

- Fixed an order-of-operations issue which prevented builder template overrides. 
  - As a reminder, because I ran afoul of *that* too: Overriding the template needs you to match its *entire* YAML tree right down to the fields you wanted to change. (Examples below are based on the Playable Servitors repo.)

<details>

<summary>Example</summary>

```yaml
  # This is wrong - at best, the new Variant will be ignored!
  $HasTechs:
    Variant: Cost
    $techs:
      # Insert costs here

  # This is the correct style, overriding the generated object.
  $HasTechs:
    :ADelegatePq:
      Variant: Cost
    $techs:
      # Insert costs here
```

</details>