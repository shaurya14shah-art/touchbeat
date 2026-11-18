#!/bin/zsh
# Runs from the project root; footage stays outside the project.
FOOT=$HOME/AG/touchbeat-footage/youtube-cc
for f in $FOOT/*.mp4; do
  id=${f:t:r}
  [[ -f data/skeletons/$id.json ]] || .venv/bin/python -I tools/extract.py "$f" "data/skeletons/$id.json" 2>/dev/null
done
echo ALL_DONE
