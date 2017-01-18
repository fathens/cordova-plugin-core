import 'babel-polyfill';
import * as fs from 'async-file';

console.log(`Working on ${process.cwd()}`);

const hook_name = process.argv[2];
const hook_code = process.argv[3];
console.log(`Adding scripts['${hook_name}'] <- '${hook_code}'`);

main("../../../nole_modules/.hooks");

async function main(target_dir) {
    if (!(await fs.exists(target_dir))) await fs.mkdir(target_dir);
    const target_file = [target_dir, hook_name].join('/');
    await fs.writeFile(target_file, hook_code, 'utf-8');
    await fs.chmod(target_file, 0o755);
}
