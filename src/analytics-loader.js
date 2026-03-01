(function initDeferredAnalytics() {
    var GA_ID = 'G-VYHDWCM97R';
    var CLARITY_ID = 'vjvpsfo2io';
    var booted = false;

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () {
        window.dataLayer.push(arguments);
    };
    window.clarity = window.clarity || function () {
        (window.clarity.q = window.clarity.q || []).push(arguments);
    };

    function loadScript(src, attrs, onload) {
        var script = document.createElement('script');
        script.src = src;
        if (attrs) {
            Object.keys(attrs).forEach(function (key) {
                script.setAttribute(key, attrs[key]);
            });
        }
        if (typeof onload === 'function') {
            script.onload = onload;
        }
        document.head.appendChild(script);
    }

    function bootAnalytics() {
        if (booted) {
            return;
        }
        booted = true;

        loadScript('https://www.googletagmanager.com/gtag/js?id=' + GA_ID, { async: 'true' }, function () {
            window.gtag('js', new Date());
            window.gtag('config', GA_ID);
        });
        loadScript('https://www.clarity.ms/tag/' + CLARITY_ID, { async: 'true' });
    }

    function scheduleBoot() {
        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(function () {
                window.setTimeout(bootAnalytics, 1200);
            }, { timeout: 2000 });
            return;
        }
        window.setTimeout(bootAnalytics, 1800);
    }

    if (document.readyState === 'complete') {
        scheduleBoot();
    } else {
        window.addEventListener('load', scheduleBoot, { once: true });
    }
})();
