package com.dayplan.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.text.TextUtils;
import android.util.Log;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/** 每日提醒：到点读取同步的任务数据，通知还没完成的内容，并排下一天。 */
public class ReminderReceiver extends BroadcastReceiver {

    static final String CHANNEL_ID = "daily_reminder_v2";
    static final int NOTIFY_ID = 2001;
    static final int ALARM_REQ = 1001;

    @Override
    public void onReceive(Context context, Intent intent) {
        SharedPreferences p = context.getSharedPreferences("dayplan", Context.MODE_PRIVATE);
        if (!p.getBoolean("remEnabled", false)) return;
        notifyNow(context);
        // 排下一天
        MainActivity.scheduleDaily(context);
    }

    /** 立即构建并发送提醒通知（供闹钟触发与「测试通知」共用） */
    static void notifyNow(Context context) {
        SharedPreferences p = context.getSharedPreferences("dayplan", Context.MODE_PRIVATE);
        String title = "每日计划";
        String text = "来看看今天还有什么没完成";
        try {
            JSONObject o = new JSONObject(p.getString("remData", ""));
            String today = new SimpleDateFormat("yyyy-MM-dd", Locale.CHINA).format(new Date());

            // 今日未完成（含逾期）任务
            List<String> names = new ArrayList<>();
            int count = 0;
            JSONArray tasks = o.optJSONArray("tasks");
            if (tasks != null) {
                for (int i = 0; i < tasks.length(); i++) {
                    JSONObject t = tasks.optJSONObject(i);
                    if (t == null) continue;
                    String date = t.optString("date");
                    if (!t.optBoolean("done") && !date.isEmpty() && date.compareTo(today) <= 0) {
                        count++;
                        if (names.size() < 4) names.add(t.optString("title"));
                    }
                }
            }
            if (count > 0) {
                text = "还有 " + count + " 项任务未完成：" + TextUtils.join("、", names) + (count > names.size() ? " 等" : "");
            } else {
                // 任务都完成了，看看长期任务今天有没有打卡
                List<String> goalNames = new ArrayList<>();
                JSONArray goals = o.optJSONArray("goals");
                if (goals != null) {
                    for (int i = 0; i < goals.length(); i++) {
                        JSONObject g = goals.optJSONObject(i);
                        if (g == null) continue;
                        String endDate = g.optString("endDate");
                        if (!endDate.isEmpty() && endDate.compareTo(today) < 0) continue; // 已结束的不提醒
                        boolean todayDone = false;
                        JSONArray hist = g.optJSONArray("history");
                        if (hist != null) for (int j = 0; j < hist.length(); j++) {
                            if (today.equals(hist.optString(j))) { todayDone = true; break; }
                        }
                        if (!todayDone) goalNames.add(g.optString("title"));
                    }
                }
                if (!goalNames.isEmpty()) {
                    text = "今日任务已完成。长期任务还没打卡：" + TextUtils.join("、", goalNames);
                }
            }
        } catch (Exception e) {
            Log.w("DayPlan", "reminder build failed", e);
        }

        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        MainActivity.ensureChannel(context);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(context, CHANNEL_ID)
                : new Notification.Builder(context);
        PendingIntent pi = PendingIntent.getActivity(context, 1002,
                new Intent(context, MainActivity.class),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        b.setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setAutoCancel(true)
                .setContentIntent(pi);
        nm.notify(NOTIFY_ID, b.build());
    }
}
