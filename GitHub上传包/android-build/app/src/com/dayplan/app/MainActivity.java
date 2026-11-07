package com.dayplan.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.AlertDialog;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Calendar;
import java.util.Locale;

/** 每日计划 — 本地 WebView 容器（数据保存在应用私有目录，完全离线） */
public class MainActivity extends Activity {

    private WebView web;
    private ValueCallback<Uri[]> filePicker;
    static final String PREFS = "dayplan";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);
        ensureChannel(this);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // localStorage 持久化
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setTextZoom(100);                     // 不随系统字体缩放破坏布局

        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient() {
            // WebView 默认不弹 alert/confirm，必须自行实现
            @Override
            public boolean onJsAlert(WebView v, String url, String msg, final android.webkit.JsResult r) {
                new AlertDialog.Builder(MainActivity.this)
                    .setMessage(msg)
                    .setPositiveButton("确定", (d, w) -> r.confirm())
                    .setOnCancelListener(d -> r.cancel())
                    .show();
                return true;
            }
            @Override
            public boolean onJsConfirm(WebView v, String url, String msg, final android.webkit.JsResult r) {
                new AlertDialog.Builder(MainActivity.this)
                    .setMessage(msg)
                    .setPositiveButton("确定", (d, w) -> r.confirm())
                    .setNegativeButton("取消", (d, w) -> r.cancel())
                    .setOnCancelListener(d -> r.cancel())
                    .show();
                return true;
            }
            // 「导入备份」的 <input type=file>
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (filePicker != null) filePicker.onReceiveValue(null);
                filePicker = cb;
                try {
                    Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("*/*");
                    startActivityForResult(Intent.createChooser(i, "选择备份文件"), 1001);
                    return true;
                } catch (Exception e) {
                    filePicker = null;
                    return false;
                }
            }
        });

        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl("file:///android_asset/index.html");
    }

    /** 暴露给页面 JS 的原生能力（方法在 WebView 后台线程被调用，勿碰 UI） */
    private class Bridge {
        @JavascriptInterface
        public boolean isSystemDark() {
            int m = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
            return m == Configuration.UI_MODE_NIGHT_YES;
        }

        /** 导出备份：API 29+ 写入系统「下载」；旧系统写应用外部专属目录 */
        @JavascriptInterface
        public void exportJson(final String name, final String content) {
            try {
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues cv = new ContentValues();
                    cv.put(MediaStore.Downloads.DISPLAY_NAME, name);
                    cv.put(MediaStore.Downloads.MIME_TYPE, "application/json");
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                    if (uri == null) throw new IllegalStateException("无法创建下载记录");
                    OutputStream os = getContentResolver().openOutputStream(uri);
                    os.write(content.getBytes(StandardCharsets.UTF_8));
                    os.close();
                    postUi("已保存到系统「下载」：" + name);
                } else {
                    File dir = getExternalFilesDir(null);
                    if (dir == null) dir = getFilesDir();
                    File f = new File(dir, name);
                    FileOutputStream fo = new FileOutputStream(f);
                    fo.write(content.getBytes(StandardCharsets.UTF_8));
                    fo.close();
                    postUi("已保存：" + f.getAbsolutePath());
                }
            } catch (final Exception e) {
                postUi("导出失败：" + e.getMessage());
            }
        }

        @JavascriptInterface
        public void copyText(final String text) {
            ClipboardManager cm = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            cm.setPrimaryClip(ClipData.newPlainText("dayplan", text));
        }

        @JavascriptInterface
        public void toast(final String msg) { postUi(msg); }

        /** 开启/关闭每日提醒（时/分/秒由 JS 传入），并请求通知权限 */
        @JavascriptInterface
        public void setDailyReminder(final boolean enabled, final int hour, final int minute, final int second) {
            final Context c = getApplicationContext();
            SharedPreferences p = c.getSharedPreferences(PREFS, MODE_PRIVATE);
            p.edit().putBoolean("remEnabled", enabled)
                    .putInt("remHour", hour).putInt("remMin", minute).putInt("remSec", second).apply();
            ensureChannel(c);
            if (enabled && Build.VERSION.SDK_INT >= 33 &&
                    checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                runOnUiThread(() -> requestPermissions(
                        new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 2002));
            }
            String when = scheduleDaily(c);
            if (enabled){
                postUi("每日提醒已开启 · 下次提醒 " + when);
                // 精确闹钟未授权时引导用户授权（否则提醒可能延迟几分钟）
                if (Build.VERSION.SDK_INT >= 31) {
                    AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
                    if (!am.canScheduleExactAlarms()) {
                        runOnUiThread(() -> {
                            try {
                                startActivity(new Intent(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                                        Uri.parse("package:" + getPackageName())));
                            } catch (Exception ignored) {}
                        });
                    }
                }
            } else {
                postUi("每日提醒已关闭");
            }
        }

        /** 立即发一条测试通知，验证通知链路是否通畅 */
        @JavascriptInterface
        public void testReminderNow() {
            ensureChannel(getApplicationContext());
            ReminderReceiver.notifyNow(getApplicationContext());
            postUi("测试通知已发送，请下拉通知栏查看");
        }

        /** JS 侧任务数据变化时同步给原生，供提醒通知取用 */
        @JavascriptInterface
        public void syncReminderData(final String json) {
            getApplicationContext().getSharedPreferences(PREFS, MODE_PRIVATE)
                    .edit().putString("remData", json == null ? "" : json).apply();
        }

        private void postUi(final String msg) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show());
        }
    }

    /** 创建通知渠道（幂等）。v1.9 起升级为 HIGH（横幅弹出），换新渠道 ID 避免旧渠道优先级不可变的问题 */
    static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            NotificationChannel ch = new NotificationChannel(
                    ReminderReceiver.CHANNEL_ID, "每日提醒", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("每天定时提醒还没完成的任务");
            nm.createNotificationChannel(ch);
        }
    }

    /** 排定下一次每日提醒闹钟；返回排定描述（如「明天 21:30」），关闭时返回 null */
    static String scheduleDaily(Context context) {
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = PendingIntent.getBroadcast(context, ReminderReceiver.ALARM_REQ,
                new Intent(context, ReminderReceiver.class),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.cancel(pi);
        if (!p.getBoolean("remEnabled", false)) return null;
        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.HOUR_OF_DAY, p.getInt("remHour", 21));
        cal.set(Calendar.MINUTE, p.getInt("remMin", 30));
        cal.set(Calendar.SECOND, p.getInt("remSec", 0));
        cal.set(Calendar.MILLISECOND, 0);
        boolean tomorrow = false;
        if (cal.getTimeInMillis() <= System.currentTimeMillis()){ cal.add(Calendar.DAY_OF_YEAR, 1); tomorrow = true; }
        if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(), pi); // 精确闹钟未授权时降级
        } else {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(), pi);
        }
        String hm = String.format(Locale.CHINA, "%02d:%02d", cal.get(Calendar.HOUR_OF_DAY), cal.get(Calendar.MINUTE));
        return (tomorrow ? "明天 " : "今天 ") + hm;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == 2002) {
            boolean ok = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            Toast.makeText(this, ok ? "通知权限已允许，每日提醒生效" : "未允许通知，提醒不会弹出（可到系统设置开启）",
                    Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == 1001 && filePicker != null) {
            filePicker.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            filePicker = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }
}
