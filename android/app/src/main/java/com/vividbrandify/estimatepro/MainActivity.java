package com.vividbrandify.estimatepro;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Message;
import android.os.Parcelable;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.ArrayList;

/*
 * Estimate Pro for Android — the live app in the app's own WebView (Chrome is not needed).
 * The page finds window.EPAndroid (js/ui-android.js) and hands over what a WebView cannot do by itself:
 * saving downloads, sharing files and printing. Camera, GPS and file picking are answered here.
 * Sign-in, licence and device limit are the web app's own; the user agent ends with "EstimateProAndroid/<version>".
 */
public class MainActivity extends Activity {
    static final String HOST = "estimatepro.prashantmahto2819.workers.dev";
    static final String HOME = "https://" + HOST + "/app?src=android";
    static final int REQ_FILE = 1, REQ_MEDIA = 2, REQ_GEO = 3, REQ_STORAGE = 4;
    static final int BRAND = 0xFF0F3F62, ACCENT = 0xFF2DA56F;

    FrameLayout root;
    WebView web, pop;
    LinearLayout popBox;
    ProgressBar bar;
    ValueCallback<Uri[]> fileCb;
    Uri camUri;
    PermissionRequest mediaReq;
    GeolocationPermissions.Callback geoCb;
    String geoOrigin;
    String version = "1";

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        try { version = getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { /* keep "1" */ }
        getWindow().setStatusBarColor(BRAND);
        getWindow().setNavigationBarColor(BRAND);
        root = new FrameLayout(this);
        web = newWeb(false);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        bar.setIndeterminate(false);
        bar.setProgressTintList(ColorStateList.valueOf(ACCENT));
        bar.setVisibility(View.GONE);
        root.addView(bar, new FrameLayout.LayoutParams(-1, dp(4), Gravity.TOP));
        setContentView(root);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        if (state != null) web.restoreState(state);
        if (web.getUrl() == null) web.loadUrl(startUrl(getIntent()));
    }

    WebView newWeb(boolean popup) {
        WebView w = new WebView(this);
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(popup);
        s.setBuiltInZoomControls(popup);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);
        s.setUserAgentString(s.getUserAgentString() + " EstimateProAndroid/" + version);
        w.addJavascriptInterface(new Bridge(w), "EPAndroid");
        w.setWebViewClient(new Client(popup));
        w.setWebChromeClient(new Chrome());
        w.setDownloadListener(new Dl(w));
        return w;
    }

    String startUrl(Intent i) {
        Uri d = i == null ? null : i.getData();
        if (d != null && "https".equals(d.getScheme()) && HOST.equals(d.getHost())) return d.toString();
        return HOME;
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        setIntent(i);
        if (i.getData() != null) { closePop(); web.loadUrl(startUrl(i)); }
    }

    /* ---------- where a link goes ---------- */
    boolean route(WebView v, Uri u, boolean popup) {
        String sc = u.getScheme() == null ? "" : u.getScheme().toLowerCase();
        String host = u.getHost() == null ? "" : u.getHost().toLowerCase();
        if (sc.equals("blob") || sc.equals("data") || sc.equals("about") || sc.equals("javascript")) return false;
        if (sc.equals("http") || sc.equals("https")) {
            if (host.equals(HOST) || host.endsWith(".supabase.co")) return false;
            if (host.equals("accounts.google.com")) { googleNote(v); return true; }
        }
        openOut(u);
        if (popup) root.postDelayed(new Runnable() { public void run() { closePop(); } }, 300);
        return true;
    }

    /* Google does not allow its sign-in page inside apps (it answers "disallowed_useragent"). */
    void googleNote(final WebView v) {
        new AlertDialog.Builder(this)
            .setTitle("Google sign-in")
            .setMessage("Google does not allow its sign-in inside apps. Please use one of the other sign-in options on this screen (email or WhatsApp code).")
            .setPositiveButton("OK", null)
            .show();
        v.post(new Runnable() {
            public void run() {
                String cur = v.getUrl();
                if (cur == null || !cur.contains(HOST)) { if (v == pop) closePop(); else v.loadUrl(HOME); }
            }
        });
    }

    void openOut(Uri u) {
        try {
            Intent i;
            if ("intent".equals(u.getScheme())) {
                i = Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME);
                i.addCategory(Intent.CATEGORY_BROWSABLE);
                i.setComponent(null);
                i.setSelector(null);
            } else {
                i = new Intent(Intent.ACTION_VIEW, u);
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception e) {
            toast("No app found to open this link");
        }
    }

    void offline(WebView v) {
        String html = "<!doctype html><meta name='viewport' content='width=device-width,initial-scale=1'>"
            + "<body style='font-family:sans-serif;text-align:center;padding:48px 22px;color:#0f1b2d;background:#f5f7fa'>"
            + "<h2>No internet</h2><p>Estimate Pro needs the internet the first time it opens. After that it keeps working offline.</p>"
            + "<p><a href='" + HOME + "' style='display:inline-block;background:#0f3f62;color:#fff;padding:12px 24px;border-radius:24px;text-decoration:none'>Try again</a></p></body>";
        v.loadDataWithBaseURL("https://" + HOST + "/offline", html, "text/html", "utf-8", null);
    }

    class Client extends WebViewClient {
        final boolean popup;
        Client(boolean p) { popup = p; }

        @Override
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
            if (!r.isForMainFrame()) return false;
            return route(v, r.getUrl(), popup);
        }

        @SuppressWarnings("deprecation")
        @Override
        public boolean shouldOverrideUrlLoading(WebView v, String url) {
            return route(v, Uri.parse(url), popup);
        }

        @Override
        public void onPageFinished(WebView v, String url) {
            CookieManager.getInstance().flush();
        }

        @Override
        public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
            if (r.isForMainFrame() && !popup) offline(v);
        }
    }

    /* ---------- windows, files, camera, GPS ---------- */
    class Chrome extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView v, int p) {
            if (v != web) return;
            bar.setProgress(p);
            bar.setVisibility(p < 100 ? View.VISIBLE : View.GONE);
        }

        /* window.open (print previews, photo sheet, outside links): a full-screen layer with Close and Print */
        @Override
        public boolean onCreateWindow(WebView v, boolean dialog, boolean user, Message msg) {
            closePop();
            pop = newWeb(true);
            popBox = new LinearLayout(MainActivity.this);
            popBox.setOrientation(LinearLayout.VERTICAL);
            popBox.setBackgroundColor(Color.WHITE);
            LinearLayout top = new LinearLayout(MainActivity.this);
            top.setBackgroundColor(BRAND);
            top.setGravity(Gravity.CENTER_VERTICAL);
            top.addView(barBtn("✕  Close", new View.OnClickListener() { public void onClick(View x) { closePop(); } }), new LinearLayout.LayoutParams(0, -1, 1));
            top.addView(barBtn("🖨  Print / Save PDF", new View.OnClickListener() { public void onClick(View x) { printView(pop, "Estimate Pro"); } }), new LinearLayout.LayoutParams(0, -1, 1));
            popBox.addView(top, new LinearLayout.LayoutParams(-1, dp(52)));
            popBox.addView(pop, new LinearLayout.LayoutParams(-1, 0, 1));
            root.addView(popBox, new FrameLayout.LayoutParams(-1, -1));
            WebView.WebViewTransport t = (WebView.WebViewTransport) msg.obj;
            t.setWebView(pop);
            msg.sendToTarget();
            return true;
        }

        @Override
        public void onCloseWindow(WebView w) {
            if (w == pop) closePop();
        }

        @Override
        public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
            if (fileCb != null) fileCb.onReceiveValue(null);
            fileCb = cb;
            camUri = null;
            ArrayList<String> mimes = new ArrayList<>();
            boolean any = false, images = false;
            String[] acc = p.getAcceptTypes();
            if (acc != null) for (String group : acc) for (String a : group.split(",")) {
                a = a.trim().toLowerCase();
                if (a.length() == 0) continue;
                String m = a.startsWith(".") ? MimeTypeMap.getSingleton().getMimeTypeFromExtension(a.substring(1)) : a;
                if (m == null) any = true; else mimes.add(m);
                if (m != null && m.startsWith("image/")) images = true;
            }
            if (mimes.isEmpty()) any = true;
            Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            pick.setType("*/*");
            if (!any) pick.putExtra(Intent.EXTRA_MIME_TYPES, mimes.toArray(new String[0]));
            if (p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            Intent cam = null;
            if ((images || any) && has(Manifest.permission.CAMERA)) {
                try {
                    File d = new File(getCacheDir(), "camera");
                    d.mkdirs();
                    camUri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", new File(d, "photo-" + System.currentTimeMillis() + ".jpg"));
                    cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    cam.putExtra(MediaStore.EXTRA_OUTPUT, camUri);
                    cam.setClipData(ClipData.newRawUri("", camUri));
                    cam.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                } catch (Exception e) {
                    cam = null;
                    camUri = null;
                }
            }
            Intent go;
            if (p.isCaptureEnabled() && cam != null) {
                go = cam;
            } else {
                go = Intent.createChooser(pick, "Choose a file");
                if (cam != null) go.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Parcelable[]{cam});
            }
            try {
                startActivityForResult(go, REQ_FILE);
            } catch (Exception e) {
                fileCb = null;
                cb.onReceiveValue(null);
                toast("No app found to pick a file");
            }
            return true;
        }

        @Override
        public void onPermissionRequest(PermissionRequest r) {
            Uri o = r.getOrigin();
            if (o == null || !HOST.equals(o.getHost())) { r.deny(); return; }
            ArrayList<String> need = new ArrayList<>();
            for (String res : r.getResources()) {
                if (res.equals(PermissionRequest.RESOURCE_VIDEO_CAPTURE) && !has(Manifest.permission.CAMERA)) need.add(Manifest.permission.CAMERA);
            }
            if (need.isEmpty()) { grantMedia(r); return; }
            mediaReq = r;
            requestPermissions(need.toArray(new String[0]), REQ_MEDIA);
        }

        @Override
        public void onPermissionRequestCanceled(PermissionRequest r) {
            if (mediaReq == r) mediaReq = null;
        }

        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
            if (origin == null || !origin.contains(HOST)) { cb.invoke(origin, false, false); return; }
            if (has(Manifest.permission.ACCESS_FINE_LOCATION) || has(Manifest.permission.ACCESS_COARSE_LOCATION)) { cb.invoke(origin, true, false); return; }
            geoOrigin = origin;
            geoCb = cb;
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_GEO);
        }
    }

    void grantMedia(PermissionRequest r) {
        ArrayList<String> ok = new ArrayList<>();
        for (String res : r.getResources()) {
            if (res.equals(PermissionRequest.RESOURCE_VIDEO_CAPTURE) && has(Manifest.permission.CAMERA)) ok.add(res);
        }
        if (ok.isEmpty()) r.deny(); else r.grant(ok.toArray(new String[0]));
    }

    boolean has(String perm) {
        return checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        if (req == REQ_MEDIA && mediaReq != null) {
            grantMedia(mediaReq);
            mediaReq = null;
        } else if (req == REQ_GEO && geoCb != null) {
            geoCb.invoke(geoOrigin, has(Manifest.permission.ACCESS_FINE_LOCATION) || has(Manifest.permission.ACCESS_COARSE_LOCATION), false);
            geoCb = null;
        } else if (req == REQ_STORAGE) {
            toast(has(Manifest.permission.WRITE_EXTERNAL_STORAGE) ? "Storage allowed — tap Download again" : "Without storage access files cannot be saved");
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_FILE && fileCb != null) {
            Uri[] out = null;
            if (res == RESULT_OK) {
                if (data != null && data.getClipData() != null && data.getClipData().getItemCount() > 0) {
                    ClipData c = data.getClipData();
                    out = new Uri[c.getItemCount()];
                    for (int k = 0; k < c.getItemCount(); k++) out[k] = c.getItemAt(k).getUri();
                } else if (data != null && data.getData() != null) {
                    out = new Uri[]{data.getData()};
                } else if (camUri != null) {
                    out = new Uri[]{camUri};
                }
            }
            fileCb.onReceiveValue(out);
            fileCb = null;
            camUri = null;
            return;
        }
        super.onActivityResult(req, res, data);
    }

    /* ---------- downloads ---------- */
    class Dl implements DownloadListener {
        final WebView w;
        Dl(WebView w) { this.w = w; }

        @Override
        public void onDownloadStart(String url, String ua, String cd, String mime, long len) {
            String name = URLUtil.guessFileName(url, cd, mime);
            if (url.startsWith("blob:") || url.startsWith("data:")) {
                String js = "(function(){fetch(" + JSONObject.quote(url) + ").then(function(r){return r.blob()}).then(function(b){var f=new FileReader();"
                    + "f.onload=function(){var s=String(f.result);EPAndroid.save(" + JSONObject.quote(name) + ",b.type||" + JSONObject.quote(mime == null ? "" : mime)
                    + ",s.slice(s.indexOf(',')+1))};f.readAsDataURL(b)})})()";
                w.evaluateJavascript(js, null);
            } else {
                try {
                    DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
                    if (mime != null) r.setMimeType(mime);
                    String ck = CookieManager.getInstance().getCookie(url);
                    if (ck != null) r.addRequestHeader("Cookie", ck);
                    if (ua != null) r.addRequestHeader("User-Agent", ua);
                    r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "EstimatePro/" + name);
                    ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(r);
                    toast("Downloading " + name);
                } catch (Exception e) {
                    openOut(Uri.parse(url));
                }
            }
            if (w == pop) root.postDelayed(new Runnable() { public void run() { if (w == pop) closePop(); } }, 2500);
        }
    }

    static String safeName(String n) {
        String s = n == null ? "" : n.replaceAll("[\\\\/:*?\"<>|\\u0000-\\u001f]", "_").trim();
        return s.length() == 0 ? "download" : s;
    }

    void savedNote(final String name, final Uri uri, final String mime) {
        new AlertDialog.Builder(this)
            .setTitle("Saved")
            .setMessage(name + "\n\nin Download / EstimatePro")
            .setPositiveButton("Open", (d, k) -> {
                try {
                    Intent i = new Intent(Intent.ACTION_VIEW);
                    i.setDataAndType(uri, mime);
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(i);
                } catch (Exception e) {
                    toast("No app found to open this file — open it from the Files app");
                }
            })
            .setNeutralButton("Share", (d, k) -> {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType(mime);
                i.putExtra(Intent.EXTRA_STREAM, uri);
                i.setClipData(ClipData.newRawUri("", uri));
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try { startActivity(Intent.createChooser(i, name)); } catch (Exception e) { toast("No app found to share this file"); }
            })
            .setNegativeButton("OK", null)
            .show();
    }

    /* ---------- printing ---------- */
    void printView(WebView v, String title) {
        if (v == null) return;
        String t = v.getTitle();
        if (t == null || t.length() == 0 || t.startsWith("about:") || t.startsWith("http")) t = title;
        try {
            PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
            pm.print(t, v.createPrintDocumentAdapter(t), new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
        } catch (Exception e) {
            toast("Printing is not available on this phone");
        }
    }

    /* ---------- what the page can ask the app for (window.EPAndroid) ---------- */
    class Bridge {
        final WebView owner;
        Bridge(WebView w) { owner = w; }

        @JavascriptInterface
        public String version() { return version; }

        @JavascriptInterface
        public boolean save(String name, String mime, String b64) {
            try {
                byte[] data = Base64.decode(b64, Base64.DEFAULT);
                final String fn = safeName(name);
                final String m = mime == null || mime.length() == 0 ? guessMime(fn) : mime;
                final Uri saved;
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues cv = new ContentValues();
                    cv.put(MediaStore.MediaColumns.DISPLAY_NAME, fn);
                    cv.put(MediaStore.MediaColumns.MIME_TYPE, m);
                    cv.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/EstimatePro");
                    Uri u = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                    if (u == null) throw new Exception("the Downloads folder is not available");
                    OutputStream o = getContentResolver().openOutputStream(u);
                    if (o == null) throw new Exception("the file could not be opened");
                    o.write(data);
                    o.close();
                    saved = u;
                } else {
                    if (!has(Manifest.permission.WRITE_EXTERNAL_STORAGE)) {
                        runOnUiThread(() -> requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_STORAGE));
                        return false;
                    }
                    File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "EstimatePro");
                    dir.mkdirs();
                    File f = new File(dir, fn);
                    FileOutputStream o = new FileOutputStream(f);
                    o.write(data);
                    o.close();
                    saved = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", f);
                }
                runOnUiThread(() -> savedNote(fn, saved, m));
                return true;
            } catch (Exception e) {
                toast("Could not save the file: " + e.getMessage());
                return false;
            }
        }

        /* {title, text, url, files:[{name, type, b64}]} → the phone's share sheet (WhatsApp, Gmail, Drive …) */
        @JavascriptInterface
        public void share(String json) {
            try {
                JSONObject o = new JSONObject(json);
                String text = o.optString("text", ""), title = o.optString("title", ""), url = o.optString("url", "");
                JSONArray fs = o.optJSONArray("files");
                File dir = new File(getCacheDir(), "share");
                dir.mkdirs();
                File[] old = dir.listFiles();
                if (old != null) for (File f : old) f.delete();
                ArrayList<Uri> uris = new ArrayList<>();
                String type = null;
                if (fs != null) for (int k = 0; k < fs.length(); k++) {
                    JSONObject f = fs.getJSONObject(k);
                    String fn = safeName(f.optString("name", "file"));
                    File out = new File(dir, fn);
                    FileOutputStream os = new FileOutputStream(out);
                    os.write(Base64.decode(f.optString("b64", ""), Base64.DEFAULT));
                    os.close();
                    uris.add(FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", out));
                    String m = f.optString("type", "");
                    if (m.length() == 0) m = guessMime(fn);
                    if (type == null) type = m;
                    else if (!type.equals(m)) type = type.split("/")[0].equals(m.split("/")[0]) ? type.split("/")[0] + "/*" : "*/*";
                }
                Intent i;
                if (uris.size() > 1) {
                    i = new Intent(Intent.ACTION_SEND_MULTIPLE);
                    i.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris);
                } else {
                    i = new Intent(Intent.ACTION_SEND);
                    if (uris.size() == 1) i.putExtra(Intent.EXTRA_STREAM, uris.get(0));
                }
                i.setType(type != null ? type : "text/plain");
                String body = text + (url.length() > 0 ? (text.length() > 0 ? "\n" : "") + url : "");
                if (body.length() > 0) i.putExtra(Intent.EXTRA_TEXT, body);
                if (title.length() > 0) i.putExtra(Intent.EXTRA_SUBJECT, title);
                if (uris.size() > 0) {
                    ClipData cd = ClipData.newRawUri("", uris.get(0));
                    for (int k = 1; k < uris.size(); k++) cd.addItem(new ClipData.Item(uris.get(k)));
                    i.setClipData(cd);
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                }
                final Intent ch = Intent.createChooser(i, title.length() > 0 ? title : "Share");
                runOnUiThread(() -> {
                    try { startActivity(ch); } catch (Exception e) { toast("No app found to share with"); }
                });
            } catch (Exception e) {
                toast("Could not share: " + e.getMessage());
            }
        }

        /* window.print() of the page itself */
        @JavascriptInterface
        public void printPage(final String title) {
            runOnUiThread(() -> printView(owner, title == null || title.length() == 0 ? "Estimate Pro" : title));
        }

        /* print() of a window the page opened (print preview, photo sheet) */
        @JavascriptInterface
        public void printPopup() {
            runOnUiThread(() -> printView(pop != null ? pop : owner, "Estimate Pro"));
        }

        @JavascriptInterface
        public void open(final String url) {
            runOnUiThread(() -> openOut(Uri.parse(url)));
        }
    }

    static String guessMime(String name) {
        int dot = name.lastIndexOf('.');
        String m = dot < 0 ? null : MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substring(dot + 1).toLowerCase());
        return m == null ? "application/octet-stream" : m;
    }

    /* ---------- small helpers ---------- */
    TextView barBtn(String text, View.OnClickListener l) {
        TextView b = new TextView(this);
        b.setText(text);
        b.setTextColor(Color.WHITE);
        b.setTextSize(15);
        b.setGravity(Gravity.CENTER);
        b.setOnClickListener(l);
        return b;
    }

    void closePop() {
        if (popBox == null) return;
        root.removeView(popBox);
        if (pop != null) { pop.stopLoading(); pop.destroy(); }
        pop = null;
        popBox = null;
    }

    int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    void toast(final String s) {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, s, Toast.LENGTH_LONG).show());
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (pop != null) {
            if (pop.canGoBack()) pop.goBack(); else closePop();
            return;
        }
        if (web.canGoBack()) { web.goBack(); return; }
        super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        closePop();
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
