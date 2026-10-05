
package com.levoy.app.calllog

import android.database.ContentObserver // FIX: Package changed from android.content to android.database
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.levoy.app.model.CallEventUpload
import com.levoy.app.network.ApiClient
import com.levoy.app.network.TokenStorage
import java.text.SimpleDateFormat
import java.util.*

/**
 * Core class: reads Android call log and uploads to backend.
 *
 * Strategy: Uses ContentObserver on CallLog.Calls content URI to get real-time
 * notifications of new/changed calls, then fetches the call details from the
 * content provider.
 *
 * Fallback: If ContentObserver isn't sufficient, uses WorkManager periodic sync
 * to poll for new calls since last sync.
 */
class CallLogTracker private constructor(private val context: Context) {

    companion object {
        @Volatile
        private var instance: CallLogTracker? = null

        fun getInstance(context: Context): CallLogTracker {
            return instance ?: synchronized(this) {
                instance ?: CallLogTracker(context.applicationContext).also { instance = it }
            }
        }
    }

    private val api: ApiClient = ApiClient(context)
    private val tokenStorage = TokenStorage.getInstance(context)
    private val dateFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)

    // Track last sync timestamp to avoid re-uploading
    private var lastSyncTimestamp: Long = 0L

    private val callLogObserver = CallLogContentObserver(context, Handler(Looper.getMainLooper()))

    fun startTracking() {
        context.contentResolver.registerContentObserver(
            Uri.parse("content://com.android.contacts/call_log"),
            false,
            callLogObserver
        )
        // Also observe the standard call log URI
        context.contentResolver.registerContentObserver(
            Uri.parse("content://call_log/calls"),
            false,
            callLogObserver
        )
        // Initial sync of existing calls
        syncExistingCalls()
    }

    fun stopTracking() {
        context.contentResolver.unregisterContentObserver(callLogObserver)
    }

    /**
     * Called when call log changes. Picks up new/modified calls and queues them.
     * Public because CallLogReceiver (a different package) triggers it on IDLE.
     */
    fun onCallLogChanged() {
        val pendingCalls = fetchNewCalls()
        if (pendingCalls.isEmpty()) return
        // Queue for background upload
        CallUploadQueue.getInstance(context).addCalls(pendingCalls)
        // Try immediate upload if online
        if (tokenStorage.getToken() != null) {
            uploadPendingCalls()
        }
    }

    /**
     * Fetch calls newer than lastSyncTimestamp.
     * Uses the Android CallLog.Calls content provider.
     */
    private fun fetchNewCalls(): List<CallEventUpload> {
        val calls = mutableListOf<CallEventUpload>()

        // Android's CallLog.Calls has NO "status" column — it was never part of
        // the public API. Requesting it makes contentResolver.query() throw on
        // most devices, so the cursor dies before a single row is read and the
        // app silently uploads nothing, forever. Only real columns go in the
        // projection here; call status is derived from TYPE alone.
        val projection = arrayOf(
            CallsColumns._ID,
            CallsColumns.NUMBER,
            CallsColumns.DATE,
            CallsColumns.DURATION,
            CallsColumns.TYPE,
            CallsColumns.NAME
        )

        val cursor: Cursor? = try {
            context.contentResolver.query(
                Uri.parse("content://call_log/calls"),
                projection,
                "${CallsColumns.DATE} >= ?",
                arrayOf(lastSyncTimestamp.toString()),
                "${CallsColumns.DATE} DESC"
            )
        } catch (e: SecurityException) {
            // Permission not granted
            Log.e("CallLogTracker", "READ_CALL_LOG permission not granted", e)
            null
        } catch (e: IllegalArgumentException) {
            // Thrown when any requested column is unknown to this provider.
            Log.e("CallLogTracker", "Call log provider rejected the projection", e)
            null
        } catch (e: Exception) {
            Log.e("CallLogTracker", "Call log query failed", e)
            null
        }

        cursor?.use { c ->
            // getColumnIndex, not ...OrThrow: OEM providers legitimately omit
            // columns and a throw here would discard the whole sync.
            val idCol = c.getColumnIndex(CallsColumns._ID)
            val numberCol = c.getColumnIndex(CallsColumns.NUMBER)
            val dateCol = c.getColumnIndex(CallsColumns.DATE)
            val durationCol = c.getColumnIndex(CallsColumns.DURATION)
            val typeCol = c.getColumnIndex(CallsColumns.TYPE)
            val nameCol = c.getColumnIndex(CallsColumns.NAME)

            // Without these three a row cannot become a call event at all.
            if (numberCol < 0 || dateCol < 0 || typeCol < 0) {
                Log.e(
                    "CallLogTracker",
                    "Call log missing required columns " +
                        "(number=$numberCol date=$dateCol type=$typeCol) - skipping"
                )
                return calls
            }

            while (c.moveToNext()) {
                val number = c.getString(numberCol) ?: ""
                val date = c.getLong(dateCol)
                val duration = if (durationCol >= 0) c.getInt(durationCol) else 0
                val type = c.getInt(typeCol) // 1=incoming, 2=outgoing, 3=missed, 5=rejected
                val name = if (nameCol >= 0) c.getString(nameCol) else null

                // Map Android call type to our direction/status
                val (direction, callStatus) = mapCallType(type, 0)

                val event = CallEventUpload(
                    phone_number = normalizePhoneNumber(number),
                    direction = direction,
                    status = callStatus,
                    duration_seconds = duration,
                    timestamp = dateFormat.format(Date(date)),
                    caller_id = name,
                    is_pinned = false
                )
                calls.add(event)

                // Update last sync timestamp
                if (date > lastSyncTimestamp) {
                    lastSyncTimestamp = date
                }
            }
        }
        return calls
    }

    /**
     * Maps Android call log types/statuses to our schema.
     *
     * Android Types:
     *   INCOMING = 1
     *   OUTGOING = 2
     *   MISSED = 3
     *   VOICEMAIL = 4
     *   REJECTED = 5
     *   BLOCKED = 6
     *   ANSWER = 7
     *
     * The [status] parameter is the CallLog.Calls.STATUS value where one is
     * available. It is 0 (IDLE) from the projection today, because that column
     * cannot be requested — see the note on [CallsColumns]. The branch below is
     * retained so that if a future provider version does expose it, the
     * mapping is already correct.
     */
    private fun mapCallType(type: Int, status: Int): Pair<String, String> {
        val direction = when (type) {
            CallsColumns.TYPE_INCOMING -> "incoming"
            CallsColumns.TYPE_OUTGOING -> "outgoing"
            CallsColumns.TYPE_MISSED -> "incoming"  // missed is still incoming direction
            CallsColumns.TYPE_REJECTED -> "outgoing" // rejected is outgoing direction
            CallsColumns.TYPE_BLOCKED -> "outgoing"
            else -> "outgoing"
        }

        val callStatus = when {
            type == CallsColumns.TYPE_MISSED -> "missed"
            type == CallsColumns.TYPE_REJECTED -> "rejected"
            type == CallsColumns.TYPE_BLOCKED -> "rejected"
            status == CallsColumns.CALL_STATUS_MISSED -> "missed"
            status == CallsColumns.CALL_STATUS_NO_ANSWER -> "no_answer"
            status == CallsColumns.CALL_STATUS_REJECTED -> "rejected"
            else -> "connected"
        }

        return Pair(direction, callStatus)
    }

    private fun normalizePhoneNumber(number: String): String {
        // Remove extensions, special chars, keep digits and +
        return number.replace(Regex("[^\\d+]"), "").take(20)
    }

    /**
     * Syncs all existing calls from the device (first-time setup).
     */
    fun syncExistingCalls() {
        lastSyncTimestamp = 0L
        val calls = fetchNewCalls()
        if (calls.isNotEmpty()) {
            CallUploadQueue.getInstance(context).addCalls(calls)
            uploadPendingCalls()
        }
    }

    /**
     * Uploads queued calls to the backend.
     */
    fun uploadPendingCalls(): Int {
        val queue = CallUploadQueue.getInstance(context)
        val pending = queue.getPendingCalls()
        if (pending.isEmpty()) {
            Log.d("CallLogTracker", "uploadPendingCalls: queue empty, nothing to do")
            return 0
        }
        if (tokenStorage.getToken() == null) {
            // Not logged in — can't upload. This is the most common reason a
            // fresh install shows an empty dashboard, so make it loud.
            Log.w("CallLogTracker", "uploadPendingCalls: ${pending.size} calls queued but no token - user not logged in")
            return 0
        }

        val result = api.uploadCallBatch(pending)
        if (result.isSuccess) {
            queue.markAsSynced(pending.size)
            val stats = result.getOrNull()
            val received = stats?.get("received")
            Log.d("CallLogTracker", "uploadPendingCalls: uploaded $received of ${pending.size}")
            return pending.size
        } else {
            Log.e("CallLogTracker", "uploadPendingCalls FAILED: ${result.exceptionOrNull()?.message}")
            return 0
        }
    }

    /**
     * Periodic full sync (called by WorkManager).
     */
    fun fullSync(): Int {
        // Re-sync everything since lastSyncTimestamp
        val calls = fetchNewCalls()
        if (calls.isNotEmpty()) {
            CallUploadQueue.getInstance(context).addCalls(calls)
        }
        return uploadPendingCalls()
    }
}

// Inner helper classes
private class CallLogContentObserver(
    private val context: Context,
    handler: Handler
) : ContentObserver(handler) {

    override fun onChange(selfChange: Boolean, uri: Uri?) {
        super.onChange(selfChange, uri)
        // Small delay to let the call log entry fully write
        val handler = Handler(Looper.getMainLooper())

        handler.post{
            CallLogTracker.getInstance(context).onCallLogChanged()
        }
    }

    override fun onChange(selfChange: Boolean) {
        onChange(selfChange, null)
    }
}

/**
 * Column-name constants for content://call_log/calls.
 *
 * There is deliberately NO `status` constant here. android.provider.CallLog
 * never exposed a STATUS column on this provider; requesting one makes
 * contentResolver.query() throw IllegalArgumentException and the sync silently
 * returns nothing. Status is derived from TYPE in [mapCallType] instead.
 */
object CallsColumns {
    val _ID = "_id"
    val NUMBER = "number"
    val DATE = "date"
    val DURATION = "duration"
    val TYPE = "type"
    val NAME = "name"

    const val TYPE_INCOMING = 1
    const val TYPE_OUTGOING = 2
    const val TYPE_MISSED = 3
    const val TYPE_VOICEMAIL = 4
    const val TYPE_REJECTED = 5
    const val TYPE_BLOCKED = 6
    const val TYPE_ANSWER = 7

    const val CALL_STATUS_IDLE = 0
    const val CALL_STATUS_IN_PROGRESS = 1
    const val CALL_STATUS_OFFHOOK = 2
    const val CALL_STATUS_RUNNING = 3
    const val CALL_STATUS_UNKNOWN = 4
    const val CALL_STATUS_MISSED = 5
    const val CALL_STATUS_NO_ANSWER = 6
    const val CALL_STATUS_REJECTED = 7
    const val CALL_STATUS_COMPLETED = 8
}
