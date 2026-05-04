import { flatMap, toPairs, isObjectLike } from "lodash-es";

// Not exactly a mixin, but the core logic came from
// https://stackoverflow.com/a/39822193.
export default function toPairsDeep(obj) {
  return flatMap(toPairs(obj), ([key, value]) =>
    isObjectLike(value) ? toPairsDeep(value) : [[key, value]],
  );
}
