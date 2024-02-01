/*
This file is part of imgapp.

imgapp is free software: you can redistribute it and/or modify it under the
terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version.

imgapp is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with
imgapp. If not, see <https://www.gnu.org/licenses/>.
*/
import $ from './jquery.js';
import {html, toggleFullscreen} from './utils.js';

/**
 * @typedef {{name: string, path: string}} ResponseFolder
 * @typedef {{name: string, path: string, mtime: Number}} ResponseFile
 * @typedef {{canonical_path: string, folders: ResponseFolder[], files: ResponseFile[], show_hidden: boolean}} ResponseList
 */

/**
 * @typedef {{name: string, path: string}} AppFolder
 * @typedef {{name: string, path: string, mtime: Number}} AppFile
 *
 * @typedef {{
 *  currentPath: string|null,
 *  currentFile: string|null,
 *  folders: AppFolder[],
 *  files: AppFile[],
 *  showHidden: boolean,
 *  sortOrder: string,
 *  sortBy: string
 * }} AppState
 */

const MAX_CACHED_IMAGES = 50;
const HIDE_CURSOR_TIMEOUT = 5000;

/** @type {AppState} */
const defaultState = {
    currentPath: null,
    currentFile: null,

    folders: [],
    files: [],
    showHidden: false,

    sortBy: 'name',
    sortOrder: 'asc',
}

export default class App {
    constructor() {
        this.$left = $('#left');
        this.$path = $('#path');
        this.$folders = $('#folders');
        this.$files = $('#files');

        this.$right = $('#right');
        this.$imageHolder = $('#image');
        this.$sortingShortcuts = $('#sorting-shortcuts');

        this._listRebuildRequired = true;
        this._previousFolder = null;

        // path string -> Image object
        /** @type {Object.<string, {img: HTMLImageElement, ts: number}>} */
        this._fileCache = {};

        this.load();
        this._fetchList(this.state.currentPath, true);
    }

    load() {
        let state = localStorage.getItem('imageapp-state');
        if (typeof state === 'string') {
            try {
                state = JSON.parse(state);
            } catch (e) {
                console.error(e);
                state = null;
            }
        }

        if (state === null) {
            state = {};
        }

        /** @type {AppState} */
        this.state = {...defaultState, ...state};

        // get index for quicker access.
        this._fileIndex = Math.max(0, this.state.files.findIndex(f => f.path === this.state.currentFile));
    }

    save() {
        localStorage.setItem('imageapp-state', JSON.stringify(this.state));
    }

    /**
     * @param path {string|null}
     * @param [forceRebuild] {boolean}
     * @returns {Promise<void>}
     * @private
     */
    async _fetchList(path, forceRebuild) {
        /** @type ResponseList */
        let data;
        try {
            let resp = await fetch('/list?' + $.param({path}));
            data = await resp.json();
        } catch (e) {
            console.error(e);
        }

        this._listRebuildRequired = this.state.currentPath !== data.canonical_path || forceRebuild === true;

        this.state.currentPath = data.canonical_path;
        this.state.folders = data.folders;
        this.state.files = data.files;
        this._resort();

        if (this.state.files.length > 0) {
            this._fileIndex = this.state.files.findIndex(f => f.path === this.state.currentFile);
            if (this._fileIndex === -1) {
                this._fileIndex = 0;
                this.state.currentFile = this.state.files[this._fileIndex].path;
            }
        } else {
            this.state.currentFile = null;
        }

        this.save();
        this._render();
    }

    nextFile() {
        if (this.state.files.length === 0) {
            return;
        }
        this._fileIndex = Math.min(this.state.files.length - 1, this._fileIndex + 1);
        this.state.currentFile = this.state.files[this._fileIndex].path;
        this.save();
        this._render();
    }

    prevFile() {
        if (this.state.files.length === 0) {
            return;
        }
        this._fileIndex = Math.max(0, this._fileIndex - 1);
        this.state.currentFile = this.state.files[this._fileIndex].path;
        this.save();
        this._render();
    }

    changeSort(sortBy, sortOrder) {
        if (this.state.sortBy === sortBy && this.state.sortOrder === sortOrder) {
            return;
        }
        this.state.sortBy = sortBy;
        this.state.sortOrder = sortOrder;
        this._resort();
    }

    _resort() {
        const sortBy = this.state.sortBy;
        const sortOrder = this.state.sortOrder;

        this.state.folders.sort((a, b) => {
            let aVal = a.name;
            let bVal = b.name;
            aVal = aVal.toLowerCase().replace(/[\[\]\(\)\{}<>]+/g, '');
            bVal = bVal.toLowerCase().replace(/[\[\]\(\)\{}<>]+/g, '');
            if (aVal === '..') return -1;
            if (bVal === '..') return 1;
            if (aVal === bVal) return 0;
            if (aVal < bVal) return -1;
            return 1;
        });

        this.state.files.sort((a, b) => {
            let aVal = a[sortBy];
            let bVal = b[sortBy];
            if (sortBy === 'name') {
                aVal = aVal.toLowerCase().replace(/[\[\]\(\)\{}<>]+/g, '');
                bVal = bVal.toLowerCase().replace(/[\[\]\(\)\{}<>]+/g, '');
            }
            if (aVal === bVal) {
                return 0;
            }
            if (aVal < bVal) {
                return sortOrder === 'asc' ? -1 : 1;
            }
            return sortOrder === 'asc' ? 1 : -1;
        });

        this._fileIndex = Math.max(0, this.state.files.findIndex(f => f.path === this.state.currentFile));
        this.save();
        this._render();
    }

    _render() {
        this.$path.text(this.state.currentPath);

        if (this._listRebuildRequired) {
            this.$folders.empty();
            this.state.folders.forEach(f => {
                if (!this.state.showHidden && f.name.startsWith('.') && f.name !== '..') {
                    return;
                }
                this.$folders.append(html`
                    <div><a href="#${f.path}" class="${
                            this._previousFolder === f.path ? 'previous' : ''
                    }" data-folder="${f.path}">${f.name}</a></div>`);
            });

            this.$files.empty();
            this.state.files.forEach(f => {
                if (!this.state.showHidden && f.name.startsWith('.')) {
                    return;
                }
                this.$files.append(html`
                    <div><a href="#${f.path}" class="${
                            this.state.currentFile === f.path ? 'active' : ''
                    }" data-file="${f.path}">${f.name}</a></div>`);
            });
        } else {
            this.$files.find('a').removeClass('active');
            this.$files.find(`a[data-file="${CSS.escape(this.state.currentFile)}"]`).addClass('active');

            this.$folders.find('a').removeClass('previous');
            this.$folders.find(`a[data-folder="${CSS.escape(this._previousFolder)}"]`).addClass('previous');
        }

        this._setupEvents();
        this._listRebuildRequired = false;
        this._renderImage();
        this._renderSortingShortcuts();
        this._focusCurrentFile();
        this._focusPreviousFolder();
    }

    _renderImage() {
        if (this.state.currentFile === null) {
            this.$imageHolder.empty();
            document.title = 'Image Viewer';
            return;
        }
        document.title = this.state.currentFile.split(/\//).pop();

        this.$imageHolder.empty();
        let $media;

        if (this.state.currentFile.match(/\.(mp4|webm)$/)) {
            $media = $(this._getVideo(this.state.currentFile));
        } else {
            $media = $(this._getImage(this.state.currentFile));
            this._cleanupCache();
        }

        this.$imageHolder.append($media);
        this._preloadNextAndPrevious();
    }

    _getVideo(file) {
        let url = new URL(`/get-file`, window.location.origin);
        url.searchParams.append('path', file);

        let video = document.createElement('video');
        video.controls = true;
        video.autoplay = true;
        video.loop = true;
        video.src = url.toString();
        return video;
    }

    _getImage(file) {
        let url = new URL(`/get-file`, window.location.origin);
        url.searchParams.append('path', file);

        if (!this._fileCache.hasOwnProperty(file)) {
            this._fileCache[file] = {
                img: new Image(),
                ts: Date.now() / 1000.0,
            };
            this._fileCache[file].img.src = url.toString();
        } else {
            this._fileCache[file].ts = Date.now() / 1000.0;
        }
        return this._fileCache[file].img;
    }

    _cleanupCache() {
        // keep only 10 images in cache.
        let keys = Object.keys(this._fileCache);
        if (keys.length > MAX_CACHED_IMAGES) {
            let oldestKey = keys.reduce((a, b) => {
                if (this._fileCache[a].ts < this._fileCache[b].ts) {
                    return a;
                }
                return b;
            });
            delete this._fileCache[oldestKey];
        }
    }

    _preloadNextAndPrevious() {
        if (this.state.files.length === 0) {
            return;
        }
        let nextIndex = Math.min(this.state.files.length - 1, this._fileIndex + 1);
        let prevIndex = Math.max(0, this._fileIndex - 1);
        this._getImage(this.state.files[nextIndex].path);
        this._getImage(this.state.files[prevIndex].path);
    }

    _renderSortingShortcuts() {
        this.$sortingShortcuts.empty();
        this.$sortingShortcuts.append(`<span class="${this.state.sortBy === 'name' ? 'active' : ''}">n: name</span><br>`);
        this.$sortingShortcuts.append(`<span class="${this.state.sortBy === 'mtime' ? 'active' : ''}">m: mtime</span><br>`);
        this.$sortingShortcuts.append(`<span class="${this.state.sortOrder === 'desc' ? 'active' : ''}">r: reverse</span><br>`);
        this.$sortingShortcuts.append(`<span class="${this.state.showHidden ? 'active' : ''}">h: hidden</span><br>`);
    }

    _focusCurrentFile() {
        if (this.state.currentFile === null) {
            return;
        }
        let $el = this.$files.find(`*[data-file="${CSS.escape(this.state.currentFile)}"]`);
        if ($el.length === 0) {
            return;
        }
        $el[0].scrollIntoView({behavior: 'instant', block: 'center'});
    }

    _focusPreviousFolder() {
        if (this._previousFolder === null) {
            return;
        }
        let $el = this.$folders.find(`*[data-folder="${CSS.escape(this._previousFolder)}"]`);
        if ($el.length === 0) {
            return;
        }
        $el[0].scrollIntoView({behavior: 'instant', block: 'center'});
    }

    _setupEvents() {
        this.$left.find('a[data-folder]').off('click').on('click', ev => {
            ev.preventDefault();
            this._previousFolder = this.state.currentPath;
            let newPath = $(ev.target).attr('data-folder');
            this._fetchList(newPath);
        });

        this.$left.find('a[data-file]').off('click').on('click', ev => {
            ev.preventDefault();
            let filePath = $(ev.target).attr('data-file');
            this.state.currentFile = filePath;
            this._fileIndex = this.state.files.findIndex(f => f.path === filePath);
            this.save();
            this._render();
        });

        $(window).off('keydown').on('keydown', ev => {
            if (ev.key === 'PageDown') {
                ev.preventDefault();
                this.nextFile();
            } else if (ev.key === 'PageUp') {
                ev.preventDefault();
                this.prevFile();
            } else if (ev.key === 'Home') {
                ev.preventDefault();
                this._fileIndex = 0;
                this.state.currentFile = this.state.files[this._fileIndex].path;
                this.save();
                this._render();
            } else if (ev.key === 'End') {
                ev.preventDefault();
                this._fileIndex = this.state.files.length - 1;
                this.state.currentFile = this.state.files[this._fileIndex].path;
                this.save();
                this._render();
            } else if (ev.key === 'f') {
                ev.preventDefault();
                toggleFullscreen(this.$imageHolder[0]);
            } else if (ev.key === 'h') {
                ev.preventDefault();
                this.state.showHidden = !this.state.showHidden;
                this.save();
                this._listRebuildRequired = true;
                this._render();
            } else if (ev.key === 'r') {
                ev.preventDefault();
                this.changeSort(this.state.sortBy, this.state.sortOrder === 'asc' ? 'desc' : 'asc');
                this._listRebuildRequired = true;
                this._render();
            } else if (ev.key === 'n') {
                ev.preventDefault();
                this.changeSort('name', this.state.sortOrder);
                this._listRebuildRequired = true;
                this._render();
            } else if (ev.key === 'm') {
                ev.preventDefault();
                this.changeSort('mtime', this.state.sortOrder);
                this._listRebuildRequired = true;
                this._render();
            }
        });

        this.$imageHolder.off('wheel').on('wheel', ev => {
            if (ev.originalEvent.deltaY < 0) {
                this.prevFile();
            } else if (ev.originalEvent.deltaY > 0) {
                this.nextFile();
            }
        });

        let hideCursorTimer = null;
        this.$imageHolder.off('mousemove').on('mousemove', ev => {
            if (hideCursorTimer !== null) {
                clearTimeout(hideCursorTimer);
            }

            this.$imageHolder.removeClass('hide-cursor');
            hideCursorTimer = setTimeout(() => {
                this.$imageHolder.addClass('hide-cursor');
            }, HIDE_CURSOR_TIMEOUT);
        });
    }
}
