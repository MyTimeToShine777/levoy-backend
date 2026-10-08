package com.levoy.app.sync

import android.Manifest
import android.content.Context
import android.os.PowerManager
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.levoy.app.data.Api
import com.levoy.app.data.ApiException
import com.levoy.app.data.Session
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

/** Uploads calls the server has not seen yet, then tells it how the phone is doing. */
object CallSync {
    private const val FIRST_SYNC_DAYS = 30L

    sealed interface Result { data class Done(val uploaded: Int) : Result; data class Failed(val message: String) : Result; object NotReady : Result }

    // Off the main thread: reading a big call log (and looking up every name) took long enough to freeze the app ("not responding").
    suspend fun run(context: Context, session: Session, api: Api): Result = withContext(Dispatchers.IO) { runSync(context, session, api) }

    private suspend fun runSync(context: Context, session: Session, api: Api): Result {
        if (session.token == null) return Result.NotReady
        if (!CallLogReader.canReadLog(context)) return Result.NotReady
        return try {
            // Only calls to the numbers of leads assigned to this person are read and uploaded, never the whole call log.
            // If the lead list cannot be loaded this throws and nothing is uploaded.
            val leadNumbers = api.myLeadNumbers()
            var after = session.lastSyncedAt
            if (after == 0L) {
                // First sync on this phone: do not re-send calls the server already holds (e.g. after a sign-out),
                // and never look further back than FIRST_SYNC_DAYS.
                val uid = session.user?.id
                val newest = api.history(mapOf("limit" to 1, "user_id" to uid)).rows.firstOrNull()?.timestamp
                val newestMs = newest?.let { runCatching { java.time.Instant.parse(it).toEpochMilli() }.getOrNull() } ?: 0L
                after = maxOf(newestMs, System.currentTimeMillis() - FIRST_SYNC_DAYS * 86_400_000L)
            }
            val calls = if (leadNumbers.isEmpty()) emptyList() else CallLogReader.read(context, after, only = leadNumbers)
            var uploaded = 0
            for (chunk in calls.chunked(400)) {
                api.uploadCalls(chunk.map { it.toEvent() })
                uploaded += chunk.size
                session.lastSyncedAt = chunk.last().date
            }
            if (calls.isEmpty() && after > session.lastSyncedAt) session.lastSyncedAt = after
            reportDevice(context, api)
            Result.Done(uploaded)
        } catch (e: ApiException) {
            Result.Failed(e.message ?: "Sync failed")
        } catch (e: Exception) {
            Result.Failed(e.message ?: "Sync failed")
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

    fun cancel(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork("call-sync")
        WorkManager.getInstance(context).cancelUniqueWork("call-sync-now")
    }
}

class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val session = Session(applicationContext)
        return when (CallSync.run(applicationContext, session, Api(session))) {
            is CallSync.Result.Failed -> Result.retry()
            else -> Result.success()
        }
    }
}
