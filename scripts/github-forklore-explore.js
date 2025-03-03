// ==UserScript==
// @name         Github's Forklore Explore
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Search commits across selected forks of a GitHub project
// @match        https://github.com/*
// @grant        GM_addStyle
// @author       emi (emi.bz)
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.1/moment.min.js
// ==/UserScript==

(function () {
    'use strict';

    // Add custom styles
    GM_addStyle(`
        .custom-box {
            color: var(--fgColor-muted, var(--color-fg-muted, #848d97));
            font-size: 12px;
            border-collapse: separate;
            border-spacing: 0px;
            border-width: 1px;
            border-style: solid;
            border-image: initial;
            border-color: var(--borderColor-default, var(--color-border-default, #30363d));
            border-radius: 6px;
            margin-top: var(--base-size-16, 16px) !important;
        }
        .fgColor-default {
            color: var(--fgColor-default, var(--color-fg-default, #c9d1d9));
        }
        .sortable {
            position: relative;
            cursor: pointer;
        }
        .sortable.active {
            padding-right: var(--base-size-8) !important;
        }
        .sortable.active.lastcolumn {
            padding-right: var(--base-size-20) !important;
        }
        .sortable.active::after {
            position: absolute;
            right: 50%;
            bottom: calc(50% - calc(var(--control-xlarge-size, 48px) / 2 - 2px));
            width: 100%;
            height: 2px;
            content: "";
            background-color: var(--fgColor-default, var(--color-fg-default, #c9d1d9));
            border-radius: 0px;
            transform: translate(50%, -50%);
        }
        .sortable.asc::before {
            content: "▲";
            position: absolute;
            right: 5px;
        }
        .sortable.desc::before {
            content: "▼";
            position: absolute;
            right: 5px;
        }
        .loading {
            font-size: 14px;
            color: var(--color-fg-muted, #848d97);
            display: flex;
            align-items: center;
            justify-content: center;
            margin-top: var(--stack-padding-normal);
            padding-top: var(--stack-padding-normal);
        }
        #fork-search-form {
            margin-top: var(--stack-padding-normal);
            display: none;
        }
        .custom-box-body {
            padding: 0 var(--stack-padding-normal) 0 var(--stack-padding-normal);
        }
        .loading-spinner {
            border: 4px solid rgba(255, 255, 255, 0.3);
            border-top: 4px solid var(--color-fg-default, #c9d1d9);
            border-radius: 50%;
            width: 20px;
            height: 20px;
            animation: spin 1s linear infinite;
            margin-right: 8px;
        }
        @keyframes spin {
            0% {
                transform: rotate(0deg);
            }
            100% {
                transform: rotate(360deg);
            }
        }`);


    // Create and append the search UI
    const searchUI = `
        <div class="custom-box mb-3">
            <div class="Box-header">
                <h2 class="Box-title">
                    Forks
                </h2>
                <button id="api-key-button"
                    style="float: right; font-size: 10px; padding: 2px 5px; margin-top: -5px; cursor: pointer;"
                    class="btn-link">API Key</button>
            </div>
            <div class="Box-body custom-box-body">
                <div id="loading-indicator" class="loading">
                    <div class="loading-spinner"></div> Loading forks...
                </div>
                <form id="fork-search-form" class="d-flex flex-items-center mb-3" style="display: none !important;">
                    <input type="text" id="fork-search-input" class="form-control flex-auto mr-2"
                        placeholder="Search commit messages">
                    <button id="fork-search-button" type="submit" class="btn btn-primary">Search</button>
                </form>
                <div id="fork-search-results"></div>
                <div id="selected-count" class="mb-2"></div>
                <div class="js-details-container Details">
                    <div class="js-details-content">
                        <table id="forkTable" class="width-full custom-box">
                            <thead>
                                <tr class="react-directory-row">
                                    <th class="react-directory-row-name-cell-large-screen"
                                        style="padding-left: var(--base-size-16); text-align: left; padding-top: 3px;">
                                        <input type="checkbox" id="select-all-forks">
                                    </th>
                                    <th class="react-directory-row-name-cell-large-screen sortable fgColor-default"
                                        data-sort="name" style="text-align: left; padding-left: var(--base-size-16);">Fork</th>
                                    <th class="react-directory-row-commit-cell sortable" data-sort="stars"
                                        style="text-align: center;">Stars</th>
                                    <th class="react-directory-row-commit-cell sortable" data-sort="forks"
                                        style="text-align: center;">Forks</th>
                                    <th class="react-directory-row-commit-cell sortable" data-sort="issues"
                                        style="text-align: center;">Issues</th>
                                    <th class="react-directory-row-commit-cell sortable lastcolumn" data-sort="pushed"
                                        style="text-align: right; padding-right: var(--base-size-16);">Last Push</th>
                                </tr>
                            </thead>
                            <tbody></tbody>
                        </table>
                    </div>
                </div>
                <div id="pagination" class="mt-3 d-flex justify-content-between align-items-center"></div>
                <div id="commitResults" class="mt-3"></div>
            </div>
        </div>`;

    // Insert the search UI before the repos-overview
    $('.Layout-main').prepend(searchUI);

    let currentPage = 1;
    const perPage = 10;
    let currentSort = { column: 'stars', direction: 'desc' };
    let selectedForks = new Set();
    let totalForks = 0;
    let allForks = [];
    let fetchingForks = false; // Track the fetching state
    let githubToken = localStorage.getItem('githubToken');
    const headers = githubToken ? { 'Authorization': `token ${githubToken}` } : {};

    async function fetchBaseRepoInfo(repo) {
        const url = `https://api.github.com/repos/${repo}`;

        try {
            const response = await fetch(url, { headers });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`Error fetching base repo info:`, error);
            return null;
        }
    }

    async function fetchForks(repo, page = 1) {
        const response = await fetch(`https://api.github.com/repos/${repo}/forks?sort=stargazers&per_page=100&page=${page}`, { headers });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(JSON.stringify(errorData));
        }

        const data = await response.json();
        const linkHeader = response.headers.get('link'); // Get the Link header

        return { data, linkHeader }; // Return both the data and the link header
    }

    async function fetchCommits(repo) {
        const response = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=100`, { headers });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(JSON.stringify(errorData));
        }

        return await response.json();
    }

    async function fetchAndDisplayForks(repo) {
        if (fetchingForks) return;
        fetchingForks = true;
        let page = 1;
        totalForks = 0;
        allForks = [];

        $('#loading-indicator').show();
        $('#fork-search-form, #forkTable, #pagination').hide();

        const baseRepoInfo = await fetchBaseRepoInfo(repo);
        const baseRepoSize = baseRepoInfo ? baseRepoInfo.size : null;

        async function loadNextPage(url) {
            try {
                const { data: forks, linkHeader } = await fetchForks(repo, page);
                if (forks.length > 0) {
                    const filteredForks = baseRepoSize !== null
                    ? forks.filter(fork => fork.size !== baseRepoSize)
                    : forks;
                    allForks = allForks.concat(filteredForks);
                    allForks = removeDuplicates(allForks);
                    totalForks = allForks.length;
                    sortForks('pushed', 'desc');
                    updateTable(allForks.slice((currentPage - 1) * perPage, currentPage * perPage));
                    updatePagination();

                    if (linkHeader && linkHeader.includes('rel="next"')) {
                        const nextUrl = linkHeader.match(/<([^>]+)>;\s*rel="next"/)[1];
                        page++;
                        loadNextPage(nextUrl);
                    } else {
                        fetchingForks = false;
                        $('#loading-indicator').hide();
                        $('#fork-search-form, #forkTable, #pagination').show();
                    }
                } else {
                    fetchingForks = false;
                    $('#loading-indicator').hide();
                    $('#fork-search-form, #forkTable, #pagination').show();
                }
                updateSelectedCount();
            } catch (error) {
                let errorMessage = 'An error occurred while fetching forks.';
                try {
                    const errorData = JSON.parse(error.message); // Parse the JSON error message
                    if (errorData.message) {
                        errorMessage = `${errorData.message} <a href="${errorData.documentation_url}" target="_blank">Learn more</a>`;
                    }
                } catch (parseError) {
                    console.error('Error parsing error response:', parseError);
                }

                $('#fork-search-results').html(`<div class="flash flash-error">${errorMessage}</div>`);
                fetchingForks = false; // Reset fetching state in case of error
                $('#loading-indicator').hide(); // Hide loading indicator
                $('#fork-search-form, #forkTable, #pagination').show(); // Show the table and form
            }
        }

        // Start fetching the first page
        loadNextPage(`https://api.github.com/repos/${repo}/forks?sort=newest&per_page=100&page=1`);
    }



    async function searchCommits() {
        // Disable the search form and button
        $('#fork-search-input, #fork-search-button').prop('disabled', true);

        const query = $('#fork-search-input').val().trim().toLowerCase();
        let commitResults = '';

        for (const fork of selectedForks) {
            try {
                const commits = await fetchCommits(fork);
                const filteredCommits = commits.filter(commit =>
                    commit.commit.message.split('\n')[0].toLowerCase().includes(query)
                );
                if (filteredCommits.length === 0) continue;

                commitResults += `<h4>${fork}</h4><ul style="list-style: auto; padding-left: var(--base-size-24);">`;
                filteredCommits.forEach(commit => {
                    commitResults += `
                        <li style="font-size: 14px;">
                            <div class="react-directory-row-name-cell-large-screen">
                                <a href="${commit.html_url}" class="Link--secondary">
                                    <span>${commit.sha.substring(0, 7)}</span>
                                    <span>${commit.commit.message.split('\n')[0]}</span>
                                </a>
                            </div>
                        </li>`;
                });
                commitResults += '</ul>';
            } catch (error) {
                try {
                    const errorData = JSON.parse(error.message); // Parse the JSON error message
                    commitResults += `<p class="color-fg-danger">Error fetching commits for ${fork}: ${errorData.message} <a href="${errorData.documentation_url}" target="_blank">Learn more</a></p>`;
                } catch (parseError) {
                    commitResults += `<p class="color-fg-danger">Error fetching commits for ${fork}: ${error.message}</p>`;
                }
            }
        }

        // Display the search results
        $('#commitResults').html(commitResults);

        // Re-enable the search form and button
        $('#fork-search-input, #fork-search-button').prop('disabled', false);
    }


    function updateTable(data) {
        const tableBody = $('#forkTable tbody');
        tableBody.empty();
        data.forEach((fork) => {
            const row = `
                <tr class="react-directory-row">
                    <td class="react-directory-row-name-cell-large-screen">
                        <input type="checkbox" class="fork-checkbox" data-repo="${fork.full_name}" ${selectedForks.has(fork.full_name) ? 'checked' : '' } style="vertical-align: middle;">
                    </td>
                    <td class="react-directory-row-commit-cell">
                        <div class="react-directory-commit-message">
                            <a href="${fork.html_url}" class="Link--primary">
                                <img src="${fork.owner.avatar_url
                            }" width="20" height="20" class="avatar avatar-user" style="margin-right: 5px;" />
                                ${fork.full_name}
                            </a>
                        </div>
                    </td>
                    <td class="react-directory-row-commit-cell" style="text-align: center; padding-left: 0;">${fork.stargazers_count}</td>
                    <td class="react-directory-row-commit-cell" style="text-align: center; padding-left: 0;">${fork.forks_count}</td>
                    <td class="react-directory-row-commit-cell" style="text-align: center; padding-left: 0;">${fork.open_issues_count}</td>
                    <td>
                        <div class="react-directory-commit-age">
                            <relative-time datetime="${fork.pushed_at}">${moment(
                                fork.pushed_at
                                ).fromNow()}</relative-time>
                        </div>
                    </td>
                </tr>`;
            tableBody.append(row);
        });
        updateSelectedCount();
    }

    function updatePagination() {
        const pagination = $('#pagination');
        pagination.empty();

        const pageControls = $(`
            <div style="display: flex; align-items: center; width: 100%;">
                <div style="flex: 1;">
                    ${currentPage > 1 ? '<button id="prevPage" class="btn btn-sm">Previous</button>' : ''}
                </div>
                <div style="flex: 1; text-align: center;">
                    Page ${currentPage} of ${Math.ceil(totalForks / perPage)} (${totalForks} total forks)
                </div>
                <div style="flex: 1; text-align: right;">
                    ${(currentPage * perPage < totalForks) ? '<button id="nextPage" class="btn btn-sm">Next</button>' : '' } </div>
                </div>`);

        pagination.append(pageControls);
    }


    function sortForks(column, direction) {
        allForks.sort((a, b) => {
            let aValue, bValue;

            switch (column) {
                case 'name':
                    aValue = a.full_name.toLowerCase();
                    bValue = b.full_name.toLowerCase();
                    break;
                case 'stars':
                    aValue = a.stargazers_count;
                    bValue = b.stargazers_count;
                    break;
                case 'forks':
                    aValue = a.forks_count;
                    bValue = b.forks_count;
                    break;
                case 'issues':
                    aValue = a.open_issues_count;
                    bValue = b.open_issues_count;
                    break;
                case 'pushed':
                    aValue = new Date(a.pushed_at);
                    bValue = new Date(b.pushed_at);
                    break;
                default:
                    return 0;
            }

            if (aValue < bValue) return direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    function sortTable(column) {
        if (fetchingForks) return; // Prevent sorting while fetching
        currentSort.column = column;
        currentSort.direction =
            currentSort.direction === 'asc' ? 'desc' : 'asc';

        $('.sortable').removeClass('active asc desc');
        $(`th[data-sort="${column}"]`).addClass(`active ${currentSort.direction}`);

        sortForks(column, currentSort.direction);
        currentPage = 1;
        updateTable(allForks.slice((currentPage - 1) * perPage, currentPage * perPage)); // Re-render the table after sorting
        updatePagination(); // Update pagination after sorting
    }

    // Function to handle token input
    function promptForToken() {
        const token = prompt('Please enter your GitHub personal access token:');
        if (token) {
            localStorage.setItem('githubToken', token);
            githubToken = token;
            alert('Token saved successfully!');
        } else {
            alert('No token entered. You can still proceed with limited API access.');
        }
    }

    function removeDuplicates(forks) {
        const uniqueForks = [];
        const forkNames = new Set();

        for (const fork of forks) {
            if (!forkNames.has(fork.full_name)) {
                uniqueForks.push(fork);
                forkNames.add(fork.full_name);
            }
        }

        return uniqueForks;
    }

    function updateSelectedCount() {
        const selectedCount = selectedForks.size;
        const totalCount = allForks.length;
        if (selectedCount > 0) {
            $('#selected-count').text(`${selectedCount} of ${totalCount} forks selected`);
            $('#fork-search-form').prop('style', `display: box !important;`);
        } else {
            $('#selected-count').text('');
            $('#fork-search-form').prop('style', `display: none !important;`);
        }
        const anyChecked = selectedForks.size > 0;
    }

    // Event listeners
    $('#api-key-button').on('click', function () {
        promptForToken();
    });

    $('#fork-search-form').on('submit', function (e) {
        e.preventDefault();
        searchCommits();
    });

    $(document).on('change', '.fork-checkbox', function () {
        const repo = $(this).data('repo');
        if (this.checked) {
            selectedForks.add(repo);
        } else {
            selectedForks.delete(repo);
        }
        updateSelectedCount();
    });

    $('#pagination').on('click', '#prevPage', function () {
        if (currentPage > 1) {
            currentPage--;
            updateTable(allForks.slice((currentPage - 1) * perPage, currentPage * perPage));
            updatePagination();
        }
    });

    $('#pagination').on('click', '#nextPage', function () {
        currentPage++;
        updateTable(allForks.slice((currentPage - 1) * perPage, currentPage * perPage));
        updatePagination();
    });

    $('#select-all-forks').on('change', function () {
        const isChecked = $(this).is(':checked');
        $('.fork-checkbox').prop('checked', isChecked);
        if (isChecked) {
            allForks.forEach((fork) => selectedForks.add(fork.full_name));
        } else {
            selectedForks.clear();
        }
        updateSelectedCount();
    });

    $('#forkTable thead').on('click', '.sortable', function () {
        const column = $(this).data('sort');
        sortTable(column);
    });

    // Check if we're on a GitHub repository page
    if (!window.location.pathname.match(/^\/[^/]+\/[^/]+\/?$/) && !window.location.pathname.match(/^\/[^/]+\/[^/]+\/tree\/[^/]+\/?$/)) return;

    // Extract owner and repo from the URL
    const splitted = window.location.pathname.split('/');
    const owner = splitted[1];
    const repo = splitted[2];
    console.log(owner, repo)

    // Auto-fill and search if on a repository page
    fetchAndDisplayForks(`${owner}/${repo}`);
    currentSort = { column: 'pushed', direction: 'desc' };
})();

