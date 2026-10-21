
package com.levoy.app.service

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.levoy.app.CallioApp
import com.levoy.app.MainActivity
import com.levoy.app.calllog.CallLogTracker
import com.levoy.app.network.TokenStorage
import java.util.concurrent.Executors

/**
 * Foreground service that keeps call log sync alive in background.
 * Shows a persistent notification: "Callio is tracking calls".
 */
class CallSyncService : Service() {

    private var wakeLock: PowerManager.WakeLock? = null
    private val executor = Executors.newSingleThreadExecutor()
    private var isRunning = false

    override fun onCreate() {
        super.onCreate()
        createWakeLock()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_UPLOAD_PENDING -> executor.execute { uploadPendingCalls() }
            ACTION_FULL_SYNC -> executor.execute { fullSync() }
            ACTION_STOP -> stopSelf()
        }
        startForeground(NOTIFICATION_ID, createNotification())
        if (!isRunning) {
            isRunning = true
            startPeriodicSync()
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        isRunning = false
        wakeLock?.let { it.release(); wakeLock = null }
        executor.shutdown()
    }

    private fun createWakeLock() {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Callio::CallSyncLock")
            .apply { setReferenceCounted(false) }
    }

    private fun createNotification(): Notification {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CallioApp.CHANNEL_SYNC)
            .setContentTitle("Callio")
            .setContentText("Tracking your call activity")
            .setSmallIcon(com.levoy.app.R.drawable.ic_calls)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }

    private fun startPeriodicSync() {
        // Delegate to WorkManager — periodic work survives process death, unlike a timer.
        CallSyncWorker.schedule(this)
    }

    private fun uploadPendingCalls() {
        if (TokenStorage.getInstance(this).getToken() == null) return
        val tracker = CallLogTracker.getInstance(this)
        val uploaded = tracker.uploadPendingCalls()
        android.util.Log.d("CallSyncService", "Uploaded $uploaded pending calls")
    }

    private fun fullSync() {
        val tracker = CallLogTracker.getInstance(this)
        val uploaded = tracker.fullSync()
        android.util.Log.d("CallSyncService", "Full sync: $uploaded calls uploaded")
    }

    companion object {
        const val NOTIFICATION_ID = 1001
        const val ACTION_UPLOAD_PENDING = "com.levoy.app.UPLOAD_PENDING"
        const val ACTION_FULL_SYNC = "com.levoy.app.FULL_SYNC"
        const val ACTION_STOP = "com.levoy.app.STOP"

        fun start(context: Context) = dispatch(context, ACTION_UPLOAD_PENDING)

        fun uploadPending(context: Context) = dispatch(context, ACTION_UPLOAD_PENDING)

        fun fullSync(context: Context) = dispatch(context, ACTION_FULL_SYNC)

        fun stop(context: Context) = dispatch(context, ACTION_STOP)

        /**
         * The service is a foreground service, so on Android 8+ it must always be
         * started with startForegroundService(); plain startService() throws
         * IllegalStateException when the app is in the background.
         */
        private fun dispatch(context: Context, action: String) {
            val intent = Intent(context, CallSyncService::class.java).apply {
                this.action = action
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
    }
}
