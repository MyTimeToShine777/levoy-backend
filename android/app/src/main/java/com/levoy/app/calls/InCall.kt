package com.levoy.app.calls

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.telecom.Call
import android.telecom.CallAudioState
import android.telecom.InCallService
import android.telecom.VideoProfile
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Dialpad
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.NotificationCompat
import com.levoy.app.sync.CallLogReader
import com.levoy.app.ui.theme.CallioColors
import com.levoy.app.ui.theme.CallioTheme
import com.levoy.app.ui.theme.Pal
import com.levoy.app.ui.theme.Txt
import kotlinx.coroutines.delay

/**
 * The phone side of "default phone app": Android hands calls to this service when Callio holds the dialler role.
 * It owns the call list the in-call screen shows. (A call that is not the person's own business — e.g. while
 * Callio is NOT the default app — never reaches this code.)
 */
object CallStore {
    val calls = mutableListOf<Call>()
    var service: InCallService? = null
    var audio: CallAudioState? = null
    /** Bumped on any change so Compose re-reads the (non-observable) Call objects. */
    var tick by mutableIntStateOf(0)

    fun changed() { tick++ }
    fun primary(): Call? = calls.firstOrNull { it.state == Call.STATE_RINGING } ?: calls.firstOrNull { it.state != Call.STATE_DISCONNECTED } ?: calls.firstOrNull()
    fun numberOf(c: Call): String = c.details?.handle?.schemeSpecificPart.orEmpty()
}

class CallioInCallService : InCallService() {
    private val callback = object : Call.Callback() {
        override fun onStateChanged(call: Call, state: Int) {
            CallStore.changed(); if (state != Call.STATE_RINGING) cancelIncoming()
            // Record from the moment the line is answered until it ends; CallRecorder itself refuses anything that is not a lead call.
            if (state == Call.STATE_ACTIVE) CallRecorder.start(this@CallioInCallService, CallStore.numberOf(call))
            else if (state == Call.STATE_DISCONNECTED) CallRecorder.stop(this@CallioInCallService)
        }
        override fun onDetailsChanged(call: Call, details: Call.Details) = CallStore.changed()
    }

    override fun onCreate() { super.onCreate(); CallStore.service = this }
    override fun onDestroy() { CallStore.service = null; super.onDestroy() }

    override fun onCallAdded(call: Call) {
        CallStore.calls.add(call); call.registerCallback(callback); CallStore.changed()
        if (call.state == Call.STATE_RINGING) showIncoming(call) else open()
    }

    override fun onCallRemoved(call: Call) {
        call.unregisterCallback(callback); CallStore.calls.remove(call); CallStore.changed(); cancelIncoming()
        if (CallStore.calls.none { it.state == Call.STATE_ACTIVE }) CallRecorder.stop(this)
    }

    override fun onCallAudioStateChanged(audioState: CallAudioState) { CallStore.audio = audioState; CallStore.changed() }

    private fun open() = startActivity(Intent(this, InCallActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))

    private fun showIncoming(call: Call) {
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(NotificationChannel(CHANNEL, "Incoming calls", NotificationManager.IMPORTANCE_HIGH))
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val full = PendingIntent.getActivity(this, 0, Intent(this, InCallActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), flags)
        fun act(code: Int, label: String) = NotificationCompat.Action(0, label, PendingIntent.getBroadcast(this, code, Intent(this, CallActionReceiver::class.java).setAction(label), flags))
        val who = CallLogReader.nameFor(this, CallStore.numberOf(call)) ?: com.levoy.app.data.Session(this).leadNameFor(CallStore.numberOf(call)) ?: CallStore.numberOf(call).ifBlank { "Unknown" }
        nm.notify(INCOMING_ID, NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.sym_call_incoming).setContentTitle(who).setContentText("Incoming call")
            .setCategory(NotificationCompat.CATEGORY_CALL).setPriority(NotificationCompat.PRIORITY_MAX).setOngoing(true)
            .setFullScreenIntent(full, true).setContentIntent(full)
            .addAction(act(1, ACTION_DECLINE)).addAction(act(2, ACTION_ANSWER)).build())
    }

    private fun cancelIncoming() = getSystemService(NotificationManager::class.java).cancel(INCOMING_ID)

    companion object { const val CHANNEL = "incoming_calls"; const val INCOMING_ID = 4401; const val ACTION_ANSWER = "Answer"; const val ACTION_DECLINE = "Decline" }
}

class CallActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val call = CallStore.calls.firstOrNull { it.state == Call.STATE_RINGING } ?: return
        when (intent.action) {
            CallioInCallService.ACTION_ANSWER -> { call.answer(VideoProfile.STATE_AUDIO_ONLY); context.startActivity(Intent(context, InCallActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            CallioInCallService.ACTION_DECLINE -> call.reject(false, null)
        }
    }
}

class InCallActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setShowWhenLocked(true); setTurnScreenOn(true)
        setContent { CallioTheme { InCallScreen(onGone = { finish() }) } }
    }
}

/** What the call screen shows — separate from Telecom's Call objects so it can be rendered in tests. */
data class InCallUi(
    val name: String?, val number: String, val status: String, val ringing: Boolean,
    val muted: Boolean = false, val speaker: Boolean = false, val held: Boolean = false, val hasCall: Boolean = true,
    val recording: Boolean = false,
)

class InCallActions(
    val onAnswer: () -> Unit = {}, val onDecline: () -> Unit = {}, val onEnd: () -> Unit = {}, val onMute: () -> Unit = {},
    val onSpeaker: () -> Unit = {}, val onHold: () -> Unit = {}, val onDtmf: (Char) -> Unit = {},
)

@Composable
private fun InCallScreen(onGone: () -> Unit) {
    @Suppress("UNUSED_VARIABLE") val tick = CallStore.tick          // re-read on every change
    val call = CallStore.primary()
    if (call == null || call.state == Call.STATE_DISCONNECTED && CallStore.calls.size <= 1) {
        LaunchedEffect(Unit) { delay(900); if (CallStore.calls.none { it.state != Call.STATE_DISCONNECTED }) onGone() }
    }
    val ctx = androidx.compose.ui.platform.LocalContext.current
    // When the call ends Telecom removes it from the list. Keep showing the last number meanwhile, instead of flashing "Unknown".
    var lastNumber by remember { mutableStateOf("") }
    val number = call?.let(CallStore::numberOf).orEmpty().ifBlank { lastNumber }
    LaunchedEffect(number) { if (number.isNotBlank()) lastNumber = number }
    // The phone's saved contact name wins; otherwise the name of the assigned lead, so a lead is never shown as a bare number.
    val name = remember(number) { CallLogReader.nameFor(ctx, number) ?: com.levoy.app.data.Session(ctx).leadNameFor(number) }
    var seconds by remember { mutableIntStateOf(0) }
    LaunchedEffect(call?.state) { while (true) { seconds = call?.details?.connectTimeMillis?.takeIf { it > 0 }?.let { ((System.currentTimeMillis() - it) / 1000).toInt() } ?: 0; delay(1000) } }
    val status = when (call?.state) {
        Call.STATE_RINGING -> "Incoming call"; Call.STATE_DIALING, Call.STATE_CONNECTING -> "Calling…"; Call.STATE_HOLDING -> "On hold"
        Call.STATE_ACTIVE -> "%d:%02d".format(seconds / 60, seconds % 60); Call.STATE_DISCONNECTED -> "Call ended"
        else -> if (lastNumber.isNotBlank()) "Call ended" else ""
    }
    val svc = CallStore.service
    InCallView(
        InCallUi(name, number, status, call?.state == Call.STATE_RINGING, CallStore.audio?.isMuted == true, CallStore.audio?.route == CallAudioState.ROUTE_SPEAKER, call?.state == Call.STATE_HOLDING, call != null, CallRecorder.active),
        InCallActions(
            onAnswer = { call?.answer(VideoProfile.STATE_AUDIO_ONLY) }, onDecline = { call?.reject(false, null) }, onEnd = { call?.disconnect() },
            onMute = { svc?.setMuted(CallStore.audio?.isMuted != true) },
            onSpeaker = { svc?.setAudioRoute(if (CallStore.audio?.route == CallAudioState.ROUTE_SPEAKER) CallAudioState.ROUTE_EARPIECE else CallAudioState.ROUTE_SPEAKER) },
            onHold = { if (call?.state == Call.STATE_HOLDING) call.unhold() else call?.hold() },
            onDtmf = { ch -> call?.playDtmfTone(ch); call?.stopDtmfTone() },
        ),
    )
}

@Composable
fun InCallView(ui: InCallUi, a: InCallActions, startWithKeypad: Boolean = false) {
    var keypad by remember { mutableStateOf(startWithKeypad) }
    Column(Modifier.fillMaxSize().background(Pal.background).padding(horizontal = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(Modifier.height(90.dp))
        Box(Modifier.size(128.dp).clip(RoundedCornerShape(44.dp)).background(CallioColors.Amber.copy(alpha = 0.18f)), contentAlignment = Alignment.Center) {
            Text((ui.name ?: ui.number).take(1).uppercase().ifEmpty { "?" }, style = Txt.Title.copy(fontSize = 54.sp), color = CallioColors.Amber)
        }
        Spacer(Modifier.height(26.dp))
        Text(ui.name ?: ui.number.ifBlank { "Unknown" }, style = Txt.Title.copy(fontSize = 32.sp), color = Pal.text, textAlign = TextAlign.Center)
        if (ui.name != null) Text(ui.number, style = Txt.Body.copy(fontSize = 16.sp), color = Pal.textMuted)
        Spacer(Modifier.height(14.dp))
        Text(ui.status, style = Txt.Section.copy(fontSize = 22.sp), color = if (ui.ringing) CallioColors.Amber else Pal.text)
        if (ui.recording) {
            Spacer(Modifier.height(12.dp))
            Text("● Recording", style = Txt.Small.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = CallioColors.MissedText,
                modifier = Modifier.clip(RoundedCornerShape(16.dp)).background(CallioColors.Missed.copy(alpha = 0.18f)).padding(horizontal = 14.dp, vertical = 7.dp))
        }
        Spacer(Modifier.weight(1f))
        if (keypad && ui.hasCall) Keypad(a.onDtmf) else if (!ui.ringing && ui.hasCall) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                RoundButton(if (ui.muted) Icons.Filled.MicOff else Icons.Filled.Mic, "Mute", ui.muted, a.onMute)
                RoundButton(Icons.Filled.Dialpad, "Keypad", false) { keypad = true }
                RoundButton(Icons.Filled.VolumeUp, "Speaker", ui.speaker, a.onSpeaker)
                RoundButton(if (ui.held) Icons.Filled.PlayArrow else Icons.Filled.Pause, if (ui.held) "Resume" else "Hold", ui.held, a.onHold)
            }
        }
        Spacer(Modifier.height(40.dp))
        if (ui.ringing) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                BigButton(Icons.Filled.CallEnd, "Decline", CallioColors.Danger, a.onDecline)
                BigButton(Icons.Filled.Call, "Answer", Color(0xFF2E9E3F), a.onAnswer)
            }
        } else if (ui.hasCall) {
            // one wide pill: easy to hit with a thumb, and clearly different from the other controls
            Row(
                Modifier.fillMaxWidth().height(72.dp).clip(RoundedCornerShape(36.dp)).background(CallioColors.Danger)
                    .clickable { if (keypad) keypad = false else a.onEnd() },
                horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.CallEnd, null, tint = Color.White, modifier = Modifier.size(28.dp))
                Spacer(Modifier.size(10.dp))
                Text(if (keypad) "Hide keypad" else "End call", style = Txt.Button.copy(fontSize = 18.sp), color = Color.White)
            }
        }
        Spacer(Modifier.height(48.dp))
    }
}

@Composable
private fun Keypad(onDtmf: (Char) -> Unit) {
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        listOf("123", "456", "789", "*0#").forEach { row ->
            Row(Modifier.fillMaxWidth().height(64.dp)) {
                row.forEach { ch ->
                    Box(Modifier.weight(1f).fillMaxSize().clickable { onDtmf(ch) }, contentAlignment = Alignment.Center) { Text(ch.toString(), style = Txt.Section.copy(fontSize = 28.sp), color = Pal.text) }
                }
            }
        }
    }
}

@Composable
private fun RoundButton(icon: ImageVector, label: String, on: Boolean, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.clickable(onClick = onClick)) {
        Box(Modifier.size(72.dp).clip(RoundedCornerShape(26.dp)).background(if (on) CallioColors.Amber else Pal.card), contentAlignment = Alignment.Center) {
            Icon(icon, label, tint = if (on) CallioColors.OnAmber else Pal.text, modifier = Modifier.size(28.dp))
        }
        Spacer(Modifier.height(8.dp))
        Text(label, style = Txt.Small.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold), color = Pal.textSecondary)
    }
}

@Composable
private fun BigButton(icon: ImageVector, label: String, color: Color, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.clickable(onClick = onClick)) {
        Box(Modifier.size(76.dp).clip(CircleShape).background(color), contentAlignment = Alignment.Center) { Icon(icon, label, tint = Color.White, modifier = Modifier.size(36.dp)) }
        Spacer(Modifier.height(8.dp))
        Text(label, style = Txt.Body, color = Pal.text)
    }
}
