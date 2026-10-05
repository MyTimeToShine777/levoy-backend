
package com.levoy.app.service

import android.content.Context
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ListenableWorker
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.levoy.app.calllog.CallLogTracker
import com.levoy.app.network.TokenStorage
import java.util.concurrent.TimeUnit

/**
 * WorkManager worker: periodic background sync of call logs.
 * Runs every 15 minutes (or as configured).
 */
class CallSyncWorker(
    private val context: Context,
    workerParams: WorkerParameters
) : Worker(context, workerParams) {

    // Qualified as ListenableWorker.Result so it never resolves to kotlin.Result.
    override fun doWork(): ListenableWorker.Result {
        val token = TokenStorage.getInstance(context).getToken()
        if (token == null) {
            // Not logged in — skip sync
            return ListenableWorker.Result.success()
        }

        return try {
            val tracker = CallLogTracker.getInstance(context)
            val uploaded = tracker.fullSync()
            Log.d(TAG, "Synced $uploaded call events")
            ListenableWorker.Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "Sync failed", e)
            ListenableWorker.Result.retry()
        }
    }

    companion object {
        private const val TAG = "CallSyncWorker"
        private const val WORK_NAME = "call_sync_worker"

        fun schedule(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val workRequest = PeriodicWorkRequestBuilder<CallSyncWorker>(
                15, TimeUnit.MINUTES,  // minimum interval for periodic work
                5, TimeUnit.MINUTES     // flex interval
            )
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                workRequest
            )
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
        }
    }
}
