// ==UserScript==
// @name         Udio Secret Spiller
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Extracts and displays Udio song generation settings and sampler options from a UUID in the meta tag with styled list items
// @author       emi (emi.bz)
// @match        https://www.udio.com/songs/*
// @match        https://www.udio.com/*
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    /**
     * Extract UUID from the provided URL using regex.
     * @param {string} url - The URL string to extract UUID from.
     * @returns {string|null} - The extracted UUID or null if not found.
     */
    function extractUUID(url) {
        const match = url.match(/embed\/([a-zA-Z0-9-]{36})/);
        return match ? match[1] : null;
    }

    /**
     * Create and append the settings container to the specified parent element.
     * @param {Object} combinedSettings - The combined generation settings and sampler options.
     * @param {HTMLElement} parentElement - The DOM element to append the settings to.
     */
    function appendSettings(combinedSettings, parentElement) {
        if (!parentElement) {
            console.warn('Parent element for settings not found.');
            return;
        }

        const settingsContainer = document.createElement('div');
        settingsContainer.style.marginTop = '10px';

        for (const [key, value] of Object.entries(combinedSettings)) {
            const settingDiv = document.createElement('div');
            try {
                value = JSON.parse(value);
                console.log("parsed " + value);
            } catch (e) {}
            settingDiv.className = 'border-white/opacity-10 mx-4 mb-4 flex rounded-lg border px-4 py-3 md:mx-0 md:mb-3 md:border-none md:px-0 md:py-0';
            settingDiv.innerHTML = `
                    <div class="flex flex-1 flex-col">
                        <div class="mb-2 text-base text-brand-gray-light md:hidden">${key}</div>
                        <div class="items-center md:flex">
                            <div class="text-base font-normal leading-5 text-muted-foreground">
                                <span class="hidden text-sm md:block ">${key}: ${JSON.stringify(value, null, 4)}</span>
                            </div>
                        </div>
                    </div>
            `;
            settingsContainer.appendChild(settingDiv);
        }

        parentElement.appendChild(settingsContainer);
    }

    /**
     * Fetch settings from the API and append them to the DOM.
     * @param {string} uuid - The UUID of the song.
     */
    function fetchAndDisplaySettings(uuid) {
        const apiUrl = `https://www.udio.com/api/songs/${uuid}/settings`;
        console.log("Making request to " + apiUrl);

        GM_xmlhttpRequest({
            method: "GET",
            url: apiUrl,
            onload: function (response) {
                if (response.status === 200) {
                    try {
                        const result = JSON.parse(response.responseText);
                        const combinedSettings = {
                            ...result.generationSettings,
                            ...result.samplerOptions
                        };

                        const tagLink = document.querySelector('a[href^="/tags"]');
                        if (tagLink) {
                            const parentElement = tagLink.parentElement;
                            appendSettings(combinedSettings, parentElement);
                        }
                    } catch (error) {
                        console.error("Error parsing API response:", error);
                    }
                } else {
                    console.error(`Failed to fetch settings. Status: ${response.status}`);
                }
            },
            onerror: function (error) {
                console.error("GM_xmlhttpRequest failed:", error);
            }
        });
    }

    /**
     * Initialize settings extraction on page load by checking the meta tag.
     */
    function initializeOnPageLoad() {
        const metaTag = document.querySelector('meta[name="twitter:player"]');
        if (metaTag) {
            const contentUrl = metaTag.getAttribute('content');
            const uuid = extractUUID(contentUrl);
            if (uuid) {
                fetchAndDisplaySettings(uuid);
            } else {
                console.warn("UUID not found in meta tag content.");
            }
        }
    }

    /**
     * Add click event listeners to track detail links to fetch and display settings dynamically.
     */
    function initializeTrackDetailListeners() {
        const targetSelector = 'a[aria-description="open track details preview"]';

        /**
         * Handler for when a track detail link is clicked.
         * @param {Event} event - The click event.
         */
        function handleTrackDetailClick(event) {
            event.preventDefault();
            const link = event.currentTarget;
            const shortUuid = link.href.split('/').pop();
            const songUrl = `https://www.udio.com/songs/${shortUuid}`;

            GM_xmlhttpRequest({
                method: "GET",
                url: songUrl,
                onload: function (response) {
                    if (response.status === 200) {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(response.responseText, "text/html");
                        const metaTag = doc.querySelector('meta[name="twitter:player"]');
                        if (metaTag) {
                            const contentUrl = metaTag.getAttribute('content');
                            const longUuid = extractUUID(contentUrl);
                            if (longUuid) {
                                fetchAndDisplaySettings(longUuid);
                            } else {
                                console.warn("Long UUID not found in song page meta tag.");
                            }
                        } else {
                            console.warn("Meta tag 'twitter:player' not found in song page.");
                        }
                    } else {
                        console.error(`Failed to fetch song page. Status: ${response.status}`);
                    }
                },
                onerror: function (error) {
                    console.error("GM_xmlhttpRequest failed:", error);
                }
            });
        }

        /**
         * Observe the DOM for addition of target track detail links and attach listeners.
         */
        function observeTrackDetailLinks() {
            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                const links = node.matches(targetSelector) ? [node] : node.querySelectorAll(targetSelector);
                                links.forEach(link => {
                                    if (!link.dataset.settingsListener) { // Prevent multiple listeners
                                        link.addEventListener('click', handleTrackDetailClick);
                                        link.dataset.settingsListener = 'true';
                                        console.log("Added click listener for:", link.href);
                                    }
                                });
                            }
                        });
                    }
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });
        }

        observeTrackDetailLinks();
    }

    /**
     * Main initialization function.
     */
    function main() {
        initializeOnPageLoad();
        initializeTrackDetailListeners();
    }

    // Run the main function
    main();

})();
