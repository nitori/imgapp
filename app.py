"""
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
"""
import hashlib
from pathlib import Path
import os
import time

from dotenv import load_dotenv
from flask import Flask, render_template, jsonify, request, send_file

load_dotenv()

EXTENSIONS = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.webm': 'video/webm',
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska',
}

app = Flask(__name__)


class HttpError(Exception):
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.status_code = status_code


def default_path() -> Path:
    path = Path.home() / 'Pictures'
    if not path.exists() or not path.is_dir():
        path = Path.home()
    return path


def listdrives():
    if os.name != 'nt':
        return
    if hasattr(os, 'listdrives'):
        yield from os.listdrives()
    else:
        for drive in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ':
            if Path(drive + ':\\').exists():
                yield drive + ':\\'


def resolve_path(path_str: str) -> Path:
    if path_str:
        path = Path(path_str)
    else:
        path = default_path()

    if not path.exists() or not path.is_dir():
        raise HttpError('Path does not exist', 404)

    try:
        path.resolve(strict=True)
    except (FileNotFoundError, RuntimeError):
        raise HttpError('Path does not exist', 404)

    # return original path, because we don't want to follow symlinks
    return path


def calculate_folder_hash(path: Path) -> tuple[str, float]:
    start = time.perf_counter()
    digest = hashlib.sha256()
    for item in sorted(path.iterdir(), key=lambda p: p.name):
        try:
            digest.update(item.name.encode('utf-8'))
            digest.update(str(item.stat().st_mtime).encode('utf-8'))
        except FileNotFoundError:
            continue
    elapsed = time.perf_counter() - start
    return digest.hexdigest(), elapsed


@app.route('/')
def index():
    folder_strings = os.environ['FAV_FOLDERS'].split(';')
    folders = []

    for drive in listdrives():
        folders.append({
            'name': drive,
            'path': drive.replace('\\', '/'),
        })

    for folder in folder_strings:
        folder = Path(folder).expanduser()
        if folder.exists() and folder.is_dir():
            folders.append({
                'name': folder.name,
                'path': str(folder).replace('\\', '/'),
            })

    return render_template('index.html', favs=folders)


@app.route('/list')
def folder_list():
    path_str = request.args.get('path', '')
    try:
        path = resolve_path(path_str)
    except HttpError as e:
        return jsonify(error=str(e)), e.status_code

    folders = []
    files = []

    folders.append({
        'name': '..',
        'path': str(path.parent).replace('\\', '/'),
    })

    for entry in path.iterdir():
        if entry.is_dir():
            folders.append({
                'name': entry.name,
                'path': str(entry).replace('\\', '/'),
                'symlink': entry.is_symlink(),
            })
        elif entry.suffix.lower() in EXTENSIONS:
            try:
                files.append({
                    'name': entry.name,
                    'path': str(entry).replace('\\', '/'),
                    'mtime': entry.stat().st_mtime,
                    'symlink': entry.is_symlink(),
                })
            except FileNotFoundError:
                continue

    hash_, duration = calculate_folder_hash(path)
    return jsonify(
        canonical_path=str(path).replace('\\', '/'),
        folders=folders,
        files=files,
        hash=dict(hash=hash_, duration=duration),
    )


@app.route('/get-file', methods=['GET'])
def get_file():
    path = Path(request.args['path'])
    if not path.exists():
        return jsonify(error='File does not exist'), 404

    if not path.is_file():
        return jsonify(error='Path is not a file'), 400

    if path.suffix.lower() not in EXTENSIONS:
        return jsonify(error='File type not supported'), 400

    return send_file(path, mimetype=EXTENSIONS[path.suffix.lower()], max_age=3600)


@app.route('/folder-hash', methods=['GET'])
def folder_hash():
    path_str = request.args.get('path', '')
    try:
        path = resolve_path(path_str)
    except HttpError as e:
        return jsonify(error=str(e)), e.status_code
    hash_, duration = calculate_folder_hash(path)
    return jsonify(hash=hash_, duration=duration)


if __name__ == '__main__':
    app.run(debug=True)
