package com.levoy.app.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.levoy.app.MainActivity
import com.levoy.app.calls.QuickCallService
import com.levoy.app.data.Api
import com.levoy.app.data.Session
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * Push notifications through Firebase Cloud Messaging. The server sends one for every notification a person gets
 * (missed-call reminders, plan changes …); this registers the phone for them and shows them.
 * Everything here is a no-op when the app was built without app/google-services.json.
 */
object Push {
    const val CHANNEL = "levoy_alerts"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    @Volatile private var lastRegistered: String? = null

    fun ensureChannel(c: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = c.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Reminders and alerts", NotificationManager.IMPORTANCE_HIGH))
    }

    private fun available(c: Context): Boolean = runCatching { FirebaseApp.getApps(c).isNotEmpty() || FirebaseApp.initializeApp(c) != null }.getOrDefault(false)

    private suspend fun currentToken(): String? = suspendCancellableCoroutine { k ->
        FirebaseMessaging.getInstance().token.addOnCompleteListener { t -> k.resume(if (t.isSuccessful) t.result else null) }
    }

    /** Tell the server this phone wants push. Safe to call as often as you like. */
    fun register(c: Context) {
        val app = c.applicationContext
        if (!available(app)) return
        scope.launch { currentToken()?.let { send(app, it) } }
    }

    internal fun send(app: Context, token: String) {
        val session = Session(app)
        if (session.token == null || token == lastRegistered) return
        scope.launch { runCatching { Api(session).registerPush(token, QuickCallService.deviceName()); lastRegistered = token } }
    }

    /** On sign-out: the phone must stop receiving this person's notifications. Needs the sign-in token it is leaving. */
    fun unregister(c: Context, authToken: String?) {
        val app = c.applicationContext
        if (authToken == null || !available(app)) return
        lastRegistered = null
        scope.launch { currentToken()?.let { runCatching { Api(Session(app)).unregisterPush(it, authToken) } } }
    }

    fun show(c: Context, title: String, body: String) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(c, android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        ensureChannel(c)
        val open = PendingIntent.getActivity(c, 0, Intent(c, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = NotificationCompat.Builder(c, CHANNEL).setSmallIcon(android.R.drawable.sym_action_call)
            .setContentTitle(title).setContentText(body).setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true).setContentIntent(open).setPriority(NotificationCompat.PRIORITY_HIGH).build()
        c.getSystemService(NotificationManager::class.java).notify((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), n)
    }
}

class CallioMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) { Push.send(applicationContext, token) }

    // Only called while the app is open; when it is closed the system shows the message itself (on the channel above).
    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.notification?.title ?: message.data["title"] ?: "Callio"
        val body = message.notification?.body ?: message.data["body"] ?: return
        Push.show(applicationContext, title, body)
    }
}
