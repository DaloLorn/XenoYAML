import {
  isArray,
  isPlainObject,
  mapValues,
  assign,
  map,
  size,
  keys,
  pickBy,
} from "lodash-es";
import { sep } from "path";
import {
  parseTemplateReference,
  stringifyTemplateReference,
} from "./templateReferenceUtils.js";
import { evaluateBuilders } from "./buildComponents.js";

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
  "Artitas.Core.Utils.Reference`1[[Artitas.Template, Assembly-CSharp, Version=0.0.0.0, Culture=neutral, PublicKeyToken=null]]":
    "0",
  "Common.Parcels.Components.PackContentsComponent": "PackContents",
  "Artitas.Template": "4",
};

// *Technically* a misnomer, since these parsers are for a Reference<T>,
// but those are backed by an UnsafeOptional<T> so it's fine!
//
// (Narrator: It was not fine.)
function _buildOptionalParser(parser) {
  return (data) => parseOptional(data, parser);
}

function parseOptional(data, parser) {
  if (data === false || data?.IsSet === false) return false;
  const value = data?.["&v"] ?? data?.Value;
  return value ? parser(value) : false;
}

function buildReferenceParser(parser) {
  return (data) => parseReference(data, parser);
}

function parseReference(data, parser) {
  return parser(data.Value);
}

const PARSE_INTERCEPTORS = {
  // Food for thought: Could try parsing other AssetReferences too,
  // under the same principle!
  ar_Template: parseTemplateReference,
  0: buildReferenceParser(parseTemplate),
  // Defined as a ListComponent<Template>.
  PackContents: (data) => {
    const { $content, ...rest } = data;
    const parsedTemplates = $content?.map(parseTemplate);
    if (keys(rest).length) return { $content: parsedTemplates, ...rest };
    return parsedTemplates;
  },
};

function _buildOptionalStringifier(stringifier) {
  return (data) => stringifyOptional(data, stringifier);
}

function stringifyOptional(data, stringifier) {
  if (!data) return false;
  // I may have overengineered a tad, *but* consider this:
  // The overengineering lets me stringify optionals parsed
  // by older versions of XenoYAML. :D
  const value = data["&v"] ?? data.Value ?? data;
  return value ? { "&v": stringifier(value) } : false;
}

function buildReferenceStringifier(stringifier) {
  return (data) => stringifyReference(data, stringifier);
}

function stringifyReference(data, stringifier) {
  // Catch references parsed by older XenoYAML parser.
  const value = data.Value ?? data;
  return { Value: value ? stringifier(value) : null };
}

const STRINGIFY_INTERCEPTORS = {
  ar_Template: stringifyTemplateReference,
  0: buildReferenceStringifier(stringifyTemplate),
  PackContents: (data) => {
    if (isArray(data)) return { $content: data.map(stringifyTemplate) };
    if (isPlainObject(data)) {
      const { $content, ...rest } = data;
      const stringifiedTemplates = $content?.map(stringifyTemplate);
      return { $content: stringifiedTemplates, ...rest };
    }
    // Should never happen, but just in case.
    return data;
  },
};

// Extracted template parser and stringifier now that I need them here too.
export function parseTemplate(data, path) {
  const {
    Parent,
    Name,
    _components,
    _excluded,
    $type: _1,
    $t: _2,
    ...rest
  } = data;
  const components = parseComponents(_components);
  const excluded = parseComponents(_excluded);
  // Catch usage of this function in a map() or similar function.
  if (path && typeof path !== "string") path = undefined;

  return pickBy({
    parent: parseTemplateReference(Parent),
    name: Name,
    // Portability: Windows understands POSIX path separators,
    // but most other OSes do not understand Windows separators, so
    // let's only use POSIX separators in serialized data.
    ...(path && { $path: path.replaceAll(sep, "/") }),
    components,
    excluded,
    ...rest, // It occurred to me that this could be a thing that happens occasionally.
  });
}

export function stringifyTemplate(data, path, builders) {
  const {
    parent,
    name,
    components,
    excluded,
    _components,
    $path: _,
    ...rest
  } = data;
  // Backwards compatibility check for 0.4.0.
  if (_components) return stringifyComponent(data);
  // Catch usage of this function in a map() or similar function.
  if (path && typeof path !== "string") {
    path = undefined;
    builders = undefined;
  }

  return pickBy({
    Parent: stringifyTemplateReference(
      parent,
      (path || "").replaceAll(sep, "/"),
    ),
    Name: name,
    _components: stringifyComponents(evaluateBuilders(components, builders)),
    _excluded: stringifyComponents(evaluateBuilders(excluded, builders)),
    ...rest,
  });
}

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

      // Special-case handling, for components we
      // happen to have custom parsing for.
      if (PARSE_INTERCEPTORS[type]) {
        return { [prefixedType]: PARSE_INTERCEPTORS[type](rest) };
      }

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

// ... I got tangled up trying to correctly handle inner objects/arrays,
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
      const registeredType = TYPE_REGISTRY[originalType] ?? originalType;

      // Determine if we use $type or $t based on dots
      const typeProp = registeredType.includes(".") ? "$type" : "$t";

      if (STRINGIFY_INTERCEPTORS[registeredType]) {
        return {
          ...STRINGIFY_INTERCEPTORS[registeredType](content),
          [typeProp]: registeredType,
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

  const invalidKeys = keys(data).filter((k) => !k.startsWith(TYPE_PREFIX));
  if (invalidKeys.length > 0) {
    throw new SyntaxError(
      `Found properties without a type prefix (${TYPE_PREFIX}) inside a components block: [${invalidKeys.join(", ")}].`,
    );
  }

  return map(data, (component, type) => {
    return stringifyComponent({ [type]: component });
  });
}
