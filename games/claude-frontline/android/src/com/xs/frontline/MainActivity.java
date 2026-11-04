package com.xs.frontline;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.util.Locale;

/**
 * 《造月之路》安卓套壳：全屏 WebView 加载 assets/index.html（node build.mjs 打包出的单文件 H5）。
 * - 存档保存在 WebView 的 localStorage / IndexedDB 中，离线可玩，不需要联网权限；
 * - 设置里的「本地文件」可以从手机里选音乐（onShowFileChooser）；
 * - 英雄配音调用系统中文语音合成（XSNative.speak），没有中文语音包时游戏自动改用像素音。
 */
public class MainActivity extends Activity {
    private WebView web;
    private TextToSpeech tts;
    private boolean ttsOk = false;
    @SuppressWarnings("rawtypes")
    private ValueCallback fileCb;
    private static final int PICK = 42;

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
        web.setBackgroundColor(0xFF05121F);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setTextZoom(100);
        web.setWebChromeClient(new Chrome(this));
        web.setWebViewClient(new WebViewClient());
        web.addJavascriptInterface(new Bridge(this), "XSNative");
        setContentView(web);
        hideBars();
        tts = new TextToSpeech(this, new TtsInit(this));
        if (state != null) web.restoreState(state);
        else web.loadUrl("file:///android_asset/index.html");
    }

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

    @SuppressWarnings({"rawtypes", "unchecked"})
    boolean openChooser(ValueCallback cb, WebChromeClient.FileChooserParams params) {
        if (fileCb != null) fileCb.onReceiveValue(null);
        fileCb = cb;
        Intent i = new Intent(Intent.ACTION_GET_CONTENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("audio/*");
        try { startActivityForResult(Intent.createChooser(i, "选择音乐"), PICK); } catch (Exception e) { fileCb = null; return false; }
        return true;
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
        web.evaluateJavascript("window.CF_DEBUG&&CF_DEBUG.Save.save();", null);
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

    // 返回键：交给游戏处理（关弹窗 → 退回上一页 → 战斗中打开菜单），在大厅时才退出
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(window.CF_DEBUG&&CF_DEBUG.UI.back)?CF_DEBUG.UI.back():'exit'", new BackCallback(this));
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

    static final class TtsInit implements TextToSpeech.OnInitListener {
        private final MainActivity act;
        TtsInit(MainActivity a) { act = a; }
        @Override
        public void onInit(int status) { act.onTtsReady(status); }
    }

    static final class Chrome extends WebChromeClient {
        private final MainActivity act;
        Chrome(MainActivity a) { act = a; }
        @Override
        @SuppressWarnings({"rawtypes", "unchecked"})
        public boolean onShowFileChooser(WebView view, ValueCallback cb, FileChooserParams params) { return act.openChooser(cb, params); }
    }

    static final class Bridge {
        private final MainActivity act;
        Bridge(MainActivity a) { act = a; }
        @JavascriptInterface
        public void speak(String text, float pitch, float rate) { act.speak(text, pitch, rate); }
        @JavascriptInterface
        public boolean ready() { return act.ttsOk; }
    }
}
