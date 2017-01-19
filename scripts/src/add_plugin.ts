import 'babel-polyfill';
import * as fs from 'async-file';
import * as xml2js from 'xml2js';
const glob = require('glob');
const path = require('path');

console.log(`Working on ${process.cwd()}`);

main('./config.xml');

async function main(target_file) {
    if (await fs.exists(target_file)) {
        const config_xml = await read_xml<ConfigXml>(target_file);
        const modified = await modify(config_xml);

        await fs.writeFile(target_file, modified);
        console.log(`Wrote to ${target_file}`);
    } else {
        console.log("No target: " + target_file);
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

    return dst_list;
}

async function modify(config: ConfigXml): Promise<string> {
    const plugins = await sorted_plugins();
    console.log(`Adding plugins: ${plugins}`);

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
    return builder.buildObject(config);
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

        return new PluginInfo(plugin.$.id, spec, deps.map((e) => e.$.id), vals);
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
        readonly variables: string[]
    ) {
    }

    toString(): string {
        return `Plugin(${JSON.stringify({
            id: this.id,
            spec: this.spec,
            deps: this.deps,
            variables: this.variables
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
                name: string
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
