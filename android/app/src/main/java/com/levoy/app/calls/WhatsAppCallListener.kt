package com.levoy.app.calls

import android.Manifest
import android.app.Notification
import android.content.Context
import android.net.Uri
import android.provider.ContactsContract
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.content.ContextCompat
import android.content.pm.PackageManager
import com.levoy.app.data.Api
import com.levoy.app.data.Session
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.time.Instant

/**
 * WhatsApp does not put its calls in the system call log, so the only trace is its notifications
 * ("Incoming voice call", "Ongoing voice call", "Missed voice call"). This reads them — only when the person
 * switched WhatsApp Call on and granted notification access — and uploads one call per notification episode.
 *
 * Limits (also listed on the WhatsApp Call screen): past calls cannot be recovered, rejected calls look like
 * missed ones, the text match is English, and a call needs a number we can find in the contacts.
 */
class WhatsAppCallListener : NotificationListenerService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private class Episode(val name: String, val startedAt: Long, val incoming: Boolean, var connectedAt: Long = 0L)
    private val open = HashMap<String, Episode>()

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (!isWhatsApp(sbn) || !enabled()) return
        val n = sbn.notification ?: return
        val title = n.extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val text = n.extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
        val low = text.lowercase()
        if (!(n.category == Notification.CATEGORY_CALL || low.contains("call"))) return
        val now = System.currentTimeMillis()
        when {
            low.contains("missed") -> { send(title, now, "incoming", "missed", 0); open.remove(sbn.key) }
            low.contains("ongoing") -> {
                val e = open[sbn.key] ?: Episode(title, now, incoming = false).also { open[sbn.key] = it }
                if (e.connectedAt == 0L) e.connectedAt = now
            }
            low.contains("incoming") -> open.getOrPut(sbn.key) { Episode(title, now, incoming = true) }
            low.contains("calling") || low.contains("ringing") -> open.getOrPut(sbn.key) { Episode(title, now, incoming = false) }
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) {
        val e = open.remove(sbn.key) ?: return
        if (!enabled()) return
        val now = System.currentTimeMillis()
        if (e.connectedAt > 0L) send(e.name, e.startedAt, if (e.incoming) "incoming" else "outgoing", "connected", ((now - e.connectedAt) / 1000).toInt())
        else if (e.incoming) send(e.name, e.startedAt, "incoming", "missed", 0)
        else send(e.name, e.startedAt, "outgoing", "unanswered", 0)
    }

    private fun isWhatsApp(sbn: StatusBarNotification) = sbn.packageName == "com.whatsapp" || sbn.packageName == "com.whatsapp.w4b"
    private fun enabled() = Session(this).let { it.whatsappCalls && it.token != null }

    private fun send(who: String, at: Long, direction: String, status: String, seconds: Int) {
        val number = numberFor(who) ?: return
        scope.launch {
            val session = Session(applicationContext)
            runCatching {
                Api(session).uploadCalls(listOf(mapOf(
                    "phone_number" to number, "direction" to direction, "status" to status, "duration_seconds" to seconds,
                    "timestamp" to Instant.ofEpochMilli(at).toString(), "caller_id" to who.takeIf { it.any(Char::isLetter) }, "source" to "whatsapp",
                )))
            }
        }
    }

    /** The notification title is a saved name, or the number itself for unsaved contacts. */
    private fun numberFor(who: String): String? {
        val digits = who.filter { it.isDigit() || it == '+' }
        if (digits.count { it.isDigit() } >= 7 && who.none(Char::isLetter)) return digits
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) return null
        return runCatching {
            contentResolver.query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI, arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER),
                "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} = ?", arrayOf(who), null,
            )?.use { if (it.moveToFirst()) it.getString(0)?.filter { c -> c.isDigit() || c == '+' } else null }
        }.getOrNull()?.takeIf { it.count(Char::isDigit) >= 7 }
    }
}
