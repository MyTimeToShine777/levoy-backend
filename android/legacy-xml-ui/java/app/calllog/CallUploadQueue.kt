
package com.levoy.app.calllog

import android.content.Context
import android.content.SharedPreferences
import com.levoy.app.model.CallEventUpload
import java.util.concurrent.ConcurrentLinkedQueue

/**
 * In-memory + persisted queue of call events waiting to be uploaded.
 * Persists to SharedPreferences for durability across app restarts.
 */
class CallUploadQueue private constructor(private val context: Context) {

    companion object {
        @Volatile
        private var instance: CallUploadQueue? = null

        fun getInstance(context: Context): CallUploadQueue {
            return instance ?: synchronized(this) {
                instance ?: CallUploadQueue(context.applicationContext).also { instance = it }
            }
        }
    }

    private val prefs = context.getSharedPreferences("call_queue", Context.MODE_PRIVATE)
    private val pendingCalls = ConcurrentLinkedQueue<CallEventUpload>()

    init {
        // Load persisted queue from disk
        val stored = prefs.getString("pending_calls", null)
        stored?.let {
            val list = com.google.gson.Gson().fromJson(it, Array<CallEventUpload>::class.java)
            list.forEach { pendingCalls.add(it) }
        }
    }

    fun addCalls(calls: List<CallEventUpload>) {
        calls.forEach { pendingCalls.add(it) }
        persistQueue()
    }

    fun getPendingCalls(): List<CallEventUpload> {
        return pendingCalls.toList()
    }

    fun markAsSynced(count: Int) {
        repeat(count) {
            pendingCalls.poll()
        }
        persistQueue()
    }

    fun clear() {
        pendingCalls.clear()
        prefs.edit().remove("pending_calls").apply()
    }

    private fun persistQueue() {
        val json = com.google.gson.Gson().toJson(pendingCalls.toList())
        prefs.edit().putString("pending_calls", json).apply()
    }

    fun size(): Int = pendingCalls.size
}
