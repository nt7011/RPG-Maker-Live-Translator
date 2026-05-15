// Filesystem helpers for the Precacher UI.
// They are created after NW.js exposes Node fs/path, keeping app.js focused on UI workflow.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    function createFileHelpers(dependencies = {}) {
        const { fs, path } = dependencies;

        function resolveDataDir(gameRoot) {
                const direct = path.join(gameRoot, 'data');
                if (isDirectory(direct)) return direct;
                const www = path.join(gameRoot, 'www', 'data');
                if (isDirectory(www)) return www;
                return direct;
            }
        
        function isFile(filePath) {
                try {
                    return fs.statSync(filePath).isFile();
                } catch (_) {
                    return false;
                }
            }
        
        function isDirectory(dirPath) {
                try {
                    return fs.statSync(dirPath).isDirectory();
                } catch (_) {
                    return false;
                }
            }
        
        function readJsonFile(filePath) {
                const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/u, '');
                return JSON.parse(text);
            }
        
        function writeJsonFile(filePath, value) {
                fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
            }

        return {
            isDirectory,
            isFile,
            readJsonFile,
            resolveDataDir,
            writeJsonFile,
        };
    }

    globalScope.PrecacheUiFiles = Object.freeze({ createFileHelpers });
})();
