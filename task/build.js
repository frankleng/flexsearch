const child_process = require('child_process');
const fs = require('fs');

console.log("Start build .....");
console.log();

fs.existsSync("log") || fs.mkdirSync("log");
fs.existsSync("tmp") || fs.mkdirSync("tmp");
fs.existsSync("dist") || fs.mkdirSync("dist");

var supported_lang = [

    'en',
    'de',
    'at',
    'us'
];

var supported_charset = {

    'latin': ["encode", "advanced", "balance", "extra", "simple", "soundex"],
    'cjk': ["encode"],
    'cyrillic': ["encode"],
    'arabian': ["encode"],
};

let flag_str = "";
let language_out;
let use_polyfill;
var formatting;
var compilation_level;

var options = (function(argv){

    const arr = {};
    let count = 0;

    argv.forEach(function(val, index) {

        if(++count > 2){

            index = val.split('=');
            val = index[1];
            index = index[0].toUpperCase();

            if(index === "LANGUAGE_OUT"){

                language_out = val;
            }
            else if(index === "FORMATTING"){

                formatting = val;
            }
            else if(index === "COMPILATION_LEVEL"){

                compilation_level = val;
            }
            /*
            else if(index === "USE_POLYFILL"){

                use_polyfill = val;
            }
            */
            else{

                if(index !== "RELEASE"){

                    flag_str += " --define='" + index + "=" + val + "'";
                }

                arr[index] = val;
            }

            if(count > 3) console.log(index + ': ' + val);
        }
    });

    console.log('RELEASE: ' + (arr['RELEASE'] || 'custom'));

    return arr;

})(process.argv);

var release = options["RELEASE"];
const light_version = (release === "light") || (process.argv[2] === "--light");
const es5_version = (release === "es5") || (process.argv[2] === "--es5");
const module_version = (release === "module") || (process.argv[2] === "--module");

let parameter = (function(opt){

    if(formatting && !opt["formatting"]){

        opt["formatting"] = formatting;
    }

    let parameter = '';

    for(let index in opt){

        if(opt.hasOwnProperty(index)){

            if((release !== "lang") || (index !== "entry_point")){

                parameter += ' --' + index + '=' + opt[index];
            }
        }
    }

    return parameter;
})({

    compilation_level: compilation_level || (release === "pre" ? "SIMPLE" : (release === "debug" ? "WHITESPACE" : "ADVANCED_OPTIMIZATIONS")), //"SIMPLE"
    use_types_for_optimization: true,
    //new_type_inf: true,
    jscomp_warning: "newCheckTypes",
    //jscomp_error: "strictCheckTypes",
    jscomp_error: "newCheckTypesExtraChecks",
    generate_exports: true,
    export_local_property_definitions: true,
    language_in: "ECMASCRIPT6_STRICT",
    language_out: language_out || "ECMASCRIPT5_STRICT",
    process_closure_primitives: true,
    summary_detail_level: 3,
    warning_level: "VERBOSE",
    emit_use_strict: true,

    output_manifest: "log/manifest.log",
    output_module_dependencies: "log/module_dependencies.log",
    property_renaming_report: "log/property_renaming.log",
    create_source_map: "log/source_map.log",
    variable_renaming_report: "log/variable_renaming.log",
    strict_mode_input: true,
    assume_function_wrapper: true,

    transform_amd_modules: true,
    process_common_js_modules: true,
    module_resolution: "BROWSER",
    //dependency_mode: "SORT_ONLY",
    //js_module_root: "./",
    entry_point: "./src/bundle.js",
    //manage_closure_dependencies: true,
    dependency_mode: "PRUNE_LEGACY",
    rewrite_polyfills: use_polyfill || false,

    isolation_mode: "IIFE"
    //output_wrapper: "(function(){%output%}());"

    //formatting: "PRETTY_PRINT"
});

if(release === "pre" || release === "debug"){

    parameter += ' --formatting=PRETTY_PRINT';
}

if(release === "demo"){

    options['RELEASE'] = "custom";
}

const custom = (!release || (release === "custom"));

if(custom){

    release = "custom." + hashCode(parameter + flag_str).replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

if(release === "lang"){

    const charsets = Object.keys(supported_charset);

    (function next(x, y, z){

        if(x < supported_lang.length){

            (function(lang){

                fs.writeFileSync("tmp/" + lang + ".js", `
                    import { filter, stemmer, matcher } from "../src/lang/${lang}.js";
                    window["FlexSearch"]["registerLanguage"]("${lang}", filter, stemmer, matcher);
                `);

                exec("java -jar node_modules/google-closure-compiler-java/compiler.jar" + parameter + " --entry_point='tmp/" + lang + ".js' --js='tmp/" + lang + ".js' --js='src/**.js'" + flag_str + " --js_output_file='dist/lang/" + lang + ".min.js' && exit 0", function(){

                    console.log("Build Complete: " + lang + ".min.js");
                    next(++x, y, z);
                });

            })(supported_lang[x]);
        }
        else if(y < charsets.length){

            const charset = charsets[y];
            const variants = supported_charset[charset];

            if(z < variants.length){

                (function(charset, variant){

                    fs.writeFileSync("tmp/" + charset + "_" + variant + ".js", `
                        import { split, ${variant} } from "../src/lang/${charset}/index.js";
                        window["FlexSearch"]["registerCharset"]("${charset}:${(variant === "encode" ? "default" : variant)}", ${variant}, split);
                    `);

                    exec("java -jar node_modules/google-closure-compiler-java/compiler.jar" + parameter + " --entry_point='tmp/" + charset + "_" + variant + ".js' --js='tmp/" + charset + "_" + variant + ".js' --js='src/**.js'" + flag_str + " --js_output_file='dist/lang/" + charset + "/" + (variant === "encode" ? "default" : variant) + ".min.js' && exit 0", function(){

                        console.log("Build Complete: " + charset + "/" + (variant === "encode" ? "default" : variant) + ".min.js");
                        next(x, y, ++z);
                    });

                })(charset, variants[z]);
            }
            else{

                next(x, ++y, 0);
            }
        }

    }(0, 0, 0));
}
else{

    var filename = "dist/flexsearch." + (release || "custom") + ".js";

    exec("java -jar node_modules/google-closure-compiler-java/compiler.jar" + parameter + " --js='src/**.js'" + flag_str + " --js_output_file='" + filename + "' && exit 0", function(){

        let build = fs.readFileSync(filename);
        let preserve = fs.readFileSync("src/flexsearch.js", "utf8");

        const package_json = require("../package.json");

        preserve = preserve.replace("* FlexSearch.js", "* FlexSearch.js v" + package_json.version + (light_version ? " (Light)" : es5_version ? " (ES5)" : ""));
        build = preserve.substring(0, preserve.indexOf('*/') + 2) + "\n" + build;

        if(release === "pre"){

            fs.existsSync("test/dist") || fs.mkdirSync("test/dist");
            fs.writeFileSync("test/" + filename, build);
        }
        else{

            fs.writeFileSync(filename, build);
        }

        console.log("Build Complete.");
    });
}

function hashCode(str) {

    var hash = 0, i, chr;

    if(str.length === 0){

        return hash;
    }

    for(i = 0; i < str.length; i++){

        chr = str.charCodeAt(i);
        hash = (hash << 5) - hash + chr;
    }

    hash = Math.abs(hash) >> 0;

    return hash.toString(16).substring(0, 5);
}

function exec(prompt, callback){

    const child = child_process.exec(prompt, function(err, stdout, stderr){

        if(err){

            console.error(err);
        }
        else{

            if(callback){

                callback();
            }
        }
    });

    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
}