package com.levoy.app.sync

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.CallLog
import android.provider.ContactsContract
import android.net.Uri
import android.telephony.SubscriptionManager
import androidx.core.content.ContextCompat
import java.time.Instant

/** One call as read from the phone's call log, already in the shape the server's /calls/batch expects. */
data class DeviceCall(
    val date: Long,
    val number: String,
    val name: String?,
    val direction: String,
    val status: String,
    val seconds: Int,
    val simSlot: Int?,
    val simLabel: String?,
) {
    fun toEvent(): Map<String, Any?> = mapOf(
        "phone_number" to number, "direction" to direction, "status" to status, "duration_seconds" to seconds,
        "timestamp" to Instant.ofEpochMilli(date).toString(), "caller_id" to name, "source" to "sim", "sim_slot" to simSlot, "sim_label" to simLabel,
    )
}

/** A call-log row exactly as the phone stores it, for the "Check last 7 days" report. */
data class RawCall(val date: Long, val number: String, val seconds: Int, val type: Int, val features: Int)

data class DeviceSim(val slot: Int, val label: String, val subscriptionId: Int, val iccId: String?, val number: String?)

object CallLogReader {
    fun has(context: Context, permission: String) = ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
    fun canReadLog(context: Context) = has(context, Manifest.permission.READ_CALL_LOG)

    /** The SIM cards currently in the phone. Needs READ_PHONE_STATE; returns an empty list without it. */
    @Suppress("MissingPermission")
    fun sims(context: Context): List<DeviceSim> {
        if (!has(context, Manifest.permission.READ_PHONE_STATE)) return emptyList()
        return runCatching {
            val sm = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager
            sm.activeSubscriptionInfoList.orEmpty().map { i ->
                val label = listOfNotNull(i.displayName?.toString()?.takeIf { it.isNotBlank() }, i.carrierName?.toString()?.takeIf { it.isNotBlank() }).distinct().joinToString(" | ").ifBlank { "SIM ${i.simSlotIndex + 1}" }
                DeviceSim(i.simSlotIndex + 1, label, i.subscriptionId, i.iccId, runCatching { i.number }.getOrNull()?.takeIf { it.isNotBlank() })
            }.sortedBy { it.slot }
        }.getOrDefault(emptyList())
    }

    /** Android's own call-type codes → our (direction, status). Voicemail and unknown types are skipped (null). */
    fun classify(type: Int): Pair<String, String>? = when (type) {
        CallLog.Calls.INCOMING_TYPE, CallLog.Calls.ANSWERED_EXTERNALLY_TYPE -> "incoming" to "connected"
        CallLog.Calls.OUTGOING_TYPE -> "outgoing" to "connected"
        CallLog.Calls.MISSED_TYPE -> "incoming" to "missed"
        CallLog.Calls.REJECTED_TYPE, CallLog.Calls.BLOCKED_TYPE -> "incoming" to "rejected"
        else -> null
    }

    /** Calls newer than `afterMillis` (exclusive), oldest first. */
    /** `only`: when given, calls to any other number are skipped before anything else is read about them. */
    fun read(context: Context, afterMillis: Long, limit: Int = 5000, only: Set<String>? = null): List<DeviceCall> {
        if (!canReadLog(context)) return emptyList()
        val sims = sims(context)
        val out = ArrayList<DeviceCall>()
        val names = HashMap<String, String?>()      // one contacts lookup per number, not one per call
        val cols = arrayOf(CallLog.Calls.NUMBER, CallLog.Calls.DATE, CallLog.Calls.DURATION, CallLog.Calls.TYPE, CallLog.Calls.CACHED_NAME, CallLog.Calls.PHONE_ACCOUNT_ID)
        val cursor = try {
            context.contentResolver.query(CallLog.Calls.CONTENT_URI, cols, "${CallLog.Calls.DATE} > ?", arrayOf(afterMillis.toString()), "${CallLog.Calls.DATE} ASC")
        } catch (e: SecurityException) { null } catch (e: Exception) { null }
        cursor?.use { c ->
            val iNumber = c.getColumnIndex(CallLog.Calls.NUMBER); val iDate = c.getColumnIndex(CallLog.Calls.DATE)
            val iDur = c.getColumnIndex(CallLog.Calls.DURATION); val iType = c.getColumnIndex(CallLog.Calls.TYPE)
            val iName = c.getColumnIndex(CallLog.Calls.CACHED_NAME); val iAcc = c.getColumnIndex(CallLog.Calls.PHONE_ACCOUNT_ID)
            if (iNumber < 0 || iDate < 0 || iType < 0) return emptyList()
            while (c.moveToNext() && out.size < limit) {
                val (direction, typeStatus) = classify(c.getInt(iType)) ?: continue
                val seconds = if (iDur >= 0) c.getInt(iDur) else 0
                // "Connected" means someone spoke. A call that lasted 0 seconds was not answered, whatever its type says.
                val status = if (typeStatus == "connected" && seconds <= 0) (if (direction == "incoming") "missed" else "unanswered") else typeStatus
                val number = c.getString(iNumber)?.replace(Regex("[^\\d+]"), "")?.take(20).orEmpty()
                if (only != null && com.levoy.app.data.phoneKeyOf(number) !in only) continue      // not one of this person's leads
                if (number.isEmpty()) continue            // private / hidden numbers cannot be attributed to a person
                val acc = if (iAcc >= 0) c.getString(iAcc) else null
                val sim = sims.firstOrNull { acc != null && (acc == it.subscriptionId.toString() || acc == it.iccId) } ?: if (sims.size == 1) sims[0] else null
                val name = (if (iName >= 0) c.getString(iName) else null)?.takeIf { it.isNotBlank() } ?: (if (names.containsKey(number)) names[number] else nameFor(context, number).also { names[number] = it })
                out.add(DeviceCall(c.getLong(iDate), number, name, direction, status, seconds, sim?.slot, sim?.label))
            }
        }
        return out
    }

    /** Every call-log row newer than `afterMillis` to one of the `only` numbers, with its raw call type and features (bit 8 = Wi-Fi call). */
    fun readRaw(context: Context, afterMillis: Long, only: Set<String>): List<RawCall> {
        if (!canReadLog(context)) return emptyList()
        val out = ArrayList<RawCall>()
        val cols = arrayOf(CallLog.Calls.NUMBER, CallLog.Calls.DATE, CallLog.Calls.DURATION, CallLog.Calls.TYPE, CallLog.Calls.FEATURES)
        val cursor = try {
            context.contentResolver.query(CallLog.Calls.CONTENT_URI, cols, "${CallLog.Calls.DATE} > ?", arrayOf(afterMillis.toString()), "${CallLog.Calls.DATE} ASC")
        } catch (e: Exception) {
            // some phones have no FEATURES column: ask again without it
            runCatching { context.contentResolver.query(CallLog.Calls.CONTENT_URI, cols.copyOf(4), "${CallLog.Calls.DATE} > ?", arrayOf(afterMillis.toString()), "${CallLog.Calls.DATE} ASC") }.getOrNull()
        }
        cursor?.use { c ->
            val iNumber = c.getColumnIndex(CallLog.Calls.NUMBER); val iDate = c.getColumnIndex(CallLog.Calls.DATE)
            val iDur = c.getColumnIndex(CallLog.Calls.DURATION); val iType = c.getColumnIndex(CallLog.Calls.TYPE); val iFeat = c.getColumnIndex(CallLog.Calls.FEATURES)
            if (iNumber < 0 || iDate < 0 || iType < 0) return emptyList()
            while (c.moveToNext()) {
                val number = c.getString(iNumber)?.replace(Regex("[^\\d+]"), "")?.take(20).orEmpty()
                if (number.isEmpty() || com.levoy.app.data.phoneKeyOf(number) !in only) continue
                out.add(RawCall(c.getLong(iDate), number, if (iDur >= 0) c.getInt(iDur) else 0, c.getInt(iType), if (iFeat >= 0) c.getInt(iFeat) else 0))
            }
        }
        return out
    }

    /** The saved contact name for a number, or null (also null without the Contacts permission). */
    fun nameFor(context: Context, number: String): String? {
        if (!has(context, Manifest.permission.READ_CONTACTS)) return null
        return runCatching {
            val uri = Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(number))
            context.contentResolver.query(uri, arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME), null, null, null)?.use { if (it.moveToFirst()) it.getString(0) else null }
        }.getOrNull()?.takeIf { it.isNotBlank() }
    }
}
