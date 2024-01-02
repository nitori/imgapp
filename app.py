from pathlib import Path

from flask import Flask, render_template, session, jsonify, request, send_file

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
app.config['SECRET_KEY'] = 'uriaeonsiarseuirnesuirseurasenurtine'


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/list')
def folder_list():
    path = Path(session['path'])
    folders = []
    files = []

    folders.append({
        'name': '..',
        'path': str(path.parent),
    })

    for entry in path.iterdir():
        if entry.name.startswith('.') and not session['show_hidden']:
            continue

        if entry.is_dir():
            folders.append({
                'name': entry.name,
                'path': str(entry),
            })
        elif entry.suffix in EXTENSIONS:
            files.append({
                'name': entry.name,
                'path': str(entry),
                'mtime': entry.stat().st_mtime,
            })

    # always sort folders by name (for now)
    folders.sort(key=lambda f: f['name'])

    sort_by = session['sort_by']
    sort_order = session['sort_order']
    files.sort(key=lambda f: f[sort_by], reverse=sort_order == 'desc')

    return jsonify(path=str(path), folders=folders, files=files, show_hidden=session['show_hidden'])


@app.route('/change-folder', methods=['POST'])
def change_folder():
    session['path'] = str(Path(request.form['path']).resolve())
    return jsonify(path=session['path'])


@app.route('/toggle-hidden', methods=['POST'])
def show_hidden():
    session['show_hidden'] = not session['show_hidden']
    return jsonify(show_hidden=session['show_hidden'])


@app.route('/sorting')
def get_sorting():
    return jsonify(
        sort_by=session['sort_by'],
        sort_order=session['sort_order'],
    )


@app.route('/update-sorting', methods=['POST'])
def update_sorting():
    sort_by = request.form.get('sort_by', None)
    sort_order = request.form.get('sort_order', None)
    if sort_by not in [None, 'name', 'mtime']:
        return jsonify(error='Invalid sort_by value'), 400
    if sort_order not in [None, 'asc', 'desc']:
        return jsonify(error='Invalid sort_order value'), 400

    if sort_by is not None:
        session['sort_by'] = sort_by
    if sort_order is not None:
        session['sort_order'] = sort_order
    return jsonify(
        sort_by=session['sort_by'],
        sort_order=session['sort_order'],
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


@app.before_request
def before_request():
    if 'path' not in session:
        path = Path.home() / 'Pictures'
        if not path.exists() or not path.is_dir():
            path = Path.home()
        session['path'] = str(path)

    if 'show_hidden' not in session:
        session['show_hidden'] = False

    if 'sort_by' not in session:
        session['sort_by'] = 'name'

    if 'sort_order' not in session:
        session['sort_order'] = 'asc'


if __name__ == '__main__':
    app.run(debug=True)
