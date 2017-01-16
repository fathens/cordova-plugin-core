import 'babel-polyfill';
import * as fs from 'async-file';
import * as xml2js from 'xml2js';

console.log(`Working on ${process.cwd()}`);

main('../../../config.xml');

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
        }
        preference?: {
            $: {
                name: string
            }
        }[]
    }
}

async function repo_url(): Promise<string> {
    const package_json = JSON.parse(await fs.readFile('./package.json', 'utf-8'));
    const url: string = package_json.repository.url;
    const version: string = package_json.version;
    return `${url}#version/${version}`;
}

async function modify(config: ConfigXml) {
    const plugin = (await read_xml<PluginXml>('./plugin.xml')).plugin;
    const plugin_id = plugin.$.id;
    const variable_names = plugin.preference ? plugin.preference.map((pref) => pref.$.name) : [];

    const gitrepo = await repo_url();
    console.log(`plugin_id=${plugin_id}, repo=${gitrepo}`);

    const found = config.widget.plugin ? config.widget.plugin.find((x) => x.$.name === plugin_id) : null;
    const elem = found || {
        $: {
            name: plugin_id,
            spec: gitrepo
        }
    };

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

    if (found) {
        found.$.spec = gitrepo;
    } else {
        if (!config.widget.plugin) config.widget.plugin = [];
        config.widget.plugin.push(elem);
        console.log("Added plugin: " + plugin_id);
    }

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
