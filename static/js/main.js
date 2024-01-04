import $ from './jquery.js';
import {html, toggleFullscreen} from './utils.js';

/**
 * @typedef {{name: string, path: string}} ApiFolder
 * @typedef {{name: string, path: string, mtime: Number}} ApiFile
 * @typedef {{path: string, folders: ApiFolder[], files: ApiFile[], show_hidden: boolean}} ApiList
 */

const $left = $('#left');
const $path = $('#path');
const $folders = $('#folders');
const $files = $('#files');

const $right = $('#right');
const $imageHolder = $('#image');
const $sortingShortcuts = $('#sorting-shortcuts');

/** @type {ApiList} */
let state = {
    path: '',
    folders: [],
    files: [],
    show_hidden: false,
};

/** @type {string|null} */
let currentFile = null;

let sortState = {
    sort_by: 'name',
    sort_order: 'asc',
};
let sortStateChanged = false;

async function fetchState() {
    let data = {path: '', folders: [], files: [], show_hidden: false};
    try {
        let resp = await fetch('/list');
        /** @type ApiList */
        data = await resp.json();
    } catch (e) {
        console.error(e);
    }
    let pathChanged = state.path !== data.path;

    state.path = data.path;
    state.folders = data.folders;
    state.files = data.files;
    state.show_hidden = data.show_hidden;

    if (pathChanged) {
        if (state.files.length > 0) {
            currentFile = state.files[0].path;
        } else {
            currentFile = null;
        }
    }

    let resp2 = await fetch('/sorting');
    let data2 = await resp2.json();
    sortStateChanged = sortState.sort_by !== data2.sort_by || sortState.sort_order !== data2.sort_order;
    sortState.sort_by = data2.sort_by;
    sortState.sort_order = data2.sort_order;
    updateState();
}

async function preload(index) {
    if (index < 0 || index >= state.files.length) {
        return;
    }
    let file = state.files[index];
    let imageUrl = new URL(`/get-file`, window.location.origin);
    imageUrl.searchParams.append('path', file.path);
    let img = new Image();
    img.src = imageUrl.toString();
}

function updateState() {
    let rebuildLists = true;
    if (!sortStateChanged && $path.text() === state.path) {
        rebuildLists = false;
    } else {
        $path.text(state.path);
        $path.attr('title', state.path);
        $folders.empty();
        $files.empty();
    }
    sortStateChanged = false; // reset

    if (currentFile === null) {
        $imageHolder.empty();
        document.title = 'Image Viewer';
    } else {
        let imageUrl = new URL(`/get-file`, window.location.origin);
        imageUrl.searchParams.append('path', currentFile);
        document.title = currentFile.split(/\//).pop();

        $imageHolder.empty();
        let $image;
        if (
            currentFile.endsWith('.mp4')
            || currentFile.endsWith('.webm')
        ) {
            $image = $(html`
                <video controls autoplay loop>
                    <source src="${imageUrl}">
                </video>`);
        } else {
            $image = $(html`<img src="${imageUrl}"/>`);
        }

        $image.attr('src', imageUrl);
        $imageHolder.append($image);
        focusCurrentFile();
    }

    if (rebuildLists) {
        state.folders.forEach(folder => {
            $folders.append(`<div><a href="#${folder.path}" title="${folder.name}" data-folder="${folder.path}">${folder.name}</a></div>`);
        });
    }

    if (rebuildLists) {
        state.files.forEach(file => {
            $files.append(`<div><a href="#${file.path}" title="${file.name}" data-file="${file.path}" class="${
                file.path === currentFile ? 'red' : ''
            }">${file.name}</a></div>`);
        });
    } else {
        $files.find('.red').removeClass('red');
        $files.find(`*[data-file="${currentFile}"]`).addClass('red');
    }

    $sortingShortcuts.empty();
    $sortingShortcuts.append(`<span class="${sortState.sort_by === 'name' ? 'red' : ''}">n: name</span><br>`);
    $sortingShortcuts.append(`<span class="${sortState.sort_by === 'mtime' ? 'red' : ''}">m: mtime</span><br>`);
    $sortingShortcuts.append(`<span class="${sortState.sort_order === 'desc' ? 'red' : ''}">r: reverse</span><br>`);
    $sortingShortcuts.append(`<span class="${state.show_hidden ? 'red' : ''}">h: hidden</span><br>`);

    updateEvents();
}

function focusCurrentFile() {
    if (currentFile === null) {
        return;
    }
    let $el = $files.find(`*[data-file="${currentFile}"]`);
    if ($el.length === 0) {
        return;
    }
    $el[0].scrollIntoView({behavior: 'instant', block: 'nearest'});
}

function updateEvents() {
    $('*[data-folder]').off('click').on('click', (ev) => {
        ev.preventDefault();
        let newPath = $(ev.target).attr('data-folder');

        (async () => {
            await fetch('/change-folder', {
                method: 'POST',
                body: new URLSearchParams({path: newPath}),
            });
            await fetchState();
        })();
    });

    $('*[data-file]').off('click').on('click', (ev) => {
        ev.preventDefault();
        currentFile = $(ev.target).attr('data-file');
        updateState();
    });
}

function nextImage() {
    let index = state.files.findIndex(file => file.path === currentFile);
    if (index >= state.files.length - 1) {
        return;
    }
    index++;
    currentFile = state.files[index].path;
    updateState();
    preload(index + 1);
}

function prevImage() {
    let index = state.files.findIndex(file => file.path === currentFile);
    if (index <= 0) {
        return;
    }
    index--;
    currentFile = state.files[index].path;
    updateState();
    preload(index - 1);
}

$(() => fetchState());

window.addEventListener('keypress', ev => {
    if (ev.key === 'f') {
        toggleFullscreen($imageHolder[0]);
    } else if (ev.key === 'r') {
        (async () => {
            await fetch('/update-sorting', {
                method: 'POST',
                body: new URLSearchParams({
                    sort_order: sortState.sort_order === 'asc' ? 'desc' : 'asc',
                }),
            });
            await fetchState();
        })();
    } else if (ev.key === 'n' || ev.key === 'm') {
        (async () => {
            await fetch('/update-sorting', {
                method: 'POST',
                body: new URLSearchParams({
                    sort_by: ev.key === 'n' ? 'name' : 'mtime',
                }),
            });
            await fetchState();
        })();
    } else if (ev.key === 'h') {
        (async () => {
            await fetch('/toggle-hidden', {method: 'POST'});
            await fetchState();
        })();
    }
});

window.addEventListener('keydown', ev => {
    if (ev.key === 'PageUp') {
        ev.preventDefault();
        prevImage();
    } else if (ev.key === 'PageDown') {
        ev.preventDefault();
        nextImage();
    } else if (ev.key === 'Home') {
        ev.preventDefault();
        currentFile = state.files[0].path;
        updateState();
    } else if (ev.key === 'End') {
        ev.preventDefault();
        currentFile = state.files[state.files.length - 1].path;
        updateState();
    }
});

$imageHolder[0].addEventListener('wheel', ev => {
    if (ev.deltaY < 0) {
        prevImage();
    } else if (ev.deltaY > 0) {
        nextImage();
    }
});
