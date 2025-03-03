// ==UserScript==
// @name         Checkout My Colors
// @namespace    http://tampermonkey.net/
// @version      0.5
// @description  Colorizes commit timestamps in GitHub file listings with a gradient
// @author       emi (emi.bz)
// @match        https://github.com/*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    "use strict";
    function stepColor(step) {
        const h1 = 40, s1 = 0,  l1 = 20; // Older commits
        const h2 = 40, s2 = 90, l2 = 75; // Newest commits

        // Apply a non-linear curve to emphasize recency
        const adjustedStep = Math.pow(step, 2); // Square root scaling (makes recent commits stand out more)

        // Interpolate Hue, Saturation, and Lightness
        const h = h1 + (h2 - h1) * adjustedStep;
        const s = s1 + (s2 - s1) * adjustedStep;
        const l = l1 + (l2 - l1) * adjustedStep;

        return `hsl(${h.toFixed(1)}, ${s.toFixed(1)}%, ${l.toFixed(1)}%)`;
    }


    function hslToRgb(h, s, l) {
        let r, g, b;
        if (s == 0) {
            r = g = b = l; // achromatic
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };

            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }

    function colorizeTimestamps() {
        console.log("colorizeTimestamps() called");
        const timestampElements = Array.from(document.querySelectorAll(".react-directory-commit-age relative-time"));

        if (timestampElements.length === 0) {
            console.log("No timestamp elements found. Returning.");
            return;
        }

        console.log(`Found ${timestampElements.length} timestamp elements.`);

        const dates = [];
        for (const ts of timestampElements) {
            const title = ts.getAttribute("title");
            if (title) {
                try {
                    const date = new Date(title);
                    if (isNaN(date)) {
                        console.error("Invalid date format:", title, ts);
                    } else {
                        dates.push(date);
                    }
                } catch (error) {
                    console.error("Error parsing date:", title, ts, error);
                }
            }
        }

        if (dates.length === 0) {
            return;
        }

        const oldestDate = new Date(Math.min(...dates));
        const newestDate = new Date(Math.max(...dates));
        const timeRange = newestDate.getTime() - oldestDate.getTime();

        console.log("Oldest Date:", oldestDate);
        console.log("Newest Date:", newestDate);
        console.log("Time Range (ms):", timeRange);

        timestampElements.forEach((timestamp, index) => {
            const title = timestamp.getAttribute("title");
            if (!title) return; // Skip if no title

            const commitDate = new Date(title);
            const age = commitDate.getTime() - oldestDate.getTime();
            const normalizedAge = timeRange === 0 ? 0 : age / timeRange;

            const color = stepColor(normalizedAge);
            timestamp.style.color = color;

            // Highlight the most recent commit with bold text and a different color
            if (commitDate.getTime() === newestDate.getTime()) {
                timestamp.style.fontWeight = "bold";
            }

            console.log(`Colorized ${title} to ${color}`);
        });
    }

    const observer = new MutationObserver((mutations) => {
        console.log("MutationObserver triggered:", mutations); // Log when observer fires
        colorizeTimestamps(); // Re-run colorization
    });

    // Start observing the document body
    const observerConfig = {
        childList:       true,   // Watch for changes in the direct children of the target
        subtree:         true,     // Watch for changes in all descendants of the target
        attributes:      true,  // Watch for attribute changes (e.g., title changing on relative-time)
        attributeFilter: ["title", "datetime"], //only trigger if these change
    };
    observer.observe(document.body, observerConfig);

    // Initial colorization (in case the elements are already present)
    colorizeTimestamps();
})();

