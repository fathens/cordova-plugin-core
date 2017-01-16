import 'babel-polyfill';
import * as fs from 'async-file';

console.log(`Working on ${process.cwd()}`);

const script_line = process.argv[2];
const script_name = process.argv[3] || 'prestart';
console.log(`Adding scripts['${script_name}'] <- '${script_line}'`);

main("../../../package.json");

async function main(target_file) {
    if (await fs.exists(target_file)) {
        const result = await modify(await fs.readFile(target_file, 'utf-8'));
        if (result) {
            await fs.writeFile(target_file, result, 'utf-8');
            console.log(`Wrote to '${target_file}'`);
        } else {
            console.log(`No need to modify '${target_file}'`);
        }
    } else {
        console.log(`No target: '${target_file}'`);
    }
}

async function modify(data) {
    const json = JSON.parse(data);

    if (!json.scripts) json.scripts = {};

    const line = json.scripts[script_name];
    if (line) {
        json.scripts[script_name] = line + '; ' + script_line;
    } else {
        json.scripts[script_name] = script_line;
    }
    return JSON.stringify(json, null, 2);
}
