package com.yujian.island;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import android.webkit.ValueCallback;
import androidx.webkit.WebViewAssetLoader;

/**
 * 屿见的 Android 壳：全屏 WebView 加载 assets 里的单文件游戏。
 * - 用 WebViewAssetLoader 把 assets 映射到 https://appassets.androidplatform.net/assets/，页面是安全来源，
 *   本地存档（localStorage）、WebGL、联网请求都和浏览器里一样。
 * - 沉浸式全屏（隐藏状态栏和导航栏），常亮屏幕，横竖屏跟随系统旋转设置。
 * - 外部链接交给系统浏览器打开；返回键把游戏切到后台（不退出、不丢进度）。
 */
public class MainActivity extends Activity {
  private static final String HOST = "appassets.androidplatform.net";
  private WebView web;
  private ValueCallback<Uri[]> fileCb;
  private static final int PICK = 41;

  @Override
  protected void onCreate(Bundle state) {
    super.onCreate(state);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
        .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
        .build();
    web = new WebView(this);
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setDatabaseEnabled(true);
    s.setMediaPlaybackRequiresUserGesture(false);
    s.setAllowFileAccess(false);
    s.setAllowContentAccess(false);
    s.setTextZoom(100);   // 不跟随系统字体缩放，界面排版保持一致
    web.setBackgroundColor(0xFF0E2A33);
    web.setWebViewClient(new WebViewClient() {
      @Override
      public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
        return loader.shouldInterceptRequest(req.getUrl());
      }
      @Override
      public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
        Uri u = req.getUrl();
        if (HOST.equals(u.getHost())) return false;
        try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
        return true;
      }
    });
    // WebChromeClient：① 网页里的确认 / 提示对话框（confirm / alert）能弹出来——没有它，confirm 直接当“取消”，
    //   造物台“还没保存，确定回到列表吗？”永远是取消，看起来就是卡死、返回不了；② 选文件（上传参考图）能打开相册
    web.setWebChromeClient(new WebChromeClient() {
      @Override
      public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
        if (fileCb != null) fileCb.onReceiveValue(null);
        fileCb = cb;
        try { Intent it = params.createIntent(); it.addCategory(Intent.CATEGORY_OPENABLE); startActivityForResult(Intent.createChooser(it, "选一张图片"), PICK); }
        catch (Exception e) { fileCb = null; cb.onReceiveValue(null); return false; }
        return true;
      }
    });
    setContentView(web);
    immersive();
    if (state != null) web.restoreState(state);
    if (web.getUrl() == null) web.loadUrl("https://" + HOST + "/assets/index.html");
  }

  @Override
  protected void onActivityResult(int req, int res, Intent data) {
    super.onActivityResult(req, res, data);
    if (req == PICK && fileCb != null) { fileCb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data)); fileCb = null; }
  }

  /** 沉浸式全屏：隐藏状态栏和导航栏，从边缘滑动可临时呼出 */
  private void immersive() {
    if (Build.VERSION.SDK_INT >= 30) {
      getWindow().setDecorFitsSystemWindows(false);
      WindowInsetsController c = getWindow().getInsetsController();
      if (c != null) {
        c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
        c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
      }
    } else {
      getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
          | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
          | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) immersive();
  }

  @Override protected void onPause() { super.onPause(); web.onPause(); web.pauseTimers(); }
  @Override protected void onResume() { super.onResume(); web.onResume(); web.resumeTimers(); }
  @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }

  @SuppressWarnings("deprecation")
  @Override
  public void onBackPressed() { moveTaskToBack(true); }

  @Override
  protected void onDestroy() {
    if (web != null) { web.destroy(); web = null; }
    super.onDestroy();
  }
}
