# DWG → DXF converter for EstimatePro

CAD Studio opens DXF directly. A DWG is sent (only by a signed-in user) through the EstimatePro Worker to this small service,
which runs LibreDWG's `dwg2dxf` and returns the DXF. LibreDWG is GPL-3.0: it runs here as a separate program on your own server
and is not shipped to users, so the app itself stays as it is.

Run it on the Hetzner server (next to Vivid Relay):

    cd server/dwg
    docker build -t ep-dwg .
    docker run -d --name ep-dwg --restart unless-stopped -p 127.0.0.1:8088:8088 -e DWG_KEY='<long random key>' ep-dwg

Put it behind HTTPS (the same Caddy / Nginx as Vivid Relay), e.g. `https://dwg.<your-domain>/` → `127.0.0.1:8088`.
Then in Cloudflare → Workers → estimatepro → Settings → Variables and secrets add:
`DWG_URL` = `https://dwg.<your-domain>` (text) and `DWG_KEY` = the same key (secret).
