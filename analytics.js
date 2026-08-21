(function() {
    'use strict';

    var ENDPOINT = '/api/analytics';
    var isLocal = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname) || window.location.protocol === 'file:';
    var allowedEvents = new Set([
        'page_view',
        'hero_products',
        'hero_collab',
        'project_open',
        'press_open',
        'podcast_open',
        'subscription_expand',
        'skill_sample_open',
        'sample_to_checkout',
        'checkout_start',
        'checkout_redirect',
        'checkout_success',
        'collab_open',
        'collab_submit',
        'collab_success',
        'btx_open',
        'btx_intent',
        'btx_action'
    ]);
    var debugEvents = [];
    var allowedMetadataKeys = new Set(['label', 'destination', 'source', 'plan', 'amount', 'currency', 'cooperationType', 'intent', 'action']);
    var debugCount = null;
    var debugList = null;

    function getSessionId() {
        var key = 'tb-analytics-session';
        try {
            var existing = window.sessionStorage.getItem(key);
            if (existing) return existing;
            var id = window.crypto && window.crypto.randomUUID
                ? window.crypto.randomUUID()
                : 'session-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
            window.sessionStorage.setItem(key, id);
            return id;
        } catch (_) {
            return 'session-' + Date.now().toString(36);
        }
    }

    function clean(value, length) {
        return String(value || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, length);
    }

    function safeMetadata(metadata) {
        var result = {};
        if (!metadata || typeof metadata !== 'object') return result;
        Object.keys(metadata).slice(0, 8).forEach(function(key) {
            var safeKey = clean(key, 40);
            var value = metadata[key];
            if (!safeKey || !allowedMetadataKeys.has(safeKey) || value == null) return;
            if (typeof value === 'number' || typeof value === 'boolean') result[safeKey] = value;
            else result[safeKey] = clean(value, 120);
        });
        return result;
    }

    function viewportGroup() {
        if (window.innerWidth <= 600) return 'mobile';
        if (window.innerWidth <= 1024) return 'tablet';
        return 'desktop';
    }

    function referrerHost() {
        if (!document.referrer) return '';
        try { return new URL(document.referrer).hostname.slice(0, 120); }
        catch (_) { return ''; }
    }

    function attribution() {
        var params = new URLSearchParams(window.location.search);
        return {
            utm_source: clean(params.get('utm_source'), 80),
            utm_medium: clean(params.get('utm_medium'), 80),
            utm_campaign: clean(params.get('utm_campaign'), 100)
        };
    }

    function drawDebug(event) {
        if (!isLocal) return;
        debugEvents.unshift(event);
        debugEvents = debugEvents.slice(0, 12);
        if (debugCount) debugCount.textContent = String(debugEvents.length);
        if (!debugList) return;
        debugList.innerHTML = debugEvents.map(function(item) {
            var time = new Date(item.occurredAt).toLocaleTimeString('zh-CN', { hour12: false });
            var label = item.metadata.label ? ' \u00b7 ' + item.metadata.label : '';
            return '<li><time>' + time + '</time><span>' + item.event + label + '</span></li>';
        }).join('');
    }

    function transmit(payload) {
        if (isLocal) return;
        var body = JSON.stringify(payload);
        if (navigator.sendBeacon) {
            var accepted = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
            if (accepted) return;
        }
        fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: body,
            keepalive: true,
            credentials: 'same-origin'
        }).catch(function() {});
    }

    function track(eventName, metadata) {
        var event = clean(eventName, 50);
        if (!allowedEvents.has(event)) return false;
        var payload = {
            event: event,
            occurredAt: new Date().toISOString(),
            sessionId: getSessionId(),
            path: clean(window.location.pathname, 180) || '/',
            referrerHost: referrerHost(),
            viewport: viewportGroup(),
            language: clean(document.documentElement.lang, 20),
            attribution: attribution(),
            metadata: safeMetadata(metadata)
        };
        drawDebug(payload);
        transmit(payload);
        return true;
    }

    function createDebugPanel() {
        if (!isLocal || document.getElementById('analyticsDebug')) return;
        var panel = document.createElement('aside');
        panel.className = 'analytics-debug';
        panel.id = 'analyticsDebug';
        panel.innerHTML =
            '<button class="analytics-debug-toggle" type="button" aria-expanded="false">' +
                '<span>DATA</span><strong>0</strong>' +
            '</button>' +
            '<div class="analytics-debug-panel" hidden>' +
                '<header><span>LOCAL EVENT STREAM</span><small>不发送到服务器</small></header>' +
                '<ol></ol>' +
            '</div>';
        document.body.appendChild(panel);
        var toggle = panel.querySelector('.analytics-debug-toggle');
        var content = panel.querySelector('.analytics-debug-panel');
        debugCount = toggle.querySelector('strong');
        debugList = content.querySelector('ol');
        toggle.addEventListener('click', function() {
            var open = content.hidden;
            content.hidden = !open;
            toggle.setAttribute('aria-expanded', String(open));
            panel.classList.toggle('is-open', open);
        });
    }

    window.TBAnalytics = {
        track: track,
        isLocal: isLocal,
        events: function() { return debugEvents.slice(); }
    };

    createDebugPanel();

    document.addEventListener('click', function(event) {
        var target = event.target.closest('[data-analytics-event], .project-card[href], .seen-in-item-link, .open-inquiry-link');
        if (!target) return;
        var eventName = target.getAttribute('data-analytics-event');
        if (!eventName) {
            if (target.classList.contains('project-card')) eventName = 'project_open';
            else if (target.classList.contains('seen-in-item-link')) eventName = 'press_open';
            else if (target.classList.contains('open-inquiry-link')) eventName = 'collab_open';
        }
        if (!eventName) return;
        track(eventName, {
            label: target.getAttribute('aria-label') || target.querySelector('.project-name, strong')?.textContent || target.textContent,
            destination: target.getAttribute('href') || ''
        });
    });

    track('page_view');
})();
