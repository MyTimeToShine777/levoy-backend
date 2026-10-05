package com.levoy.app

import android.app.Application
import android.database.ContentObserver
import android.os.Handler
import android.os.Looper
import android.provider.CallLog
import com.levoy.app.data.Session
import com.levoy.app.sync.CallLogReader
import com.levoy.app.sync.CallSync

class LevoyApp : Application() {
    override fun onCreate() {
        super.onCreate()
        com.levoy.app.push.Push.ensureChannel(this)
        val session = Session(this)
        if (session.token != null && CallLogReader.canReadLog(this)) {
            CallSync.schedulePeriodic(this)
            // a new call changes the log: sync shortly after, once, even if several calls land together
            contentResolver.registerContentObserver(CallLog.Calls.CONTENT_URI, true, object : ContentObserver(Handler(Looper.getMainLooper())) {
                override fun onChange(selfChange: Boolean) { if (Session(this@LevoyApp).token != null) CallSync.syncSoon(this@LevoyApp) }
            })
        }
    }
}
