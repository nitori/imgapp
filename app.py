from pathlib import Path
import os

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
}

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ['SECRET_KEY']


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
    if path_str:
        path = Path(path_str)
    else:
        path = default_path()

    if not path.exists() or not path.is_dir():
        return jsonify(error='Path does not exist'), 404

    try:
        path = path.resolve(strict=True)
    except (FileNotFoundError, RuntimeError):
        return jsonify(error='Path does not exist'), 404

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
            })
        elif entry.suffix in EXTENSIONS:
            files.append({
                'name': entry.name,
                'path': str(entry).replace('\\', '/'),
                'mtime': entry.stat().st_mtime,
            })

    return jsonify(
        canonical_path=str(path).replace('\\', '/'),
        folders=folders,
        files=files,
    )


@app.route('/get-file', methods=['GET'])
def get_file():
    path = Path(request.args['path'])
    if not path.exists():
        return jsonify(error='File does not exist'), 404

    if not path.is_file():
        return jsonify(error='Path is not a file'), 400

    if path.suffix not in EXTENSIONS:
        return jsonify(error='File type not supported'), 400

    return send_file(path, mimetype=EXTENSIONS[path.suffix], max_age=3600)


if __name__ == '__main__':
    app.run(debug=True)
