package com.dayplan.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** 开机后重排每日提醒（系统重启会清除已排定的闹钟）。 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            MainActivity.scheduleDaily(context);
        }
    }
}
