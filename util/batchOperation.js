import { ProgressBar } from "stdio";

export default async function batchOperation(files, operation, useBar = false) {
  let current;
  let results = [];
  let isBarFinished = false;
  let bar;
  if (useBar) {
    bar = new ProgressBar(files.length);
    bar.onFinish(() => {
      isBarFinished = true;
    });
  }

  while (files.length) {
    current = files.splice(0, 1000);
    results.push(
      ...(await Promise.all(
        current.map(async (file) => {
          const result = operation(file);

          // Oh, this can't *possibly* go wrong in a massively parallel operation...
          if (useBar) bar.tick();

          return result;
        }),
      )),
    );
  }

  // Make sure the progress bar *actually* gets out of the way
  // before returning control to the caller.
  if (useBar) while (!isBarFinished) bar.tick();
  return results;
}
