(() => {
    'use strict';

    const script = document.currentScript;
    const scriptUrl = script && script.src
        ? script.src
        : '';
    const supportUrl = scriptUrl
        ? new URL('.', scriptUrl).href
        : '';
    const uiUrl = supportUrl
        ? appendSupportContext(new URL('precacher-ui/index.html', supportUrl).href)
        : '';
    let precacherWindow = null;

    function appendSupportContext(baseUrl) {
        const url = new URL(baseUrl);
        const supportPath = resolveSupportPath();
        if (supportPath) url.searchParams.set('supportPath', supportPath);
        return url.href;
    }

    function resolveSupportPath() {
        try {
            const req = typeof require === 'function' ? require : null;
            if (!req) return '';
            const path = req('path');
            const rawSrc = script && typeof script.getAttribute === 'function'
                ? (script.getAttribute('src') || scriptUrl)
                : scriptUrl;
            if (!rawSrc) return '';

            const launcherUrl = new URL(rawSrc, window.location.href);
            let supportPath = decodeURIComponent(new URL('.', launcherUrl.href).pathname || '');
            supportPath = supportPath.replace(/^\/+/u, '');
            supportPath = supportPath.replace(/\//gu, path.sep);

            if (/^[A-Za-z]:[\\/]/u.test(supportPath)) return path.normalize(supportPath);
            return path.resolve(process.cwd(), supportPath);
        } catch (_) {
            return '';
        }
    }

    function focusExistingWindow() {
        try {
            if (!precacherWindow) return false;
            if (typeof precacherWindow.focus === 'function') precacherWindow.focus();
            return true;
        } catch (_) {
            precacherWindow = null;
            return false;
        }
    }

    function openPrecacher() {
        if (!uiUrl) {
            throw new Error('[LiveTranslatorPrecacher] Unable to resolve precacher UI URL.');
        }
        if (focusExistingWindow()) return;

        const options = {
            width: 1040,
            height: 760,
            position: 'center',
            focus: true,
        };

        if (globalThis.nw && nw.Window && typeof nw.Window.open === 'function') {
            nw.Window.open(uiUrl, options, (opened) => {
                precacherWindow = opened || null;
                if (precacherWindow && typeof precacherWindow.on === 'function') {
                    precacherWindow.on('closed', () => {
                        precacherWindow = null;
                    });
                }
            });
            return;
        }

        precacherWindow = window.open(uiUrl, 'LiveTranslatorPrecacher', 'width=1040,height=760');
    }

    function isEditableTarget(target) {
        if (!target) return false;
        const tag = String(target.tagName || '').toLowerCase();
        return target.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
    }

    function installHotkey() {
        if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
        document.addEventListener('keydown', (event) => {
            const key = String(event.key || '').toLowerCase();
            const code = String(event.code || '').toLowerCase();
            if (!event.ctrlKey || !event.shiftKey || (key !== 'p' && code !== 'keyp')) return;
            if (isEditableTarget(event.target)) return;
            event.preventDefault();
            openPrecacher();
        }, true);
    }

    globalThis.LiveTranslatorPrecacher = {
        open: openPrecacher,
        url: uiUrl,
    };

    installHotkey();
})();
