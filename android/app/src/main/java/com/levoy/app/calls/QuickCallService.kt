package com.levoy.app.calls

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.telecom.TelecomManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.levoy.app.MainActivity
import com.levoy.app.data.Api
import com.levoy.app.data.ApiException
import com.levoy.app.data.Session
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * "Linked Quick Call Extension": while it is switched on this phone waits (long-poll) for numbers sent from the
 * person's browser — the Chrome extension or the dashboard — and dials them.
 * With the Phone permission it places the call straight away; without it, it posts a notification to tap.
 */
class QuickCallService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var job: Job? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Quick Call link", NotificationManager.IMPORTANCE_MIN))
            nm.createNotificationChannel(NotificationChannel(TAP_CHANNEL, "Tap to call", NotificationManager.IMPORTANCE_HIGH))
        }
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val n: Notification = NotificationCompat.Builder(this, CHANNEL).setSmallIcon(android.R.drawable.sym_action_call)
            .setContentTitle("Levoy is linked to your browser").setContentText("Numbers sent from Chrome will be dialled here")
            .setContentIntent(open).setOngoing(true).setPriority(NotificationCompat.PRIORITY_MIN).build()
        if (Build.VERSION.SDK_INT >= 34) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE) else startForeground(ID, n)

        if (job?.isActive != true) job = scope.launch { loop() }
        return START_STICKY
    }

    override fun onDestroy() { scope.coroutineContext[Job]?.cancel(); super.onDestroy() }

    private suspend fun loop() {
        val session = Session(applicationContext); val api = Api(session)
        val name = deviceName()
        var failures = 0
        while (scope.isActive && session.quickCallLinked && session.token != null) {
            try {
                api.linkPhone(name)                                         // (re)registers; harmless if already linked
                while (scope.isActive && session.quickCallLinked) {
                    val r = api.quickPending(name, 25)
                    failures = 0
                    r.commands.forEach { dial(it.phone_number, it.name) }
                }
            } catch (e: ApiException) {
                if (e.sessionEnded) { session.quickCallLinked = false; stopSelf(); return }
                failures++; delay((2000L * failures).coerceAtMost(30000L))
            } catch (e: Exception) { failures++; delay((2000L * failures).coerceAtMost(30000L)) }
        }
        stopSelf()
    }

    private fun dial(number: String, who: String?) {
        val uri = Uri.fromParts("tel", number, null)
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED) {
            runCatching { getSystemService(TelecomManager::class.java).placeCall(uri, null); return }
        }
        // no Phone permission: Android will not let a background service start a call, so ask for a tap
        val tap = PendingIntent.getActivity(this, number.hashCode(), Intent(Intent.ACTION_DIAL, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE)
        getSystemService(NotificationManager::class.java).notify(number.hashCode(), NotificationCompat.Builder(this, TAP_CHANNEL)
            .setSmallIcon(android.R.drawable.sym_action_call).setContentTitle("Call ${who ?: number}").setContentText("Tap to call $number")
            .setContentIntent(tap).setAutoCancel(true).setCategory(NotificationCompat.CATEGORY_CALL).setFullScreenIntent(tap, true).build())
    }

    companion object {
        const val CHANNEL = "quick_call_link"; const val TAP_CHANNEL = "quick_call_tap"; const val ID = 4402

        fun deviceName() = "${Build.MANUFACTURER} ${Build.MODEL}".trim()
        fun start(c: Context) = ContextCompat.startForegroundService(c, Intent(c, QuickCallService::class.java))
        fun stop(c: Context) { c.stopService(Intent(c, QuickCallService::class.java)) }
    }
}

/** After a reboot, pick the link back up if the person had it on. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val s = Session(context)
        if (s.quickCallLinked && s.token != null) runCatching { QuickCallService.start(context) }
    }
}
