package com.xs.frontline;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * X-S战线 安卓套壳：全屏 WebView 加载 assets/index.html（即 node build.mjs 打包出的单文件 H5）。
 * 存档保存在 WebView 的 localStorage / IndexedDB 中，离线可玩，不需要联网权限。
 */
public class MainActivity extends Activity {
    private WebView web;

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
        web.setBackgroundColor(0xFF140C2C);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setTextZoom(100);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient());
        setContentView(web);
        hideBars();
        if (state != null) web.restoreState(state);
        else web.loadUrl("file:///android_asset/index.html");
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
        // 切到后台时立即存档并暂停战斗
        web.evaluateJavascript("window.CF_DEBUG&&CF_DEBUG.Save.save();", null);
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    // 返回键：交给游戏处理（关弹窗 → 退回上一页 → 战斗中打开菜单），在大厅时才退出
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(window.CF_DEBUG&&CF_DEBUG.UI.back)?CF_DEBUG.UI.back():'exit'", new BackCallback(this));
    }

    // 用原始类型的具名类：新版 javac 为泛型回调生成的桥接方法会让 build-tools 34 的 d8 崩溃
    @SuppressWarnings({"rawtypes", "unchecked"})
    static final class BackCallback implements ValueCallback {
        private final Activity act;
        BackCallback(Activity a) { act = a; }
        @Override
        public void onReceiveValue(Object v) {
            if (v == null || String.valueOf(v).contains("exit")) act.finish();
        }
    }
}
