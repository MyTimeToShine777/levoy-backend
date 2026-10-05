package com.levoy.app.sync

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.levoy.app.data.Api
import com.levoy.app.data.ApiException
import com.levoy.app.data.Session
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Premium "automatic backup": once a day the phone saves a copy of the person's call history to
 * files/backups/. Android's own Auto Backup (see res/xml/backup_rules.xml) carries that folder — and only that
 * folder, never the sign-in token — to the person's Google Drive and puts it back on a new phone.
 */
object AutoBackup {
    private fun file(c: Context) = File(File(c.filesDir, "backups").apply { mkdirs() }, "levoy-calls.json")

    fun read(c: Context): Pair<String, Long>? = file(c).takeIf { it.exists() && it.length() > 20 }?.let { it.readText() to it.lastModified() }

    suspend fun run(c: Context, session: Session, api: Api): Boolean {
        if (session.token == null) return false
        return try {
            val json = api.backup()                                     // 402 on Free: nothing is stored
            file(c).writeText(json)
            true
        } catch (e: ApiException) { false } catch (e: Exception) { false }
    }

    fun schedule(c: Context) {
        val req = PeriodicWorkRequestBuilder<BackupWorker>(1, TimeUnit.DAYS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
        WorkManager.getInstance(c).enqueueUniquePeriodicWork("auto-backup", ExistingPeriodicWorkPolicy.KEEP, req)
    }

    fun cancel(c: Context) { WorkManager.getInstance(c).cancelUniqueWork("auto-backup"); file(c).delete() }
}

class BackupWorker(c: Context, p: WorkerParameters) : CoroutineWorker(c, p) {
    override suspend fun doWork(): Result {
        val s = Session(applicationContext)
        AutoBackup.run(applicationContext, s, Api(s))
        return Result.success()
    }
}
