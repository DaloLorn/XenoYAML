# Template Hierarchy

- Each template has exactly one ancestor (which must be an Artitas template)
- Templates often exist in identical paths in more than one world (ST and GC; NL is usually unique due to being the common world)
- Templates may inherit across content pack boundaries (and overrides across content pack boundaries *must* do so to avoid self-parenting)

# Template Structure

## Top Level

```yaml
version: 0.1.0 # Always this version, as far as I can tell. (Eventually that assumption will become obsolete, but that's the future!)
asset:
	Parent:
		$content: ContentPack-:-WL-::-path/to/parent.json # NL -> common, ST -> strategy, GC -> groundcombat
		# Implication: *Other* things can inherit from each other.
		# But what things would this make sense for? Could this be shrapnel from Unity?
		$t: ar_Template 
	Name: apparentlyIrrelevant # But let's try to do better! In the non-degenerate case, this matches the template filename.
	_components: # We'll analyze the anatomy of a component in a later section.
		- someComponent
	# Need to be careful to use string serialization. Analysis of old templates says 4 is Artitas.Template.
	# Would be nice if *everything* either existed in the type registry or used its fully qualified type, though...
	$t: "4"
$t: "15" # Common.Content.DataStructures.VersionedAsset.
```

This can be simplified into the following XenoYAML subtree:

```yaml
# Alternatively, use either Artitas notation (as above), or xenonauts%GC%item/armour/servitor.
# Can be omitted if the ancestor lives in the same YAML tree, but will I support that...?
# ... Incidentally, yes, I intend to support all three options. Why not?
parent: 
	pack: xenonauts # Can be blank if unneeded; XenoYAML must automatically detect if it's an override and append the content pack prefix.
	type: GC
	path: item/armour/servitor
name: servitor # Can also be autofilled from filename or something, but let's offer explicit support because we can.
components: # Defined using $t *only*, as I don't want to mess with deduplication without a full map of the type registry.
	someComponent: # Optimizing around an Artitas quirk: Only one instance of a component can exist on an entity.
		componentBit: whatever
		$content: uh oh. # Won't be able to pull that stunt off twice. Need to think about how to handle arrays.
inherited: # Component values inherited from the ancestor. Should only be used when the ancestor lives in another YAML file, for readability.
	otherComponent:
		componentBits: whatever else
```

## Component

```yaml
$t: ShortName # From the type registry (or something else if absent; need to understand further)
$type: Long.Component.Name # Fully qualified C# class name. Can't safely support this right now.
# This is randomly a RangeComponent for demonstration, I guess.
_min: 0.0
_val: 0.0
_max: 0.0
# The exact fields will vary from type to type. I kind of want type safety eventually, but this is not really scalable without plugging into the C# assembly somehow.
# That *might* be doable if I were doing this in C#, but that's going to be such a pain in the neck I don't want to deal with it now.
# Short-term workaround for $content (and any other) arrays, though:
# - If untyped (no $t, no $type), check that the keys of each item are identical, because that can't possibly come back to bite me.
# - If typed, store the type and data separately.
# 
# Examples to follow. (In the simplified variant, let's *not* make like an LLM and get our wires crossed...)
$content:
	# Untyped, argument to a LocalizableGUID.
	- GUID: something
    TargetComponent: Common.Components.DescriptionComponent
    Request: Ignore

	- $t: Quantity
		_min: 0.0
		_val: 1.0
		_max: Infinity

	- $type: Xenonauts.GroundCombat.Components.AutoHealAbilityDefinition # AKA type 93
		Range: 5
		PercentageOfDamageHealed: 0.5
		LineProjectilePrefab: GC-::-sfx/projectile/auto_heal-^default.prefab # This seems like a prime candidate for simplification. Later. When I'm getting fancy.
		SoundFX: GC-::-sfx/heal/heal_servitor_beam.ogg
		FXDuration: 0.8
		HealMeta: Healable # Something I never thought about: Does this mean Servitors could be made to heal units with *other* meta flags?
		Name: Auto Heal
		Tooltip: false
```

This can be simplified (and I use the word generously - I feel like most of our gains were on the top-level structure) to:

```yaml
# It occurs to me that $t never contains a period, while $type always does.
# Won't be *safe*, but I guess I can support both type systems side-by-side...
# Not like the game won't (probably) blow up on a dupe anyway.
ShortName: 
  _min: 0.0
  _val: 0.0
  _max: 0.0
  $content:
    - GUID: something
      TargetComponent: Common.Components.DescriptionComponent
      Request: Ignore

    # Typed.
    # Argument to a "0" (Artitas.Core.Utils.Reference`1[[Artitas.Template, blah blah blah]]),
    # itself a piece of an element of a RecoveredItems.
    # This is a bad example because it's *basically* a component in a template, so I'll make another. :(
    - Quantity:
        _min: 0.0
        _val: 1.0
        _max: Infinity

    # Typed #2: A Xenonauts.GroundCombat.Components.AutoHealAbilityDefinition, which is a 93 in the new type system!
    # (... Okay, yes, I know the shape of this. Thing is, LLMs do this because they "forget" they did it already,
    # or because they want to be helpful; I do this because I'm reordering the doc on the fly and too lazy to make sure 
    # I've only mentioned it once. We are not the same. >:()
    - Xenonauts.GroundCombat.Components.AutoHealAbilityDefinition:
        Range: 5
        PercentageOfDamageHealed: 0.5
        LineProjectilePrefab: GC-::-sfx/projectile/auto_heal-^default.prefab
        SoundFX: GC-::-sfx/heal/heal_servitor_beam.ogg
        FXDuration: 0.8
        HealMeta: Healable
        Name: Auto Heal
        Tooltip: false
```

This format seems to aptly describe all possible children of a component too (e.g. prerequisites, selectors, etc.), but I won't be sure until I start coding.