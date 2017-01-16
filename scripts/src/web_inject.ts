import 'babel-polyfill';
import * as fs from 'async-file';
import * as xml2js from 'xml2js';
const himalaya = require('himalaya');

main("./www/index.html");

async function main(target_file) {
    if (fs.exists(target_file)) {
        const plugin = (await read_xml<PluginXml>('./plugin.xml')).plugin;
        const variable_names = plugin.preference ? plugin.preference.map((pref) => pref.$.name) : [];

        const package_json = JSON.parse(await fs.readFile('./package.json', 'utf-8'));
        const client = `${package_json.name}@${package_json.version}`;

        console.log(`Working for ${client}`);

        const content = await fs.readFile(target_file, 'utf-8');
        const result = modify(content, client, variable_names);
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

type PluginXml = {
    plugin: {
        preference?: {
            $: {
                name: string
            }
        }[]
    }
}

function inject_variables(scripts, client: string, variable_names: string[]) {
    if (variable_names.length < 1) return null;
    if (scripts.find((e) => { return e.attributes.by === client })) return null;

    function build_variables(variable_names: string[]) {
        const tab = ' '.repeat(4);
        const lines = variable_names.map((key) => {
            const value = process.env[key];
            if (!value) throw `Unknown environment variable: ${key}`;
            return `${tab}const ${key} = '${value}';`;
        }).join('\n');
        return `\n${lines}\n`;
    }

    return {
        tagName: "script",
        type: "Element",
        attributes: {
            type: 'text/javascript',
            by: client
        },
        content: build_variables(variable_names)
    };
}

function modify(data: string, client: string, variable_names: string[]) {
    const json = himalaya.parse(data);

    const html = json.find((e) => { return e.tagName === 'html' });
    const head = html.children.find((e) => { return e.tagName === 'head' });
    var scripts = head.children.filter((e) => { return e.tagName === 'script' });
    if (!scripts) scripts = [];

    const vals = inject_variables(scripts, client, variable_names);

    if (vals) {
        head.children.push(vals);
        return require('himalaya/translate').toHTML(json);
    }
}

function read_xml<T>(path): Promise<T> {
    return new Promise<T>(async (resolve, reject) => {
        const text = await fs.readFile(path, 'utf-8');
        xml2js.parseString(text, (err, xml) => {
            if (err) {
                reject(err);
            } else {
                resolve(xml);
            }
        });
    });
}
