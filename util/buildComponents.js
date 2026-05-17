import {
  isArray,
  isPlainObject,
  mapValues,
  merge,
  cloneDeep,
  omit,
  has,
  forEach,
  mergeWith,
} from "lodash-es";

// Reasons for reservation:
// - $content is *only* the single most common $ key in Xenonauts 2.
// - $args is part of the builder definition, and I'm feeling paranoid
//   enough not to contradict Gemini's assumption here.
// - $path is used to figure out which subtrees are actually mappable to
//   Artitas templates. Terrible things would likely happen if I let you
//   inject it willy-nilly into a XenoYAML template.
// - $noArg tells a single-arg builder that, if the argument is not provided,
//   the other data passed to it is a template override and not the argument
//   value.
// - All the other reserved keys added in 0.7.0 are used by the game's Artitas
//   serializer. Since objects are no longer the only acceptable argument
//   to a builder, I have to guard against all of them now (or try to).
const RESERVED = [
  "$content",
  "$args",
  "$path",
  "$noArg",
  "$ref",
  "$valuetype",
  "$valuetypekey",
  "$valueid",
  "$valuereference",
  "$type",
  "$t",
];
const PREFIX = "$";

// Returns a Boolean to let us know if it's safe to continue exporting.
export function importBuilders(source, registry) {
  let result = true;
  forEach(source, (definition, name) => {
    if (!name.startsWith(PREFIX)) {
      console.error(
        `Builder name "${name}" is not legal! All builder names must start with "${PREFIX}".`,
      );
      result = false;
    } else if (RESERVED.includes(name)) {
      console.error(
        `Builder name "${name}" is a reserved keyword! (Reserved names: "${RESERVED.join('", "')}")`,
      );
    } else if (has(registry, name)) {
      console.error(
        `Builder name "${name}" is defined multiple times throughout the project! `,
      );
      result = false;
    } else registry[name] = definition;
    if (definition.$args && typeof definition.$args == "string")
      definition.$args = [definition.$args];

    if (definition.$args && !isArray(definition.$args)) {
      console.error(`Builder "${name}": $args must be an array if specified!`);
      result = false;
    } else
      forEach(definition.$args, (arg) => {
        if (typeof arg !== "string" || !arg.startsWith(PREFIX)) {
          console.error(
            `Builder "${name}": $args must contain only strings starting with "${PREFIX}"!`,
          );
          result = false;
        } else if (RESERVED.includes(arg)) {
          console.error(
            `Builder "${name}": Argument name "${arg}" is a reserved keyword! (Reserved names: "${RESERVED.join('", "')}")`,
          );
          result = false;
        }
      });
  });
  return result;
}

// ... I got lazy and extended my old Gemini conversation (see transformComponents)
// to handle the implementation, with the usual minor adjustments by yours truly.
function safeMerge(objValue, srcValue) {
  // Make sure scalars always overwrite
  if (
    (!isPlainObject(objValue) || !isPlainObject(srcValue)) &&
    (!isArray(objValue) || !isArray(srcValue))
  ) {
    return srcValue;
  }
  // Return undefined to let merge handle it normally for objects
  return undefined;
}

export function evaluateBuilders(data, builders) {
  if (!builders) return data;

  if (isArray(data)) {
    return data.map((item) => evaluateBuilders(item, builders));
  }

  if (isPlainObject(data)) {
    let result = {};

    // 1. First, identify which keys are builders and which are standard data
    for (const key in data) {
      const value = data[key];

      if (key.startsWith(PREFIX) && builders[key]) {
        // --- EXECUTE BUILDER ---
        const builder = builders[key];
        let userParams = value;
        const { $args, ...template } = builder;

        // Shorthand invocation:
        // If the argument map isn't a map (or doesn't contain the argument key),
        // then it must be the argument itself!
        if ($args?.length === 1) {
          const singleArgName = $args[0];

          if (userParams?.$noArg) {
            delete userParams.$noArg;
          } else if (
            !isPlainObject(userParams) ||
            !(singleArgName in userParams)
          ) {
            userParams = { [singleArgName]: userParams };
          }
        } else if ($args?.length && !isPlainObject(userParams)) {
          throw new SyntaxError(
            `Attempted to pass a scalar or array to a multi-arg builder! ${key} received the payload "${userParams}"`,
          );
        }

        // Map arguments (unbound become undefined)
        const argValues = {};
        if ($args) {
          $args.forEach((arg) => {
            argValues[arg] = evaluateBuilders(userParams[arg], builders);
          });
        }

        // Hydrate the template
        let hydrated = hydrateTemplate(
          cloneDeep(template),
          argValues,
          builders,
        );

        // Process overrides (the non-arg siblings in the call)
        const rawOverrides = omit(userParams, $args || []);
        const cleanOverrides = evaluateBuilders(rawOverrides, builders);

        // Merge the builder result into our result collector
        mergeWith(result, hydrated, cleanOverrides, safeMerge);
      } else {
        // --- STANDARD DATA ---
        // Recurse on the value and assign it to the result
        const evaluatedValue = evaluateBuilders(value, builders);
        // Only merge if it's a plain object or array, otherwise overwrite
        if (
          (isPlainObject(evaluatedValue) && isPlainObject(result[key])) ||
          (isArray(evaluatedValue) && isArray(result[key]))
        ) {
          result[key] = merge(result[key], evaluatedValue);
        } else {
          result[key] = evaluatedValue;
        }
      }
    }

    return result;
  }

  return data;
}

/**
 * Recursively replaces $vars with values
 */
function hydrateTemplate(node, argValues, builders) {
  if (isArray(node)) {
    return node.map((i) => hydrateTemplate(i, argValues, builders));
  }

  if (isPlainObject(node)) {
    // If this node is a nested builder call, evaluate it first
    // This allows $HasTech to use $AnotherBuilder internally
    const evaluated = evaluateBuilders(node, builders);

    return mapValues(evaluated, (val) =>
      hydrateTemplate(val, argValues, builders),
    );
  }

  // If the value is a string matching an arg name (e.g. "$path")
  // TODO: Dissect the logic here. Something's fishy,
  // it doesn't look like `node` is always a value...
  if (typeof node === "string" && has(argValues, node)) {
    return argValues[node];
  }

  return node;
}
