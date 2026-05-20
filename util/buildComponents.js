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
  keys,
  values,
  isString,
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
// - $none specifies that a field explicitly defaults to "undefined".
//   This is distinct from not specifying a default, in that
//   it allows a multi-arg builder to be conditionally treated as a
//   single-arg builder.
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
  "$none",
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
        // Arg has a default value, sanity-check its name
        // instead of the whole entry
        if (isPlainObject(arg) && keys(arg).length === 1) {
          arg = keys(arg)[0];
        }

        if (typeof arg !== "string" || !arg.startsWith(PREFIX)) {
          console.error(
            `Builder "${name}": $args must contain only strings or single-key objects whose key starts with "${PREFIX}"!`,
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

// Resolves an argument to either a user-provided value or a default
// (which may itself be a different user-provided value)
function getValueOrDefault(userParams, arg, $args, argKeys, index) {
  return (
    userParams[arg] ?? getDefaultValue(userParams, arg, $args, argKeys, index)
  );
}

function getDefaultValue(userParams, arg, $args, argKeys, index) {
  if (index === undefined) index = argKeys.findIndex((key) => key === arg);
  let defaultValue =
    typeof $args[index] === "object" ? values($args[index])[0] : undefined;
  if (defaultValue === "$none") defaultValue = undefined;
  else if (argKeys.includes(defaultValue))
    defaultValue = getValueOrDefault(userParams, defaultValue, $args, argKeys);
  return defaultValue;
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

        // This is a bit of a misnomer - XenoYAML does not,
        // and does not *want to*, check whether all the args are defined...
        // but in order to enable shorthand invocation on a multi-arg builder,
        // no more than one arg can be defined without a default value.
        // For args that can literally be undefined, this default value should be
        // the reserved keyword `$none`.
        const requiredArgs =
          $args?.length > 1 ? ($args || []).filter(isString) : $args;
        const argKeys =
          requiredArgs === $args
            ? $args
            : $args.map((arg) => (isString(arg) ? arg : keys(arg)[0]));

        // Shorthand invocation:
        // If the argument map isn't a map (or doesn't contain the argument key),
        // then it must be the argument itself!
        if (requiredArgs?.length === 1) {
          const singleArgName = requiredArgs[0];

          if (userParams?.$noArg) {
            delete userParams.$noArg;
          } else if (
            !isPlainObject(userParams) ||
            !(singleArgName in userParams)
          ) {
            userParams = { [singleArgName]: userParams };
          }
        } else if (requiredArgs?.length && !isPlainObject(userParams)) {
          throw new SyntaxError(
            `Attempted to pass a scalar or array to a builder expecting multiple arguments! ${key} received the payload "${userParams}"`,
          );
        }

        // Map arguments (unbound become undefined)
        const argValues = {};
        if (argKeys) {
          argKeys.forEach((arg, index) => {
            argValues[arg] = evaluateBuilders(
              getValueOrDefault(userParams, arg, $args, argKeys, index),
              builders,
            );
          });
        }

        // Hydrate the template
        let hydrated = hydrateTemplate(
          cloneDeep(template),
          argValues,
          builders,
        );

        // Process overrides (the non-arg siblings in the call)
        const rawOverrides = omit(userParams, argKeys || []);
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
