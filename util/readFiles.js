import { readdir, stat } from "fs/promises";
import { join as joinPath, basename } from "path";
import { defaults } from "lodash-es";
import batchOperation from "./batchOperation.js";

const defaultOptions = {
  extension: "",
  loader: () => {
    throw new SyntaxError("Tried to use readFiles without a loader function!");
  },
  postFilter: () => true,
  recursive: true,
  root: "",
};

export default async function readFiles(paths, options) {
  if (!paths?.length) return [];
  if (typeof paths !== "object") paths = [paths];
  defaults(options, defaultOptions);
  const { extension, loader, postFilter, recursive, root } = options;
  const results = await Promise.all(
    paths.map(async (path) => {
      const stats = await stat(path);
      if (stats.isDirectory()) {
        return await batchOperation(
          (
            await readdir(path, {
              withFileTypes: true,
              recursive,
            })
          ).filter(
            (file) =>
              file.isFile() &&
              (!extension || file.name.toLowerCase().endsWith(extension)),
          ),
          async (file) => {
            const filePath = file.parentPath ?? file.path;
            const result = await loader(
              joinPath(root ? filePath.replace(root, "") : filePath, file.name),
              file.name,
            );
            if (postFilter(result)) return result;
          },
          true,
        );
      } else if (stats.isFile()) {
        const result = await loader(
          root ? path.replace(root, "") : path,
          basename(path),
        );
        if (postFilter(result)) return result;
      }
    }),
  );
  return results.flat().filter((value) => !!value);
}
