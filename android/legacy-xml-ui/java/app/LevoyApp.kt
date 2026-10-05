
package com.levoy.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build

class LevoyApp : Application() {

    companion object {
        const val CHANNEL_SYNC = "call_sync_channel"
        const val CHANNEL_ALERT = "call_alert_channel"
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val syncChannel = NotificationChannel(
                CHANNEL_SYNC,
                "Call Sync",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Background call log synchronization"
                setShowBadge(false)
            }
            val alertChannel = NotificationChannel(
                CHANNEL_ALERT,
                "Call Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Missed call and important call alerts"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(syncChannel)
            manager.createNotificationChannel(alertChannel)
        }
    }
}
