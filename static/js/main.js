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

let currentFile = null;

let sortState = {
    sort_by: 'name',
    sort_order: 'asc',
};

async function fetchState() {
    let resp = await fetch('/list');
    /** @type ApiList */
    let data = await resp.json();

    state.path = data.path;
    state.folders = data.folders;
    state.files = data.files;
    state.show_hidden = data.show_hidden;

    let resp2 = await fetch('/sorting');
    let data2 = await resp2.json();
    sortState.sort_by = data2.sort_by;
    sortState.sort_order = data2.sort_order;
    updateState();
}

function updateState() {
    $path.text(state.path);
    $folders.empty();
    $files.empty();
    $('*[data-file]').removeClass('red');

    state.folders.forEach(folder => {
        $folders.append(`<div><a href="#${folder.path}" data-folder="${folder.path}">${folder.name}</a></div>`);
    });

    state.files.forEach(file => {
        $files.append(`<div><a href="#${file.path}" data-file="${file.path}" class="${
            file.path === currentFile ? 'red' : ''
        }">${file.name}</a></div>`);
    });

    $sortingShortcuts.empty();
    $sortingShortcuts.append(`<span class="${sortState.sort_by === 'name' ? 'red' : ''}">n: name</span><br>`);
    $sortingShortcuts.append(`<span class="${sortState.sort_by === 'mtime' ? 'red' : ''}">m: mtime</span><br>`);
    $sortingShortcuts.append(`<span class="${sortState.sort_order === 'desc' ? 'red' : ''}">r: reverse</span><br>`);
    $sortingShortcuts.append(`<span class="${state.show_hidden ? 'red' : ''}">h: hidden</span><br>`);

    if (currentFile !== null) {
        let imageUrl = new URL(`/get-file`, window.location.origin);
        imageUrl.searchParams.append('path', currentFile);

        $imageHolder.empty();
        let $image;
        if (
            currentFile.endsWith('.mp4')
            || currentFile.endsWith('.webm')
        ) {
            $image = $(html`
                <video controls autoplay>
                    <source src="${imageUrl}">
                </video>`);
        } else {
            $image = $(html`<img src="${imageUrl}"/>`);
        }

        $image.attr('src', imageUrl);
        $imageHolder.append($image);
    }

    updateEvents();
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
}

function prevImage() {
    let index = state.files.findIndex(file => file.path === currentFile);
    if (index <= 0) {
        return;
    }
    index--;
    currentFile = state.files[index].path;
    updateState();
}

$(() => fetchState());

window.addEventListener('keypress', ev => {
    if (ev.key === 'f') {
        toggleFullscreen($imageHolder.children().first()[0]);
    } else if (ev.key === 'r') {
        (async () => {
            let resp = await fetch('/update-sorting', {
                method: 'POST',
                body: new URLSearchParams({
                    sort_order: sortState.sort_order === 'asc' ? 'desc' : 'asc',
                }),
            });
            let data = await resp.json();
            sortState.sort_by = data.sort_by;
            sortState.sort_order = data.sort_order;
            await fetchState();
        })();
    } else if (ev.key === 'n' || ev.key === 'm') {
        (async () => {
            let resp = await fetch('/update-sorting', {
                method: 'POST',
                body: new URLSearchParams({
                    sort_by: ev.key === 'n' ? 'name' : 'mtime',
                }),
            });
            let data = await resp.json();
            sortState.sort_by = data.sort_by;
            sortState.sort_order = data.sort_order;
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

window.addEventListener('wheel', ev => {
    console.log(ev.deltaY);
    if (ev.deltaY < 0) {
        prevImage();
    } else if (ev.deltaY > 0) {
        nextImage();
    }
});
