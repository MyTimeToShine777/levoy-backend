package com.levoy.app.sync

import android.Manifest
import android.content.Context
import android.os.PowerManager
import android.provider.CallLog
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.levoy.app.calls.CallRecorder
import com.levoy.app.data.Api
import com.levoy.app.data.ApiException
import com.levoy.app.data.Session
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

/** Uploads calls the server has not seen yet, then tells it how the phone is doing. */
object CallSync {
    private const val FIRST_SYNC_DAYS = 30L
    private const val KEEP_DAYS = 3L

    /** `endedSession` is set when the server said the sign-in is over (expired, or the company was suspended): retrying cannot help. */
    sealed interface Result { data class Done(val uploaded: Int) : Result; data class Failed(val message: String, val endedSession: ApiException? = null) : Result; object NotReady : Result }

    /** Fires after a sync stored new calls, wherever it ran from (the background worker included), so an open screen can refresh. */
    val uploads = kotlinx.coroutines.flow.MutableSharedFlow<Int>(extraBufferCapacity = 1)

    // Off the main thread: reading a big call log (and looking up every name) took long enough to freeze the app ("not responding").
    // Syncs are triggered from several places at once (opening the app, choosing a folder, the call-log watcher, the timer).
    // Two running together would both pick up the same recording file and upload it twice, so they take turns.
    private val oneAtATime = kotlinx.coroutines.sync.Mutex()

    suspend fun run(context: Context, session: Session, api: Api): Result =
        oneAtATime.withLock { withContext(Dispatchers.IO) { runSync(context, session, api) } }

    /**
     * "Check last 7 days": re-reads the phone's call log for the last [days] days, uploads every call to this person's leads that the
     * server does not have yet (the server skips the ones it has), and lists the calls this app cannot understand, with the reason.
     * It does not touch the normal sync position, so it is safe to run any time.
     */
    suspend fun recheck(context: Context, session: Session, api: Api, days: Int = 7): String = oneAtATime.withLock {
        withContext(Dispatchers.IO) {
            if (session.token == null) return@withContext "Sign in first."
            if (!CallLogReader.canReadLog(context)) return@withContext "Callio cannot read your call log. Allow the Call log permission first."
            val leads = api.myLeadNumbers()
            session.leadKeys = leads
            if (leads.isEmpty()) return@withContext "You have no assigned leads yet, so there is nothing to check."
            val since = System.currentTimeMillis() - days * 86_400_000L
            val phoneRows = CallLogReader.readRaw(context, since, leads)
            var added = 0
            var alreadyThere = 0
            for (chunk in CallLogReader.read(context, since, only = leads).chunked(400)) {
                val r = api.uploadCalls(chunk.map { it.toEvent() })
                added += r.received; alreadyThere += r.duplicates
            }
            if (added > 0) uploads.tryEmit(added)
            // type 4 is a voicemail: skipped on purpose. Anything else we cannot classify is a call the phone wrote in its own way.
            val unreadable = phoneRows.filter { CallLogReader.classify(it.type) == null && it.type != 4 }
            val clock = java.text.SimpleDateFormat("dd MMM HH:mm", java.util.Locale.getDefault())
            buildString {
                append("Last $days days: ${phoneRows.size} calls to your leads are in this phone's call log.\n")
                append("• $alreadyThere were already on the dashboard\n")
                append("• $added were missing and are uploaded now\n")
                append("• ${unreadable.size} could not be read by Callio")
                unreadable.take(15).forEach { u ->
                    append("\n    ${clock.format(java.util.Date(u.date))} · ${u.number} · ${u.seconds}s · call type ${u.type}${if (u.features and 8 != 0) " · Wi-Fi call" else ""}")
                }
                if (unreadable.size > 15) append("\n    … and ${unreadable.size - 15} more")
            }
        }
    }

    private suspend fun runSync(context: Context, session: Session, api: Api): Result {
        if (session.token == null) return Result.NotReady
        if (!CallLogReader.canReadLog(context)) return Result.NotReady
        return try {
            // Only calls to the numbers of leads assigned to this person are read and uploaded, never the whole call log.
            // If the lead list cannot be loaded this throws and nothing is uploaded.
            val leadNumbers = api.myLeadNumbers()
            session.leadKeys = leadNumbers          // the call recorder checks a live call against this
            var after = session.lastSyncedAt
            val firstSync = after == 0L
            if (firstSync) {
                // First sync on this phone: do not re-send calls the server already holds (e.g. after a sign-out),
                // and never look further back than FIRST_SYNC_DAYS.
                val uid = session.user?.id
                val newest = api.history(mapOf("limit" to 1, "user_id" to uid)).rows.firstOrNull()?.timestamp
                val newestMs = newest?.let { runCatching { java.time.Instant.parse(it).toEpochMilli() }.getOrNull() } ?: 0L
                after = maxOf(newestMs, System.currentTimeMillis() - FIRST_SYNC_DAYS * 86_400_000L)
            }
            val newCalls = if (leadNumbers.isEmpty()) emptyList() else CallLogReader.read(context, after, only = leadNumbers)
            // A number that has just become one of this person's leads: calls to it were skipped before (it was not a lead then),
            // so look back for them now. The server ignores any call it already has.
            val newLeads = if (firstSync) emptySet() else leadNumbers - session.scannedLeadKeys
            val earlierCalls = if (newLeads.isEmpty()) emptyList()
                else CallLogReader.read(context, System.currentTimeMillis() - FIRST_SYNC_DAYS * 86_400_000L, only = newLeads).filter { it.date <= after }
            val calls = earlierCalls + newCalls
            var uploaded = 0
            for (chunk in calls.chunked(400)) {
                uploaded += api.uploadCalls(chunk.map { it.toEvent() }).received
                session.lastSyncedAt = maxOf(session.lastSyncedAt, chunk.last().date)
            }
            if (calls.isEmpty() && after > session.lastSyncedAt) session.lastSyncedAt = after
            session.scannedLeadKeys = leadNumbers          // only now: if the upload failed above, the look-back is tried again next time
            if (uploaded > 0) uploads.tryEmit(uploaded)
            runCatching { PhoneRecordings.importFor(context, session, leadNumbers) }      // the phone's own recorder (both voices)
            uploadRecordings(context, session, api)
            reportDevice(context, api)
            Result.Done(uploaded)
        } catch (e: ApiException) {
            Result.Failed(e.message ?: "Sync failed", endedSession = e.takeIf { it.sessionEnded })
        } catch (e: Exception) {
            Result.Failed(e.message ?: "Sync failed")
        }
    }

    /**
     * Attach each finished recording (`<startMillis>_<phoneKey>_<seconds>.m4a`) to the call the server now holds for it: the same number,
     * with a start time shortly before the recording began (the call log stamps the dial/ring time, the recorder starts on answer).
     * A recording whose call is not on the server yet waits for the next sync; one older than [KEEP_DAYS] is dropped.
     */
    private suspend fun uploadRecordings(context: Context, session: Session, api: Api) {
        val files = CallRecorder.dir(context).listFiles { f -> f.extension.lowercase() in PhoneRecordings.EXTENSIONS }?.toList().orEmpty()
        if (files.isEmpty()) return
        val uid = session.user?.id
        val rows = runCatching { api.history(mapOf("limit" to 200, "user_id" to uid)).rows }.getOrNull() ?: return
        for (f in files) {
            val (startMs, key, seconds) = f.nameWithoutExtension.split('_').let { p ->
                Triple(p.getOrNull(0)?.toLongOrNull(), p.getOrNull(1), p.getOrNull(2)?.toIntOrNull())
            }
            if (startMs == null || key == null || seconds == null) { f.delete(); continue }
            val call = rows.filter { it.phone_key == key }
                .mapNotNull { r -> runCatching { java.time.Instant.parse(r.timestamp).toEpochMilli() }.getOrNull()?.let { r to it } }
                .filter { (_, t) -> t <= startMs + 60_000L && t >= startMs - 15 * 60_000L }
                .maxByOrNull { (_, t) -> t }
            if (call == null) { if (System.currentTimeMillis() - startMs > KEEP_DAYS * 86_400_000L) f.delete(); continue }
            try {
                api.uploadRecording(call.first.id, f, seconds)
                f.delete()
            } catch (e: ApiException) {
                // 400/403/404/413: the server will never take this file, so do not retry it forever
                if (e.code in listOf(400, 403, 404, 413)) f.delete()
            }
        }
    }

    private suspend fun reportDevice(context: Context, api: Api) {
        runCatching {
            val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            api.deviceStatus(mapOf(
                "device_name" to "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}",
                "app_version" to com.levoy.app.BuildConfig.VERSION_NAME,
                "permissions" to mapOf(
                    "call_log" to CallLogReader.has(context, Manifest.permission.READ_CALL_LOG),
                    "phone" to CallLogReader.has(context, Manifest.permission.READ_PHONE_STATE),
                    "contacts" to CallLogReader.has(context, Manifest.permission.READ_CONTACTS),
                ),
                "battery_optimized" to !pm.isIgnoringBatteryOptimizations(context.packageName),
                "default_dialer" to false,
            ))
        }
    }

    fun schedulePeriodic(context: Context) {
        val req = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork("call-sync", ExistingPeriodicWorkPolicy.KEEP, req)
    }

    /** Called when the call log changes: sync soon, once, even if several calls land together. */
    fun syncSoon(context: Context) {
        val req = OneTimeWorkRequestBuilder<SyncWorker>().setInitialDelay(4, TimeUnit.SECONDS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
        WorkManager.getInstance(context).enqueueUniqueWork("call-sync-now", ExistingWorkPolicy.REPLACE, req)
    }

    /**
     * Ask Android itself to wake Callio when the call log changes. Unlike the in-app observer, this still works after Android has closed
     * the app in the background. It fires once, so the run it starts arms it again (`again` = true, called from the worker).
     */
    fun watchCallLog(context: Context, again: Boolean = false) {
        val req = OneTimeWorkRequestBuilder<SyncWorker>()
            .setInputData(workDataOf("watch" to true))
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED)
                .addContentUriTrigger(CallLog.Calls.CONTENT_URI, true)
                .setTriggerContentUpdateDelay(3, TimeUnit.SECONDS).setTriggerContentMaxDelay(15, TimeUnit.SECONDS).build()).build()
        val policy = if (again) ExistingWorkPolicy.APPEND_OR_REPLACE else ExistingWorkPolicy.KEEP
        WorkManager.getInstance(context).enqueueUniqueWork("call-log-watch", policy, req)
    }

    fun cancel(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork("call-log-watch")
        WorkManager.getInstance(context).cancelUniqueWork("call-sync")
        WorkManager.getInstance(context).cancelUniqueWork("call-sync-now")
    }
}

class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val session = Session(applicationContext)
        if (inputData.getBoolean("watch", false)) CallSync.watchCallLog(applicationContext, again = true)      // before reading, so a call during this run is not missed
        return when (val r = CallSync.run(applicationContext, session, Api(session))) {
            // the sign-in is over: trying again later cannot fix that. The app asks the person to sign in when it is opened.
            is CallSync.Result.Failed -> if (r.endedSession != null) Result.success() else Result.retry()
            else -> Result.success()
        }
    }
}
