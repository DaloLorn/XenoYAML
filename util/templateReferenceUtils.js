import { pickBy } from "lodash-es";

const ARTITAS_TEMPLATE_REF_REGEX = /(?:(.*)-:-)?(.*)-::-(.*)/;
const XENOYAML_TEMPLATE_REF_REGEX = /(?:([^%]*)%)?([^%]*)%([^%]*)/;

function extractRef(regexResults, ref) {
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
  if (!ref.path) return "";

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

  // If it's a parent path, prevent inheriting from self!
  if (
    !!path &&
    !ref.pack &&
    path.replace(/.json$/gi, "") == ref.path.replace(/.json$/gi, "")
  ) {
    ref.pack = "xenonauts";
  }

  // Artitas file references always end with a file extension!
  // (Even when it is blindingly obvious what the extension must be.)
  if (!ref.path.endsWith(".json")) ref.path += ".json";

  const result = `${ref.pack ? `${ref.pack}-:-` : ""}${ref.screen}-::-${ref.path}`;
  if (!path) return result;

  // Special handling for template parents, because I feel better putting it here.
  return {
    $content: result,
    $t: "ar_Template",
  };
}
