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
// - While $content is never a plain object in my Artitas bulk import,
//   it's a common enough key that Goldhawk *might* make an object $content
//   someday, so preemptively catching it.
// - $args is part of the builder definition, and I'm feeling paranoid
//   enough not to contradict Gemini's assumption here.
// - $path is used to figure out which subtrees are actually mappable to
//   Artitas templates. Terrible things would likely happen if I let you
//   inject it willy-nilly into a XenoYAML template.
const RESERVED = ["$content", "$args", "$path"];
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
    } else if (has(registry, name)) {
      console.error(
        `Builder name "${name}" is defined multiple times throughout the project! `,
      );
      result = false;
    } else registry[name] = definition;

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
            `Builder "${name}": Argument name "${arg}" is reserved! (Reserved names: "${RESERVED.join('", "')}")`,
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

      if (
        // Builder calls can never be scalars or arrays,
        // so we can keep the reserved keyword list
        // relatively slim without clashing with Artitas data.
        // If I'd been smarter, I might have thought of a different
        // builder prefix that didn't clash with Artitas,
        // existing XenoYAML, or YAML syntax...
        isPlainObject(value) &&
        builders[key]
      ) {
        // --- EXECUTE BUILDER ---
        const builder = builders[key];
        const userParams = value;
        const { $args, ...template } = builder;

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
