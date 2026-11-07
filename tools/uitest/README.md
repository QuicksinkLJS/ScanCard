# Browser tests (Playwright, headless Chrome)

Used during development in the cloud sandbox. Setup:

    mkdir -p /home/claude/libs && cd /home/claude/libs && npm init -y && npm i onnxruntime-web@1.31.1 tesseract.js@5 @tesseract.js-data/eng
    cd <repo> && nohup python3 -m http.server 8765 &      # needs data/ygo built and models/ygo present
    python3 tools/uitest/t1_versions.py

`harness.py` redirects jsdelivr to the local node_modules and cardtrader.com images to a local test picture
(`/home/claude/photos/card.jpg`). Test photos come from `C:\CardScan App Projekt\testdaten` (stage them first).
Each `tN_*.py` covers one feature (versions, scan, depot, share, mastersets, decks, lists, holo, price tags, piles, German).
