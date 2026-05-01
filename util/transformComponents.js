import { isArray, isPlainObject, mapValues, isUndefined, assign, keys } from 'lodash-es';
import { parseTemplateReference, stringifyTemplateReference } from './templateReferenceUtils.js';

// As mentioned in the analysis doc, I need to differentiate between
// YAML nodes created by compacting type identifiers,
// versus YAML nodes copied as-is from the original JSON.
const TYPE_PREFIX = ":";

// A very condensed extract of the Artitas type registry used
// to shorten the old pre-M7 longform types.
// Easy-but-tedious PR fodder, if anyone cares: Register *everything.*
// (And probably extract it to its own file when you do.)
const TYPE_REGISTRY = {
  "Common.Content.AssetReference`1[[Artitas.Template, Assembly-CSharp, Version=0.0.0.0, Culture=neutral, PublicKeyToken=null]]": "ar_Template",
}

function transformNode(data) {
  // 1. Handle Arrays: Keep as arrays, but recurse on children
  if (isArray(data)) {
    return data.map(item => transformNode(item));
  }

  // 2. Handle Objects
  if (isPlainObject(data)) {
    const { $type, $t, $content, ...rest } = data;
    const type = TYPE_REGISTRY[$type] ?? $type ?? $t;
    
    if (type) {
      const prefixedType = `${TYPE_PREFIX}${type}`;

      // Special-case template refs.
      if(type == "ar_Template")
        return { [prefixedType]: parseTemplateReference($content) };

      if (!isUndefined($content)) {
        return { [prefixedType]: transformNode($content) };
      }
      return { 
        [prefixedType]: mapValues(rest, value => transformNode(value)) 
      };
    }
    return mapValues(rest, value => transformNode(value));
  }

  return data;
}

// ... I got tangled up trying to correctly handle inner objects/arrays
// (the remnants of this failure can still be seen in import.js),
// and ended up phoning Gemini for help when my blind eyes couldn't find the problem. :(
export function parseComponents(data) {
  if (!isArray(data)) return transformNode(data);

  // Collapse the root array into one object
  // transformNode(item) returns { "TypeName": { ...props } }
  // We merge all those objects into one.
  return data.reduce((acc, item) => {
    return assign(acc, transformNode(item));
  }, {});
}

// ... By this point, I've straight-up given up mapping this by hand,
// and coaxed Gemini into giving me a reverse transformer, too.
export function stringifyComponents(data) {
  if (isArray(data)) {
    return data.map(item => reverseTransform(item));
  }

  if (isPlainObject(data)) {
    const output = {};
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
      const reversedContent = reverseTransform(content);

      // Determine if we use $type or $t based on dots
      const typeProp = originalType.includes('.') ? '$type' : '$t';

      // No sane person would deliberately inject the long form of ar_Template
      // into their XenoYAML files after I went to the trouble of stripping it out.
      // Luckily for the insane among us, I'm *juuuust* crazy enough
      // to conceive of the notion.
      if((originalType[TYPE_REGISTRY] ?? originalType) == "ar_Template") {
        return { [typeProp]: originalType, $content: stringifyTemplateReference(content) };
      }

      // If content is not an object, it's $content
      if (!isPlainObject(reversedContent) && !isArray(reversedContent)) {
        return { [typeProp]: originalType, $content: reversedContent };
      }

      // If it's an object, merge it. If it's anything else (Array, string, null), wrap it.
      return isPlainObject(reversedContent) 
        ? { ...reversedContent, [typeProp]: originalType }
        : { $content: reversedContent, [typeProp]: originalType };
    }

    // Standard object (like "selector" wrapper which has no # prefix)
    return mapValues(data, value => reverseTransform(value));
  }

  return data;
}