import {
  flatMap,
  isArray,
  isPlainObject,
  map,
  keys,
  concat,
  isUndefined,
  negate,
} from "lodash-es";

// Derived from https://stackoverflow.com/a/36490174.
// Be advised that the original answer does not actually work without
// the changes proposed in the comments (and implemented here).
export default function findKeyPaths(obj, keyToFind, parentKey) {
  var result;
  if (isArray(obj)) {
    return flatMap(obj, function (obj, index) {
      return findKeyPaths(obj, keyToFind, `${parentKey || ""}[${index}]`);
    });
  } else if (isPlainObject(obj)) {
    return flatMap(keys(obj), function (key) {
      return map(findKeyPaths(obj[key], keyToFind, key), function (subkey) {
        return `${parentKey ? `${parentKey}.` : ""}${subkey}`;
      });
    });
  } else {
    result = [parentKey];
  }
  return concat(result, parentKey || [])
    .map((path) => (path.endsWith(keyToFind) ? path : undefined))
    .filter(negate(isUndefined));
}
