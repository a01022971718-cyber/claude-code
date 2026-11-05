package com.xs.frontline;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.speech.tts.TextToSpeech;
import android.util.Base64;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * 《造月之路》安卓套壳：全屏 WebView 加载 assets/index.html（node build.mjs 打包出的单文件 H5）。
 * - 存档保存在 WebView 的 localStorage / IndexedDB 中，离线可玩；
 * - 设置里的「本地文件」可以从手机里选音乐（onShowFileChooser）；
 * - 英雄配音调用系统中文语音合成（XSNative.speak），没有中文语音包时游戏自动改用像素音。
 * v0.8 英语田园（assets/farm/，原「生而向星」）：
 * - 用 https://appassets.androidplatform.net/farm/… 加载（shouldInterceptRequest 从 assets 读文件），田园需要 https 来源才能用
 *   fetch、Web Worker、WebAssembly、浏览器缓存（发音模型和口语评分模型下载一次后缓存）。
 * - 大厅 ↔ 田园用 XSNative.openFarm / backToGame 整页切换（https 页面不能自己跳到 file://）。
 * - AndroidFiles：田园原版安卓壳的接口（导出备份、麦克风权限、版本号、网络类型、震动），保留原版功能。
 * - 新增权限：联网（第一次下载发音 / 口语评分模型、检查更新）、录音（口语评分，用的时候才申请）。
 */
public class MainActivity extends Activity {
    static final String APP_VERSION = "0.8.0";
    static final int APP_VERSION_CODE = 8;
    static final String ASSET_HOST = "appassets.androidplatform.net";
    static final String GAME_URL = "file:///android_asset/index.html";

    private WebView web;
    private TextToSpeech tts;
    private boolean ttsOk = false;
    @SuppressWarnings("rawtypes")
    private ValueCallback fileCb;
    private PermissionRequest pendingPerm;
    private boolean micFromJs = false;
    private byte[] pendingSave;
    private static final int PICK = 42, SAVE = 43, MIC = 44;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }
        web = new WebView(this);
        web.setBackgroundColor(0xFF0B0A12);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setTextZoom(100);
        web.setWebChromeClient(new Chrome(this));
        web.setWebViewClient(new Client(this));
        web.addJavascriptInterface(new Bridge(this), "XSNative");
        web.addJavascriptInterface(new Files(this), "AndroidFiles");
        setContentView(web);
        hideBars();
        tts = new TextToSpeech(this, new TtsInit(this));
        if (state != null) web.restoreState(state);
        else web.loadUrl(GAME_URL);
    }

    // ---------- 从 assets 读文件，给 https://appassets.androidplatform.net/… 用 ----------
    static String mime(String path) {
        String p = path.toLowerCase(Locale.ROOT);
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".wasm")) return "application/wasm";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".ttf")) return "font/ttf";
        if (p.endsWith(".mp3")) return "audio/mpeg";
        if (p.endsWith(".ogg")) return "audio/ogg";
        if (p.endsWith(".wav")) return "audio/wav";
        if (p.endsWith(".md") || p.endsWith(".txt")) return "text/plain";
        if (p.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        return "application/octet-stream";
    }

    WebResourceResponse serveAsset(Uri uri) {
        String path = uri.getPath();
        if (path == null || path.equals("/") || path.isEmpty()) path = "/farm/index.html";
        if (path.endsWith("/")) path = path + "index.html";
        path = path.substring(1);
        Map<String, String> headers = new HashMap<String, String>();
        headers.put("Access-Control-Allow-Origin", "*");
        headers.put("Cache-Control", "no-cache");
        String m = mime(path);
        String enc = m.startsWith("text/") || m.equals("application/json") ? "utf-8" : null;
        try {
            InputStream in = getAssets().open(path);
            return new WebResourceResponse(m, enc, 200, "OK", headers, in);
        } catch (Exception e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", headers, new ByteArrayInputStream(new byte[0]));
        }
    }

    void openFarm(String url) {
        if (url == null || !url.startsWith("https://" + ASSET_HOST + "/farm/")) return;
        runOnUiThread(new Load(web, url));
    }

    void backToGame(int sec) {
        runOnUiThread(new Load(web, GAME_URL + "#farmlearn=" + Math.max(0, sec)));
    }

    // ---------- 系统语音 ----------
    void onTtsReady(int status) {
        if (status == TextToSpeech.SUCCESS) {
            int r = tts.setLanguage(Locale.SIMPLIFIED_CHINESE);
            ttsOk = r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED;
        }
    }

    void speak(String text, float pitch, float rate) {
        if (!ttsOk || tts == null) return;
        tts.setPitch(Math.max(0.3f, Math.min(2f, pitch)));
        tts.setSpeechRate(Math.max(0.5f, Math.min(1.8f, rate)));
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "xs");
    }

    // ---------- 选文件（音乐、田园的课程表格 / 图片 / 备份） ----------
    @SuppressWarnings({"rawtypes", "unchecked"})
    boolean openChooser(ValueCallback cb, WebChromeClient.FileChooserParams params) {
        if (fileCb != null) fileCb.onReceiveValue(null);
        fileCb = cb;
        Intent i;
        try { i = params.createIntent(); } catch (Exception e) { i = null; }
        if (i == null) {
            i = new Intent(Intent.ACTION_GET_CONTENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("*/*");
        }
        try { startActivityForResult(Intent.createChooser(i, "选择文件"), PICK); } catch (Exception e) { fileCb = null; return false; }
        return true;
    }

    // ---------- 田园：导出备份（让用户选保存位置） ----------
    void saveFile(String b64, String name) {
        try { pendingSave = Base64.decode(b64, Base64.DEFAULT); } catch (Exception e) { pendingSave = null; return; }
        String n = name == null || name.isEmpty() ? "backup.json" : name;
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType(mime(n));
        i.putExtra(Intent.EXTRA_TITLE, n);
        try { startActivityForResult(i, SAVE); } catch (Exception e) { pendingSave = null; }
    }

    // ---------- 麦克风（田园口语评分）：用的时候才申请 ----------
    boolean hasMic() {
        return Build.VERSION.SDK_INT < 23 || checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    void requestMicFromJs() {
        if (hasMic()) { micResult(true); return; }
        micFromJs = true;
        runOnUiThread(new AskMic(this));
    }

    void askMic() { if (Build.VERSION.SDK_INT >= 23) requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MIC); }

    void micResult(boolean ok) {
        runOnUiThread(new Eval(web, "window.microphonePermissionResult&&microphonePermissionResult(" + ok + ")"));
    }

    void onWebPermission(PermissionRequest req) {
        boolean wantsMic = false;
        for (String r : req.getResources()) if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) wantsMic = true;
        if (!wantsMic) { req.deny(); return; }
        if (hasMic()) { req.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE}); return; }
        if (pendingPerm != null) pendingPerm.deny();
        pendingPerm = req;
        askMic();
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        if (req != MIC) { super.onRequestPermissionsResult(req, perms, res); return; }
        boolean ok = res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED;
        if (pendingPerm != null) {
            if (ok) pendingPerm.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE}); else pendingPerm.deny();
            pendingPerm = null;
        }
        if (micFromJs) { micFromJs = false; micResult(ok); }
    }

    String networkKind() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            Network n = cm.getActiveNetwork();
            if (n == null) return "none";
            NetworkCapabilities c = cm.getNetworkCapabilities(n);
            if (c == null) return "none";
            if (c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || c.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) return "wifi";
            if (c.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) return "cellular";
            return "other";
        } catch (Exception e) { return "unknown"; }
    }

    void haptic() {
        try {
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null) return;
            if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(12, VibrationEffect.DEFAULT_AMPLITUDE));
            else v.vibrate(12);
        } catch (Exception e) { /* 没有震动马达 */ }
    }

    @Override
    @SuppressWarnings("unchecked")
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == PICK && fileCb != null) {
            Uri[] out = WebChromeClient.FileChooserParams.parseResult(res, data);
            fileCb.onReceiveValue(out);
            fileCb = null;
            return;
        }
        if (req == SAVE) {
            byte[] bytes = pendingSave; pendingSave = null;
            if (res == RESULT_OK && data != null && data.getData() != null && bytes != null) {
                try {
                    OutputStream os = getContentResolver().openOutputStream(data.getData());
                    os.write(bytes); os.close();
                    web.evaluateJavascript("window.toast&&toast('已保存')", null);
                } catch (Exception e) {
                    web.evaluateJavascript("window.toast&&toast('保存失败')", null);
                }
            }
            return;
        }
        super.onActivityResult(req, res, data);
    }

    private void hideBars() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    @Override
    public void onWindowFocusChanged(boolean focus) {
        super.onWindowFocusChanged(focus);
        if (focus) hideBars();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        // 造月之路和英语田园各自存档（田园的 save 是它自己的全局函数）
        web.evaluateJavascript("window.CF_DEBUG&&CF_DEBUG.Save.save();try{if(window.zyBack&&typeof save==='function')save(false)}catch(e){}", null);
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (tts != null) { tts.stop(); tts.shutdown(); }
        super.onDestroy();
    }

    // 返回键：交给页面处理——田园里先关弹层 / 回田园首页，再退回造月之路；造月之路里关弹窗 → 退回上一页 → 战斗中打开菜单，在大厅时才退出
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.zyBack?zyBack():((window.CF_DEBUG&&CF_DEBUG.UI.back)?CF_DEBUG.UI.back():'exit')", new BackCallback(this));
    }

    // 以下都用具名的非泛型类：新版 javac 为匿名类 / 泛型回调生成的桥接方法会让 build-tools 34 的 d8 崩溃
    @SuppressWarnings({"rawtypes", "unchecked"})
    static final class BackCallback implements ValueCallback {
        private final Activity act;
        BackCallback(Activity a) { act = a; }
        @Override
        public void onReceiveValue(Object v) {
            if (v == null || String.valueOf(v).contains("exit")) act.finish();
        }
    }

    static final class Load implements Runnable {
        private final WebView w; private final String url;
        Load(WebView w, String url) { this.w = w; this.url = url; }
        @Override
        public void run() { w.loadUrl(url); }
    }

    static final class Eval implements Runnable {
        private final WebView w; private final String js;
        Eval(WebView w, String js) { this.w = w; this.js = js; }
        @Override
        public void run() { w.evaluateJavascript(js, null); }
    }

    static final class AskMic implements Runnable {
        private final MainActivity act;
        AskMic(MainActivity a) { act = a; }
        @Override
        public void run() { act.askMic(); }
    }

    static final class GrantWeb implements Runnable {
        private final MainActivity act; private final PermissionRequest req;
        GrantWeb(MainActivity a, PermissionRequest r) { act = a; req = r; }
        @Override
        public void run() { act.onWebPermission(req); }
    }

    static final class TtsInit implements TextToSpeech.OnInitListener {
        private final MainActivity act;
        TtsInit(MainActivity a) { act = a; }
        @Override
        public void onInit(int status) { act.onTtsReady(status); }
    }

    static final class Client extends WebViewClient {
        private final MainActivity act;
        Client(MainActivity a) { act = a; }
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (u != null && ASSET_HOST.equals(u.getHost())) return act.serveAsset(u);
            return null;
        }
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            String sch = u.getScheme();
            if ("file".equals(sch) || ASSET_HOST.equals(u.getHost()) || "about".equals(sch) || "blob".equals(sch) || "data".equals(sch)) return false;
            // 其他网址（教程链接、GitHub 等）交给系统浏览器
            try { act.startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) { /* 没有浏览器 */ }
            return true;
        }
    }

    static final class Chrome extends WebChromeClient {
        private final MainActivity act;
        Chrome(MainActivity a) { act = a; }
        @Override
        @SuppressWarnings({"rawtypes", "unchecked"})
        public boolean onShowFileChooser(WebView view, ValueCallback cb, FileChooserParams params) { return act.openChooser(cb, params); }
        @Override
        public void onPermissionRequest(PermissionRequest req) { act.runOnUiThread(new GrantWeb(act, req)); }
    }

    static final class Bridge {
        private final MainActivity act;
        Bridge(MainActivity a) { act = a; }
        @JavascriptInterface
        public void speak(String text, float pitch, float rate) { act.speak(text, pitch, rate); }
        @JavascriptInterface
        public boolean ready() { return act.ttsOk; }
        @JavascriptInterface
        public void openFarm(String url) { act.openFarm(url); }
        @JavascriptInterface
        public void backToGame(int sec) { act.backToGame(sec); }
    }

    // 英语田园原版安卓壳的接口（名字和用法保持一致，田园代码不用改）
    static final class Files {
        private final MainActivity act;
        Files(MainActivity a) { act = a; }
        @JavascriptInterface
        public void save(String b64, String name) { act.saveFile(b64, name); }
        @JavascriptInterface
        public void requestMicrophone() { act.requestMicFromJs(); }
        @JavascriptInterface
        public String appVersion() { return "1.10.0（造月之路 " + APP_VERSION + "）"; }
        @JavascriptInterface
        public int appVersionCode() { return APP_VERSION_CODE; }
        @JavascriptInterface
        public String networkKind() { return act.networkKind(); }
        @JavascriptInterface
        public void editorHaptic() { act.haptic(); }
        @JavascriptInterface
        public boolean isEditorBuild() { return false; }
    }
}
