#!/bin/bash

cd /home/sgyang/opt/pretty-lattice/web
bun run build

cd /home/sgyang/opt/pretty-lattice
python scripts/sync_web_static.py
python -m pip install .
