import 'babel-polyfill';
import * as _ from 'lodash';
import * as fs from 'async-file';
import * as xml2js from 'xml2js';
const himalaya = require('himalaya');
const glob = require('glob');
const path = require('path');

console.log(`Working on ${process.cwd()}`);

main('./config.xml', './www/index.html');

async function main(config_xml: string, index_html: string) {
    if (await fs.exists(config_xml)) {
        await add_plugin(config_xml);
    } else {
        console.log(`${config_xml} does not exist. Try to inject to ${index_html}.`);

        if (await fs.exists(index_html)) {
            await web_inject(index_html);
        } else {
            console.log(`${index_html} does not exist. do nothing.`);
        }
    }
}

async function sorted_plugins(): Promise<PluginInfo[]> {
    const files = glob.sync('node_modules/@cordova-plugin/*/plugin.xml');
    const promises: Promise<PluginInfo>[] = files.map((file) => PluginInfo.readFile(file));
    const src_list = await Promise.all(promises);

    const dst_list: PluginInfo[] = [];
    function push_one(src: PluginInfo | undefined) {
        if (src && !dst_list.find((x) => x.id == src.id)) {
            const deps = src.deps.map((id) => src_list.find((x) => x.id == id));
            deps.forEach((a) => push_one(a));
            dst_list.push(src);
        }
    }
    src_list.forEach((a) => push_one(a));

    console.log(`Injecting plugins: ${dst_list}`);
    return dst_list;
}

async function add_plugin(target_file: string): Promise<void> {
    const config = await read_xml<ConfigXml>(target_file);

    const plugins = await sorted_plugins();

    const left = (config.widget.plugin || []).filter((x) => {
        return !plugins.find((a) => a.id == x.$.name);
    });
    const addings = plugins.map((info) => {
        const vals = info.variables.map((key) => {
            const value: string = process.env[key];
            if (!value) throw `Unknown environment variable: ${key}`;
            return {
                $: {
                    name: key,
                    value: value
                }
            };
        });
        return {
            $: {
                name: info.id,
                spec: info.spec
            },
            variable: vals
        };
    });
    config.widget.plugin = left.concat(addings);

    const builder = new xml2js.Builder();
    const modified = builder.buildObject(config);

    await fs.writeFile(target_file, modified);
    console.log(`Wrote to ${target_file}`);
}

async function web_inject(target_file: string): Promise<void> {
    const content = await fs.readFile(target_file, 'utf-8');

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
        const infos = await sorted_plugins();
        return infos.map((info) => info.web_variables).reduce((a, b) => {
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
                    content: vals
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

    const result = await modify(content);
    if (result) {
        await fs.writeFile(target_file, result, 'utf-8');
        console.log(`Wrote to '${target_file}'`);
    } else {
        console.log(`No need to modify '${target_file}'`);
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

class PluginInfo {
    static async readFile(file: string): Promise<PluginInfo> {
        console.log(`Reading plugin: ${file}`);
        const plugin = (await read_xml<PluginXml>(file)).plugin;
        const spec = await PluginInfo.plugin_spec(path.dirname(file));

        const deps = plugin.dependency || [];
        plugin.platform.forEach((p) => {
            deps.concat(p.dependency || []);
        });

        const vals = plugin.preference ? plugin.preference.map((x) => x.$.name) : [];
        const webs = plugin.preference ? plugin.preference.filter((x) => x.$.web).map((x) => x.$.name) : [];

        return new PluginInfo(plugin.$.id, spec, deps.map((e) => e.$.id), vals, webs);
    }

    static async plugin_spec(plugin_dir: string): Promise<string> {
        const package_json = JSON.parse(await fs.readFile(path.join(plugin_dir, 'package.json'), 'utf-8'));
        const spec: string = package_json._requested.spec;
        const m = spec.match(/^(github):(\w+\/.+)$/);
        if (m) {
            return `https://${m[1]}.com/${m[2]}`;
        } else {
            return spec;
        }
    }

    constructor(
        readonly id: string,
        readonly spec: string,
        readonly deps: string[],
        readonly variables: string[],
        readonly web_variables: string[]
    ) {
    }

    toString(): string {
        return `Plugin(${JSON.stringify({
            id: this.id,
            spec: this.spec,
            deps: this.deps,
            variables: this.variables,
            web_variables: this.web_variables
        }, null, 4)})`;
    }
}

type ConfigXml = {
    widget: {
        plugin?: {
            $: {
                name: string,
                spec: string
            },
            variable?: {
                $: {
                    name: string,
                    value: string
                }
            }[]
        }[]
    }
}

type PluginXml = {
    plugin: {
        $: {
            id: string
        },
        preference?: {
            $: {
                name: string,
                web: boolean
            }
        }[],
        dependency?: {
            $: {
                id: string
            }
        }[],
        platform: {
            dependency?: {
                $: {
                    id: string
                }
            }[]
        }[]
    }
}
