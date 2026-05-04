import {
  isArray,
  isPlainObject,
  mapValues,
  assign,
  omit,
  map,
  size,
  keys,
} from "lodash-es";
import {
  parseTemplateReference,
  stringifyTemplateReference,
} from "./templateReferenceUtils.js";

// As mentioned in the analysis doc, I need to differentiate between
// YAML nodes created by compacting type identifiers,
// versus YAML nodes copied as-is from the original JSON.
const TYPE_PREFIX = ":";

// A very condensed extract of the Artitas type registry used
// to shorten the old pre-M7 longform types.
// Easy-but-tedious PR fodder, if anyone cares: Register *everything.*
// (And probably extract it to its own file when you do.)
const TYPE_REGISTRY = {
  "Common.Content.AssetReference`1[[Artitas.Template, Assembly-CSharp, Version=0.0.0.0, Culture=neutral, PublicKeyToken=null]]":
    "ar_Template",
};

function parseComponent(data) {
  // 1. Handle Arrays: Keep as arrays, but recurse on children
  if (isArray(data)) {
    return data.map((item) => parseComponent(item));
  }

  // 2. Handle Objects
  if (isPlainObject(data)) {
    const { $type, $t, ...rest } = data;
    const type = TYPE_REGISTRY[$type] ?? $type ?? $t;

    if (type) {
      const prefixedType = `${TYPE_PREFIX}${type}`;

      // Special-case template refs.
      if (type == "ar_Template")
        return { [prefixedType]: parseTemplateReference(data) };

      const dataKeys = keys(rest);
      if (dataKeys.length === 1 && dataKeys[0] === "$content") {
        return { [prefixedType]: parseComponent(rest.$content) };
      }
      return {
        [prefixedType]: mapValues(rest, (value) => parseComponent(value)),
      };
    }
    return mapValues(rest, (value) => parseComponent(value));
  }

  return data;
}

// ... I got tangled up trying to correctly handle inner objects/arrays
// (the remnants of this failure can still be seen in import.js),
// and ended up phoning Gemini for help when my blind eyes couldn't find the problem. :(
export function parseComponents(data) {
  if (!isArray(data)) return parseComponent(data);

  // Collapse the root array into one object
  // transformNode(item) returns { "TypeName": { ...props } }
  // We merge all those objects into one.
  return data.reduce((acc, item) => {
    return assign(acc, parseComponent(item));
  }, {});
}

// ... By this point, I've straight-up given up mapping this by hand,
// and coaxed Gemini into giving me a reverse transformer, too.
export function stringifyComponent(data) {
  if (isArray(data)) {
    return data.map((item) => stringifyComponent(item));
  }

  if (isPlainObject(data)) {
    let typeKey = null;

    // Look for a key starting with our prefix
    for (const key in data) {
      if (key.startsWith(TYPE_PREFIX)) {
        typeKey = key;
        break;
      }
    }

    if (typeKey) {
      const originalType = typeKey.substring(TYPE_PREFIX.length);
      const content = data[typeKey];
      const reversedContent = stringifyComponent(content);

      // Determine if we use $type or $t based on dots
      const typeProp = originalType.includes(".") ? "$type" : "$t";

      // No sane person would deliberately inject the long form of ar_Template
      // into their XenoYAML files after I went to the trouble of stripping it out.
      // Luckily for the insane among us, I'm *juuuust* crazy enough
      // to conceive of the notion.
      //
      // Anyway, since ar_Template has a special parser, it needs a special stringifier...
      if ((originalType[TYPE_REGISTRY] ?? originalType) == "ar_Template") {
        return {
          $content: stringifyTemplateReference(content),
          ...omit(content, ["pack", "screen", "path"]),
          [typeProp]: originalType,
        };
      }

      // If content is not an object, it's a simple scalar/array in $content.
      if (!isPlainObject(reversedContent)) {
        return { $content: reversedContent, [typeProp]: originalType };
      }

      // Otherwise we don't have a $content, or it's got siblings.
      return { ...reversedContent, [typeProp]: originalType };
    }

    // Standard object (like "selector" wrapper which has no # prefix)
    return mapValues(data, (value) => stringifyComponent(value));
  }

  return data;
}

export function stringifyComponents(data) {
  if (!size(data)) return;

  return map(data, (component, type) => {
    return stringifyComponent({ [type]: component });
  });
}
