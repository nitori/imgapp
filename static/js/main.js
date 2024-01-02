import $ from './jquery.js';
import {html, toggleFullscreen} from './utils.js';

/**
 * @typedef {{name: string, path: string}} ApiFolder
 * @typedef {{name: string, path: string}} ApiFile
 * @typedef {{path: string, folders: ApiFolder[], files: ApiFile[], show_hidden: boolean}} ApiList
 */

const $left = $('#left');
const $path = $('#path');
const $folders = $('#folders');
const $files = $('#files');

const $right = $('#right');
const $imageHolder = $('#image');

/** @type {ApiList} */
let state = {
    path: '',
    folders: [],
    files: [],
    show_hidden: false,
};

async function fetchState() {
    let resp = await fetch('/list');
    /** @type ApiList */
    let data = await resp.json();

    state.path = data.path;
    state.folders = data.folders;
    state.files = data.files;
    state.show_hidden = data.show_hidden;
    updateState();
}

function updateState() {
    $path.text(state.path);
    $folders.empty();
    $files.empty();

    state.folders.forEach(folder => {
        $folders.append(`<div><a href="#${folder.path}" data-folder="${folder.path}">${folder.name}</a></div>`);
    });

    state.files.forEach(file => {
        $files.append(`<div><a href="#${file.path}" data-file="${file.path}">${file.name}</a></div>`);
    });

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
        let filePath = $(ev.target).attr('data-file');
        let imageUrl = new URL(`/get-file`, window.location.origin);
        imageUrl.searchParams.append('path', filePath);

        $imageHolder.empty();
        let $image;
        if (
            filePath.endsWith('.mp4')
            || filePath.endsWith('.webm')
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
    });
}

$(() => fetchState());

window.addEventListener('keypress', ev => {
    if (ev.key === 'f') {
        toggleFullscreen($imageHolder.children().first()[0]);
    }
});
