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

async function plugin_spec(plugin_dir: string): Promise<string> {
    const package_json = JSON.parse(await fs.readFile(path.join(plugin_dir, 'package.json'), 'utf-8'));
    const spec: string = package_json._requested.spec;
    const m = spec.match(/^(github):(\w+\/.+)$/);
    if (m) {
        return `https://${m[1]}.com/${m[2]}`;
    } else {
        return spec;
    }
}

async function modify_each(config: ConfigXml, plugin_xml_file: string): Promise<void> {
    const plugin = (await read_xml<PluginXml>(plugin_xml_file)).plugin;
    const plugin_id = plugin.$.id;
    const variable_names = plugin.preference ? plugin.preference.map((pref) => pref.$.name) : [];

    const spec = await plugin_spec(path.dirname(plugin_xml_file));
    console.log(`plugin_id=${plugin_id}, spec=${spec}`);

    const found = config.widget.plugin ? config.widget.plugin.find((x) => x.$.name === plugin_id) : null;
    const elem = found || {
        $: {
            name: plugin_id,
            spec: spec
        }
    };
    if (found) {
        found.$.spec = spec;
    } else {
        if (!config.widget.plugin) config.widget.plugin = [];
        config.widget.plugin.push(elem);
        console.log("Added plugin: " + plugin_id);
    }

    variable_names.forEach((key) => {
        const value: string = process.env[key];
        if (!value) throw `Unknown environment variable: ${key}`;

        const found = elem.variable ? elem.variable.find((x) => x.$.name === key) : null;
        if (found) {
            found.$.value = value;
        } else {
            if (!elem.variable) elem.variable = [];
            elem.variable.push({
                $: {
                    name: key,
                    value: value
                }
            })
        }
    })
}

async function modify(config: ConfigXml): Promise<string> {
    const files = glob.sync('node_modules/@cordova-plugin/*/plugin.xml');
    const promises = files.map((file) => modify_each(config, file));
    await Promise.all(promises);
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
