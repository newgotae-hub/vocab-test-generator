(function initRouteScopedAds() {
    var ADSENSE_CLIENT = 'ca-pub-1010168647313500';
    var ELIGIBLE_PAGES = {
        generator: true,
        test: true,
    };
    var MAX_ATTEMPTS = 24;
    var RETRY_DELAY_MS = 350;

    function isVisible(element) {
        if (!element) return false;
        if (element.classList.contains('hidden')) return false;
        return true;
    }

    function hasEligibleGeneratorContent() {
        var library = document.getElementById('book-library');
        return Boolean(library && library.querySelectorAll('.book-option').length >= 3);
    }

    function hasEligibleTestContent() {
        var setupView = document.getElementById('test-setup-view');
        var bookOptions = document.querySelectorAll('#book-options .test-type-option');
        return isVisible(setupView) && bookOptions.length >= 3;
    }

    function isContentReady(pageName) {
        if (pageName === 'generator') return hasEligibleGeneratorContent();
        if (pageName === 'test') return hasEligibleTestContent();
        return false;
    }

    function shouldLoadAds() {
        var body = document.body;
        if (!body) return false;

        var pageName = body.dataset ? body.dataset.page : '';
        if (!ELIGIBLE_PAGES[pageName]) return false;
        if (body.dataset.authReady !== 'true') return false;
        return isContentReady(pageName);
    }

    function loadAdsenseScript() {
        if (window.__VOCA_ADSENSE_LOADING || document.querySelector('script[data-voca-adsense]')) {
            return;
        }

        window.__VOCA_ADSENSE_LOADING = true;
        var script = document.createElement('script');
        script.async = true;
        script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + ADSENSE_CLIENT;
        script.crossOrigin = 'anonymous';
        script.dataset.vocaAdsense = 'true';
        document.head.appendChild(script);
    }

    function bootWhenReady(attempt) {
        if (shouldLoadAds()) {
            loadAdsenseScript();
            return;
        }

        if (attempt >= MAX_ATTEMPTS) {
            return;
        }

        window.setTimeout(function () {
            bootWhenReady(attempt + 1);
        }, RETRY_DELAY_MS);
    }

    function scheduleBoot() {
        bootWhenReady(0);
    }

    if (document.readyState === 'complete') {
        scheduleBoot();
    } else {
        window.addEventListener('load', scheduleBoot, { once: true });
    }
})();
