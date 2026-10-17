package com.levoy.app.calls

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.MediaRecorder
import android.os.Build
import android.os.IBinder
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.levoy.app.data.Session
import com.levoy.app.data.phoneKeyOf
import com.levoy.app.sync.CallLogReader
import com.levoy.app.sync.CallSync
import java.io.File

/**
 * Records the call audio of a LEAD call, only while Levoy is the default phone app (the one place Google Play still allows it —
 * the Accessibility-API route was banned for call recording in May 2022) and only when the person switched Call Recording on.
 * Files wait in `filesDir/recordings` until [CallSync] has uploaded the call and attached the file to it.
 *
 * Android 10+ gives apps the microphone, not the other party's line: the far end is captured when the call is on speaker.
 * That is a platform limit, not something this class can work around.
 */
object CallRecorder {
    /** The in-call screen shows a "Recording" mark while this is true. */
    var active by mutableStateOf(false)
        internal set

    /** Names are `<startMillis>_<phoneKey>_<seconds>.m4a`; a file still being written ends in `.part`. */
    fun dir(c: Context) = File(c.filesDir, "recordings").apply { mkdirs() }

    /** True only for a call to one of this person's assigned leads, with the switch on, signed in and the mic allowed. */
    fun shouldRecord(c: Context, number: String): Boolean {
        val s = Session(c)
        val key = phoneKeyOf(number) ?: return false
        return s.callRecording && s.token != null && key in s.leadKeys && CallLogReader.has(c, Manifest.permission.RECORD_AUDIO)
    }

    fun start(c: Context, number: String) {
        if (active || !shouldRecord(c, number)) return
        // A phone that refuses a foreground microphone service (background-start rules) just records nothing.
        runCatching { ContextCompat.startForegroundService(c, Intent(c, RecordingService::class.java).setAction(RecordingService.START).putExtra("key", phoneKeyOf(number))) }
    }

    fun stop(c: Context) {
        if (!active) return
        c.stopService(Intent(c, RecordingService::class.java))        // onDestroy closes and saves the file
    }
}

class RecordingService : Service() {
    private var recorder: MediaRecorder? = null
    private var part: File? = null
    private var key: String = ""
    private var startedAt = 0L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == START) begin(intent.getStringExtra("key").orEmpty()) else stopSelf()
        return START_NOT_STICKY
    }

    private fun begin(phoneKey: String) {
        if (recorder != null || phoneKey.isEmpty()) return
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(NotificationChannel(CHANNEL, "Call recording", NotificationManager.IMPORTANCE_LOW))
        val n: Notification = NotificationCompat.Builder(this, CHANNEL).setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("Recording this lead call").setContentText("Levoy is recording the call for your team's quality review")
            .setOngoing(true).setCategory(NotificationCompat.CATEGORY_CALL).build()
        if (Build.VERSION.SDK_INT >= 29) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE) else startForeground(ID, n)

        key = phoneKey; startedAt = System.currentTimeMillis()
        val file = File(CallRecorder.dir(this), "${startedAt}_$key.part")
        // VOICE_COMMUNICATION is the source the telephony stack lets a dialler app keep open during a call; MIC is the fallback.
        val ok = listOf(MediaRecorder.AudioSource.VOICE_COMMUNICATION, MediaRecorder.AudioSource.MIC).any { src -> open(src, file) }
        if (!ok) { file.delete(); stopSelf(); return }
        part = file; CallRecorder.active = true
    }

    @Suppress("DEPRECATION")
    private fun open(source: Int, file: File): Boolean = runCatching {
        val r = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(this) else MediaRecorder()
        r.setAudioSource(source)
        r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
        r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
        r.setAudioChannels(1); r.setAudioSamplingRate(16_000); r.setAudioEncodingBitRate(32_000)
        r.setOutputFile(file.absolutePath)
        r.prepare(); r.start()
        recorder = r
    }.isSuccess

    private fun finish() {
        val r = recorder ?: return
        recorder = null; CallRecorder.active = false
        val p = part ?: return
        val seconds = ((System.currentTimeMillis() - startedAt) / 1000).toInt()
        // stop() throws if nothing was captured; that file is worthless either way
        val saved = runCatching { r.stop(); true }.getOrDefault(false)
        runCatching { r.release() }
        if (!saved || seconds < MIN_SECONDS) { p.delete(); return }
        if (p.renameTo(File(p.parentFile, "${startedAt}_${key}_$seconds.m4a"))) CallSync.syncSoon(applicationContext) else p.delete()
    }

    override fun onDestroy() { finish(); super.onDestroy() }

    companion object { const val START = "start"; private const val CHANNEL = "call_recording"; private const val ID = 4402; private const val MIN_SECONDS = 3 }
}
