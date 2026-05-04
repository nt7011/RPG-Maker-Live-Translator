// Loader path resolver.
// It maps the loader script/support URL to local game and support paths used by runtime modules.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    const defineLoaderModule = globalScope.LiveTranslatorLoaderDefine;
    if (typeof defineLoaderModule !== 'function') {
        throw new Error('[LiveTranslatorLoader] Loader module registry is unavailable.');
    }

    const TRANSLATION_CACHE_FILE = 'translation-cache.log';
    const PRECACHE_LOG_FILE = 'precache.log';

    function getNodeApi() {
        try {
            const req = (typeof require === 'function')
                ? require
                : (typeof window !== 'undefined' && typeof window.require === 'function' ? window.require : null);
            if (!req) return null;
            return {
                path: req('path'),
            };
        } catch (_) {
            return null;
        }
    }

    function normalizeFileUrlPath(pathname, pathModule) {
        let localPath = decodeURIComponent(String(pathname || ''));
        localPath = localPath.replace(/^\/+([A-Za-z]:[\\/])/u, '$1');
        localPath = localPath.replace(/\//gu, pathModule.sep);
        return pathModule.normalize(localPath);
    }

    function resolveLocalPathFromUrl(url, pathModule) {
        if (!url || !pathModule) return '';
        try {
            const baseUrl = typeof window !== 'undefined' && window.location ? window.location.href : undefined;
            const parsed = new URL(url, baseUrl);
            if (parsed.protocol !== 'file:') return '';
            return normalizeFileUrlPath(parsed.pathname, pathModule);
        } catch (_) {
            return '';
        }
    }

    function getProcessCwd() {
        try {
            if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
                const cwd = process.cwd();
                return cwd && typeof cwd === 'string' ? cwd : '';
            }
        } catch (_) {}
        return '';
    }

    function deriveGameRootFromSupportPath(supportPath, pathModule) {
        if (!supportPath || !pathModule) return '';
        const normalized = pathModule.normalize(supportPath);
        const parts = normalized.split(/[\\/]+/u);
        const lower = parts.map((part) => String(part).toLowerCase());
        const liveTranslatorIndex = lower.lastIndexOf('live-translator');
        if (liveTranslatorIndex < 0) return '';
        const pluginsIndex = liveTranslatorIndex - 1;
        const jsIndex = liveTranslatorIndex - 2;
        if (lower[pluginsIndex] !== 'plugins' || lower[jsIndex] !== 'js') return '';
        if (lower[liveTranslatorIndex - 3] === 'www') {
            return parts.slice(0, liveTranslatorIndex - 3).join(pathModule.sep);
        }
        return parts.slice(0, liveTranslatorIndex - 2).join(pathModule.sep);
    }

    function createRuntimePaths(options = {}) {
        const { loaderScript, supportDir } = options;
        const nodeApi = getNodeApi();
        const pathModule = nodeApi && nodeApi.path;
        const supportPath = pathModule ? resolveLocalPathFromUrl(supportDir, pathModule) : '';
        const gameRoot = getProcessCwd()
            || deriveGameRootFromSupportPath(supportPath, pathModule)
            || '';
        const joinSupport = (fileName) => {
            if (pathModule && supportPath) return pathModule.join(supportPath, fileName);
            if (pathModule && gameRoot) return pathModule.join(gameRoot, fileName);
            return '';
        };

        return {
            loaderUrl: loaderScript && loaderScript.src ? loaderScript.src : '',
            supportUrl: supportDir || '',
            supportPath,
            gameRoot,
            translationCacheFile: joinSupport(TRANSLATION_CACHE_FILE),
            precacheLogFile: joinSupport(PRECACHE_LOG_FILE),
        };
    }

    defineLoaderModule('pathResolver', {
        createRuntimePaths,
        deriveGameRootFromSupportPath,
        getProcessCwd,
        resolveLocalPathFromUrl,
    });
})();
