from flask import Flask, render_template, send_from_directory
import os

app = Flask(__name__)


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/service_worker.js')
def service_worker():
    return send_from_directory(os.path.join(app.root_path, 'static'), 'service_worker.js',
                               mimetype='application/javascript')


if __name__ == '__main__':
    app.run(debug=True)
