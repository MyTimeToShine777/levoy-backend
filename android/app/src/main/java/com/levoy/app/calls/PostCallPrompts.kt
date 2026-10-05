package com.levoy.app.calls

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.RemoteInput
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.levoy.app.data.Api
import com.levoy.app.data.Session
import com.levoy.app.sync.CallSync
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * The two prompts the reference app shows when a call ends:
 *  - after a call you spoke on  → "Note Popup": write what was discussed (saved as the call's note; Premium Plus)
 *  - after a call nobody picked up → "Missed Call Reminder": write a reminder to call back
 * Both are notifications with an inline reply box, so no overlay permission is needed and the person can ignore them.
 */
object PostCallPrompts {
    private const val CHANNEL = "post_call"
    const val ACTION_NOTE = "com.levoy.app.NOTE_REPLY"
    const val ACTION_REMINDER = "com.levoy.app.REMINDER_REPLY"
    const val KEY_TEXT = "text"
    const val EXTRA_NUMBER = "number"

    fun show(context: Context, number: String?, missed: Boolean) {
        val s = Session(context)
        if (s.token == null || number.isNullOrBlank()) return
        if (missed && !s.missedReminderPrompt) return
        if (!missed && !s.notePrompt) return
        val nm = context.getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(NotificationChannel(CHANNEL, "After a call", NotificationManager.IMPORTANCE_HIGH))
        val action = if (missed) ACTION_REMINDER else ACTION_NOTE
        val reply = Intent(context, PostCallReplyReceiver::class.java).setAction(action).putExtra(EXTRA_NUMBER, number)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
        val pi = PendingIntent.getBroadcast(context, number.hashCode(), reply, flags)
        val remote = RemoteInput.Builder(KEY_TEXT).setLabel(if (missed) "Write a reminder" else "Add a note").build()
        val act = NotificationCompat.Action.Builder(0, if (missed) "Write a reminder" else "Add note", pi)
            .addRemoteInput(androidx.core.app.RemoteInput.Builder(KEY_TEXT).setLabel(remote.label).build()).build()
        nm.notify(("post" + number).hashCode(), NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(android.R.drawable.sym_action_call)
            .setContentTitle(if (missed) "Missed call from $number" else "Call with $number ended")
            .setContentText(if (missed) "Write a reminder to call back" else "Tap to add a note")
            .setPriority(NotificationCompat.PRIORITY_HIGH).setAutoCancel(true).addAction(act).build())
    }
}

class PostCallReplyReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val text = RemoteInput.getResultsFromIntent(intent)?.getCharSequence(PostCallPrompts.KEY_TEXT)?.toString()?.trim().orEmpty()
        val number = intent.getStringExtra(PostCallPrompts.EXTRA_NUMBER).orEmpty()
        if (text.isEmpty() || number.isEmpty()) return
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            val s = Session(context); val api = Api(s)
            val nm = context.getSystemService(NotificationManager::class.java)
            val id = ("post" + number).hashCode()
            try {
                if (intent.action == PostCallPrompts.ACTION_REMINDER) api.addReminder(number, text, null)
                else {
                    delay(4000)                                         // let the call reach the log
                    CallSync.run(context, s, api)                       // make sure the call is on the server
                    val row = api.history(mapOf("search" to number.filter { it.isDigit() }.takeLast(10), "limit" to 1, "user_id" to s.user?.id)).rows.firstOrNull()
                        ?: error("The call has not reached the server yet — add the note from Call History.")
                    api.annotate(row.id, text, emptyList())
                }
                nm.cancel(id)
            } catch (e: Exception) {
                nm.notify(id, NotificationCompat.Builder(context, "post_call").setSmallIcon(android.R.drawable.stat_notify_error)
                    .setContentTitle("Could not save").setContentText(e.message ?: "Try again").setAutoCancel(true).build())
            } finally { pending.finish() }
        }
    }
}
