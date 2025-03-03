// ==UserScript==
// @name         Aliexpress Noise Canceller
// @version      1.0
// @description  Hides AliExpress injected products that don't match all queries
// @author       emi (emi.bz)
// @match        *://*.aliexpress.com*/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=aliexpress.com
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==

(() => {
    'use strict';

    // Helper function to get URL query parameters
    function getQueryParam(param) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(param);
    }

    // Helper function to filter items by shipping country
    function filterItemsByShipFrom(items, country) {
        return items.filter(item => {
            const pdpCdi = item.trace.pdpParams.pdp_cdi;
            if (!pdpCdi) {
                console.log(`Item ${item.title.displayTitle} does not have pdp_cdi information.`);
                return true; // or `return true;` depending on whether you want to include or exclude items with no pdp_cdi data
            }
            try {
                const decodedPdpCdi = decodeURIComponent(pdpCdi);
                const pdpCdiObject = JSON.parse(decodedPdpCdi);
                const shipsProperly = pdpCdiObject.shipFrom === country;
                console.log(`Item ${item.title.displayTitle} ` + (shipsProperly ? `contains ${country} in shipFrom` : `does not contain ${country} in shipFrom`));
                return shipsProperly;
            } catch (error) {
                console.error(`Error parsing pdp_cdi for item ${item.title.displayTitles}: `, error);
                return false;
            }
        });
    }

    // Helper function to filter items that are ads
    function filterItemsThatAreAds(items) {
        return items.filter(item => {
            return item.productType != "ad";
        });
    }

    // Intercepts and modifies XHR responses
    function interceptXHR() {
        const originalOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
            this.addEventListener('readystatechange', () => {
                if (this.readyState === 4 && this.status === 200 && url.includes('/fn/search-pc/index')) {
                    try {
                        const responseJson = JSON.parse(this.responseText);
                        const searchFilters = responseJson?.data?.result?.mods?.searchRefineFilters?.content;
                        if (searchFilters) {
                            const shippingFilter = searchFilters.find(filter => filter.paramName === 'shpf_co');
                            const selectedCountry = shippingFilter ? shippingFilter.content.find(item => item.selected)?.selectedValue : null;
                            let items = responseJson?.data?.result?.mods?.itemList?.content;
                            if (items && selectedCountry) {
                                items = filterItemsByShipFrom(items, selectedCountry);
                                // items = filterItemsThatAreAds(items, selectedCountry);
                                responseJson.data.result.mods.itemList.content = items;
                                Object.defineProperty(this, 'responseText', { value: JSON.stringify(responseJson) });
                                console.log(`Modified XHR items to only include products shipped from ${selectedCountry}`);
                            }
                        }
                    } catch (error) {
                        console.error('Failed to parse and modify the response:', error);
                    }
                }
            });
            originalOpen.apply(this, [method, url, ...rest]);
        };
    }

    function injectConfigModifier() {
        const modifyInitData = function() {
            let dida_config = {};
            Object.defineProperty(window, '_dida_config_', {
                set(config) {
                    const searchFilters = config?._init_data_?.data?.data?.root?.fields?.mods?.searchRefineFilters?.content;
                    if (searchFilters) {
                        const shippingFilter = searchFilters.find(filter => filter.paramName === 'shpf_co');
                        const selectedCountry = shippingFilter ? shippingFilter.content.find(item => item.selected)?.selectedValue : null;
                        const items = config?._init_data_?.data?.data?.root?.fields?.mods?.itemList?.content;
                        if (items && selectedCountry) {
                            let items = config._init_data_.data.data.root.fields.mods.itemList.content;
                            if (items) {
                                items = filterItemsByShipFrom(items, selectedCountry);
                                // items = filterItemsThatAreAds(items, selectedCountry);
                                config._init_data_.data.data.root.fields.mods.itemList.content = items
                                console.log(`Filtered initialization data to only include products shipped from ${selectedCountry}`);
                            }
                        }
                    }
                    dida_config = config;
                },
                get() {
                    return dida_config;
                },
                configurable: true
            });
        };

        const script = document.createElement('script');
        script.textContent = `${filterItemsByShipFrom.toString()}; ${filterItemsThatAreAds.toString()}; (${modifyInitData.toString()})();`;
        document.documentElement.appendChild(script);
        script.remove();
    }

    interceptXHR();
    injectConfigModifier();
})();