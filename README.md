# sasha_test_2

A simple Flask web application.

## Setup

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Run

```bash
python app.py
```

The app will be available at http://127.0.0.1:5000

## Debug mode

Set the `FLASK_DEBUG` environment variable to `true` to enable debug mode (do **not** use this in production):

```bash
FLASK_DEBUG=true python app.py
```