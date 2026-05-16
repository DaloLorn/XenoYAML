import { keys, pickBy } from "lodash-es";

const ARTITAS_TEMPLATE_REF_REGEX = /(?:(.*)-:-)?(.*)-::-(.*)/;
const XENOYAML_TEMPLATE_REF_REGEX = /(?:([^%]*)%)?([^%]*)%([^%]*)/;

function extractRef(regexResults, ref) {
  if (!regexResults.length && !keys(ref).length) return;

  return pickBy(
    {
      // Of the three supported formats, this is the most convenient
      // internal representation of an Artitas template reference.
      // There may be miscellaneous data we don't know what to do with, though.
      // Let's just cram that in for now.
      ...ref,
      pack: regexResults[1],
      screen: regexResults[2],
      path: regexResults[3]?.replace(/.json$/gi, ""),
    },
    (value, key) =>
      !["$t", "$type", "$content"].includes(key) && value !== undefined,
  );
}

export function parseTemplateReference(ref) {
  const parsedRef = ref?.$content?.match(ARTITAS_TEMPLATE_REF_REGEX) || [];
  return extractRef(parsedRef, ref);
}

export function stringifyTemplateReference(ref, path) {
  // It occurs to me that some XenoYAML templates have no parents,
  // usually because they were imported from a parentless Artitas template...
  if (!ref) return undefined;

  // As mentioned before, an object is the most convenient internal representation
  // of a template reference, so let's make sure we're working with one.
  if (typeof ref != "object") {
    let parsedRef = ref.match(XENOYAML_TEMPLATE_REF_REGEX) || [];
    if (!parsedRef.length) parsedRef = ref.match(ARTITAS_TEMPLATE_REF_REGEX);
    if (!parsedRef.length)
      throw new TypeError(
        `Could not parse template reference ${ref} for file path ${path}!`,
      );
    ref = extractRef(parsedRef);
  }

  let { path: refPath, screen, pack, ...rest } = ref;

  // If it's a parent path, prevent inheriting from self!
  if (
    !!path &&
    !pack &&
    path.replace(/.json$/gi, "").replace(/([^/]*\/)/i, "") ==
      refPath.replace(/.json$/gi, "")
  ) {
    pack = "xenonauts";
  }

  // Artitas file references always end with a file extension!
  // (Even when it is blindingly obvious what the extension must be.)
  if (!refPath.endsWith(".json")) refPath += ".json";

  const result = `${pack ? `${pack}-:-` : ""}${screen}-::-${refPath}`;
  return {
    $content: result,
    ...rest,
    $t: "ar_Template",
  };
}
