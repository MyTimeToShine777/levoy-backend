package com.levoy.app.sync

import android.Manifest
import android.content.ContentUris
import android.content.Context
import android.os.Build
import android.provider.MediaStore
import com.levoy.app.calls.CallRecorder
import com.levoy.app.data.Session
import com.levoy.app.data.phoneKeyOf
import java.io.File

/**
 * Finds the recording the phone's OWN call recorder made for a lead call, so the dashboard plays both voices.
 *
 * Android does not let an ordinary app record the other person's line, but the phone's built-in recorder (Xiaomi / POCO, Samsung,
 * Oppo ...) can, and it saves a normal audio file. This looks for that file in the phone's audio library, matches it to the call
 * by time and number, and copies it into the same queue [CallRecorder] uses, where [SyncWorker] uploads it.
 *
 * It only works when the phone's recorder is the one recording, so Callio must NOT be the default phone app for that call
 * (the system recorder belongs to the phone's own dialler). It also only sees files the phone has added to its audio library.
 */
object PhoneRecordings {
    /** Extensions the server accepts. */
    val EXTENSIONS = listOf("m4a", "mp3", "amr", "3gp", "ogg", "wav")

    private const val LOOK_BACK_DAYS = 3L
    private const val MIN_SECONDS = 3
    private const val TAG = "PhoneRecordings"

    /** Read-audio permission differs by Android version. */
    fun permission(): String =
        if (Build.VERSION.SDK_INT >= 33) Manifest.permission.READ_MEDIA_AUDIO else Manifest.permission.READ_EXTERNAL_STORAGE

    fun canRead(c: Context) = CallLogReader.has(c, permission())

    /** One audio file from the phone's library, with just what is needed to decide if it belongs to a call. */
    data class Candidate(val id: Long, val name: String, val folder: String, val addedMs: Long, val durationMs: Long)

    /**
     * Pure matching rule (kept separate so it can be tested): which file, if any, is the recording of this call?
     * A call started at [callStartMs] and was talked on for [callSeconds]. The recorder finishes its file about when the call ends.
     */
    fun pick(candidates: List<Candidate>, number: String, callStartMs: Long, callSeconds: Int, alreadyUsed: Set<Long>): Candidate? {
        val digits = number.filter { it.isDigit() }.takeLast(10)
        val earliest = callStartMs + callSeconds * 1000L - 30_000L           // the file is finished about when the call ends
        val latest = callStartMs + callSeconds * 1000L + 5 * 60_000L
        return candidates
            .filter { it.id !in alreadyUsed && it.addedMs in earliest..latest }
            .filter { looksLikeCallRecording(it) }
            .filter { c ->
                // Named after the number: trust it. Otherwise the length has to agree with the call's talk time.
                (digits.length >= 7 && c.name.filter { it.isDigit() }.contains(digits)) ||
                    (c.durationMs <= 0 || kotlin.math.abs(c.durationMs / 1000 - callSeconds) <= 10)
            }
            .minByOrNull { kotlin.math.abs(it.addedMs - (callStartMs + callSeconds * 1000L)) }
    }

    /** Folder or file name says "call" (Xiaomi: MIUI/sound_recorder/call_rec, Samsung: Recordings/Call, "Call@+91...mp3"). */
    private fun looksLikeCallRecording(c: Candidate): Boolean {
        val s = (c.folder + "/" + c.name).lowercase()
        return "call" in s || "phone" in s
    }

    /**
     * For each recent lead call, copy the phone's recording into the upload queue (once). Returns how many were queued.
     * Does nothing without the audio permission, or when the person has Call Recording switched off.
     */
    fun importFor(c: Context, session: Session, leadKeys: Set<String>): Int {
        if (!session.callRecording || !canRead(c) || leadKeys.isEmpty()) {
            android.util.Log.i(TAG, "skipped: recording=${session.callRecording} audioPermission=${canRead(c)} leads=${leadKeys.size}")
            return 0
        }
        val since = System.currentTimeMillis() - LOOK_BACK_DAYS * 86_400_000L
        val calls = CallLogReader.read(c, since, only = leadKeys).filter { it.seconds >= MIN_SECONDS }
        if (calls.isEmpty()) return 0
        val library = readLibrary(c, since - 60_000L)
        android.util.Log.i(TAG, "lead calls=${calls.size} audioFilesSeen=${library.size}")
        if (library.isEmpty()) return 0
        val used = session.importedRecordingIds.toMutableSet()
        val doneCalls = session.importedRecordingCalls.toMutableSet()
        var queued = 0
        for (call in calls) {
            val key = phoneKeyOf(call.number) ?: continue
            val callId = "${call.date}_$key"
            if (callId in doneCalls) continue
            val file = pick(library, call.number, call.date, call.seconds, used) ?: continue
            val ext = file.name.substringAfterLast('.', "").lowercase().takeIf { it in EXTENSIONS } ?: continue
            val target = File(CallRecorder.dir(c), "${call.date}_${key}_${call.seconds}.$ext")
            val ok = runCatching {
                c.contentResolver.openInputStream(ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, file.id))?.use { input ->
                    target.outputStream().use { input.copyTo(it) }
                } != null && target.length() > 0
            }.getOrDefault(false)
            android.util.Log.i(TAG, "matched ${file.name} to call $callId, copied=$ok")
            if (ok) { used += file.id; doneCalls += callId; queued++ } else target.delete()
        }
        session.importedRecordingIds = used.toList().takeLast(300).toSet()
        session.importedRecordingCalls = doneCalls.toList().takeLast(300).toSet()
        return queued
    }

    private fun readLibrary(c: Context, addedAfterMs: Long): List<Candidate> {
        val out = ArrayList<Candidate>()
        val folderCol = if (Build.VERSION.SDK_INT >= 29) MediaStore.Audio.Media.RELATIVE_PATH else MediaStore.Audio.Media.DATA
        val cols = arrayOf(MediaStore.Audio.Media._ID, MediaStore.Audio.Media.DISPLAY_NAME, folderCol, MediaStore.Audio.Media.DATE_ADDED, MediaStore.Audio.Media.DURATION)
        runCatching {
            c.contentResolver.query(
                MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, cols, "${MediaStore.Audio.Media.DATE_ADDED} >= ?",
                arrayOf((addedAfterMs / 1000).toString()), "${MediaStore.Audio.Media.DATE_ADDED} DESC",
            )?.use { q ->
                while (q.moveToNext() && out.size < 500) {
                    out += Candidate(q.getLong(0), q.getString(1).orEmpty(), q.getString(2).orEmpty(), q.getLong(3) * 1000L, q.getLong(4))
                }
            }
        }
        return out
    }
}
