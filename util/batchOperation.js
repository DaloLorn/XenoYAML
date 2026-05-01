export default async function batchOperation(files, operation) {
    let current;
    let results = [];
    while(files.length) {
        current = files.splice(0, 1000);
        results.push(...(await Promise.all(current.map(async file => {
            return operation(file);
        }))));
    }
    return results;
}