import 'babel-polyfill';
import * as _ from 'lodash';
import * as fs from 'async-file';
import * as xml2js from 'xml2js';
const himalaya = require('himalaya');
const glob = require('glob');

main("./www/index.html");

async function main(target_file) {
    if (await fs.exists(target_file)) {
        const content = await fs.readFile(target_file, 'utf-8');
        const result = await modify(content);
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

async function find_snippets(): Promise<{ [key: string]: any}> {
    const result = {};
    const files = glob.sync('node_modules/@cordova-plugin/*/www/index-*.snippet.html');
    const promises = files.map(async (file) => {
        const key = file.match(/.*\/index-(\w+)\.snippet\.html$/)[1]
        result[key] = himalaya.parse(await fs.readFile(file, 'utf-8'));
    });
    await Promise.all(promises);
    return result;
}

async function find_variables(): Promise<string[]> {
    const files = glob.sync('node_modules/@cordova-plugin/*/plugin.xml');
    const promises: Promise<PluginXml>[] = files.map((file) => read_xml<PluginXml>(file));
    const xmls = await Promise.all(promises);

    return xmls.map((xml) => {
        return xml.plugin.preference ? xml.plugin.preference.map((pref) => pref.$.name) : [];
    }).reduce((a, b) => {
        return a.concat(b);
    }).filter((x, i, self) => {
        return self.indexOf(x) === i;
    });
}

async function variable_lines(): Promise<string | null> {
    const variable_names = await find_variables();
    if (variable_names.length < 1) return null;

    const tab = ' '.repeat(4);
    const lines = variable_names.map((key) => {
        const value = process.env[key];
        if (!value) throw `Unknown environment variable: ${key}`;
        return `${tab}const ${key} = '${value}';`;
    }).join('\n');
    return `\n${lines}\n`;
}

async function modify(data: string): Promise<string | undefined> {
    const json = himalaya.parse(data);

    const html = json.find((e) => e.tagName === 'html');
    function get_element(name): (any | null) {
        return html.children.find((e) => e.tagName === name);
    }

    const vals = await variable_lines();
    const snippets = await find_snippets();

    if (vals || snippets) {
        if (vals) {
            const head = get_element('head');
            if (head) head.children.push({
                tagName: "script",
                type: "Element",
                attributes: {
                    type: 'text/javascript',
                },
                content: await variable_lines()
            });
        }
        if (snippets) {
            _.forEach(snippets, (snippet, key) => {
                const elem = html.children.find((e => e.tagName === key));
                if (elem) snippet.forEach((x) => elem.children.push(x));
            });
        }
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
