// Foresight tree DOM utility helpers.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const parts = globalScope.LiveTranslatorForesightTreeViewerParts || {};
    globalScope.LiveTranslatorForesightTreeViewerParts = parts;

    // DOM measurement and dataset helpers shared by render and route modules.
    function setElementDatasetValue(element, key, value) {
            if (element && element.dataset) {
                element.dataset[key] = value;
            } else if (element && typeof element.setAttribute === 'function') {
                element.setAttribute(`data-${key.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}`, value);
            }
        }
    
    function getElementDatasetValue(element, key) {
            if (element && element.dataset && element.dataset[key] !== undefined) return String(element.dataset[key]);
            if (!element || typeof element.getAttribute !== 'function') return '';
            return String(element.getAttribute(`data-${key.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}`) || '');
        }
    
    function createSvgElement(doc, tagName) {
            return doc.createElementNS('http://www.w3.org/2000/svg', tagName);
        }
    
    function roundCoordinate(value) {
            const numeric = Number(value);
            return Number.isFinite(numeric) ? Math.round(numeric * 10) / 10 : 0;
        }
    
    function getActionCards(container) {
            if (!container || typeof container.querySelectorAll !== 'function') return [];
            try {
                return Array.from(container.querySelectorAll('.foresight-action-card'));
            } catch (_) {
                return [];
            }
        }
    
    function findActionCardByScrollKey(container, key) {
            if (!key) return null;
            return getActionCards(container).find((card) => getActionCardScrollKey(card) === key) || null;
        }
    
    function getActionCardScrollKey(card) {
            if (!card) return '';
            if (card.dataset && card.dataset.foresightScrollKey) return String(card.dataset.foresightScrollKey);
            if (typeof card.getAttribute === 'function') return String(card.getAttribute('data-foresight-scroll-key') || '');
            return '';
        }
    
    function getElementTopRelativeToScroll(element, scroll) {
            if (!element || !scroll || typeof element.getBoundingClientRect !== 'function' || typeof scroll.getBoundingClientRect !== 'function') {
                return null;
            }
            const elementRect = element.getBoundingClientRect();
            const scrollRect = scroll.getBoundingClientRect();
            if (!elementRect || !scrollRect) return null;
            return finiteMetric(elementRect.top) - finiteMetric(scrollRect.top);
        }
    
    function getElementLeftRelativeToScroll(element, scroll) {
            if (!element || !scroll || typeof element.getBoundingClientRect !== 'function' || typeof scroll.getBoundingClientRect !== 'function') {
                return null;
            }
            const elementRect = element.getBoundingClientRect();
            const scrollRect = scroll.getBoundingClientRect();
            if (!elementRect || !scrollRect) return null;
            return finiteMetric(elementRect.left) - finiteMetric(scrollRect.left);
        }
    
    function getElementHeight(element) {
            if (!element || typeof element.getBoundingClientRect !== 'function') return 0;
            const rect = element.getBoundingClientRect();
            if (!rect) return 0;
            const explicitHeight = finiteMetric(rect.height, NaN);
            if (Number.isFinite(explicitHeight) && explicitHeight > 0) return explicitHeight;
            return Math.max(0, finiteMetric(rect.bottom) - finiteMetric(rect.top));
        }
    
    function getElementWidth(element) {
            if (!element || typeof element.getBoundingClientRect !== 'function') return 0;
            const rect = element.getBoundingClientRect();
            if (!rect) return 0;
            const explicitWidth = finiteMetric(rect.width, NaN);
            if (Number.isFinite(explicitWidth) && explicitWidth > 0) return explicitWidth;
            return Math.max(0, finiteMetric(rect.right) - finiteMetric(rect.left));
        }
    
    function clampScrollTop(value, max) {
            const numeric = finiteScrollMetric(value);
            return max > 0 ? Math.min(numeric, max) : numeric;
        }
    
    function clampScrollLeft(value, max) {
            const numeric = finiteScrollMetric(value);
            return max > 0 ? Math.min(numeric, max) : numeric;
        }
    
    function getMaxScrollTop(scroll) {
            const scrollHeight = finiteScrollMetric(scroll && scroll.scrollHeight);
            const clientHeight = finiteScrollMetric(scroll && scroll.clientHeight);
            return Math.max(0, scrollHeight - clientHeight);
        }
    
    function getMaxScrollLeft(scroll) {
            const scrollWidth = finiteScrollMetric(scroll && scroll.scrollWidth);
            const clientWidth = finiteScrollMetric(scroll && scroll.clientWidth);
            return Math.max(0, scrollWidth - clientWidth);
        }
    
    function finiteScrollMetric(value) {
            const numeric = Number(value);
            return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
        }
    
    function finiteMetric(value, fallback = 0) {
            const numeric = Number(value);
            return Number.isFinite(numeric) ? numeric : fallback;
        }
    
    function getElementContentRect(element, scroll) {
            if (!element || !scroll || typeof element.getBoundingClientRect !== 'function' || typeof scroll.getBoundingClientRect !== 'function') {
                return null;
            }
            const rect = element.getBoundingClientRect();
            const scrollRect = scroll.getBoundingClientRect();
            if (!rect || !scrollRect) return null;
            const left = finiteMetric(rect.left) - finiteMetric(scrollRect.left) + finiteScrollMetric(scroll.scrollLeft);
            const top = finiteMetric(rect.top) - finiteMetric(scrollRect.top) + finiteScrollMetric(scroll.scrollTop);
            const width = Math.max(0, finiteMetric(rect.width, finiteMetric(rect.right) - finiteMetric(rect.left)));
            const height = Math.max(0, finiteMetric(rect.height, finiteMetric(rect.bottom) - finiteMetric(rect.top)));
            return {
                left,
                top,
                right: left + width,
                bottom: top + height,
                width,
                height,
            };
        }
    
    parts.domUtils = Object.freeze({
        clampScrollLeft, clampScrollTop, createSvgElement, findActionCardByScrollKey, finiteMetric,
        finiteScrollMetric, getActionCardScrollKey, getActionCards, getElementContentRect,
        getElementDatasetValue, getElementHeight, getElementLeftRelativeToScroll,
        getElementTopRelativeToScroll, getElementWidth, getMaxScrollLeft, getMaxScrollTop,
        roundCoordinate, setElementDatasetValue,
    });

})();
