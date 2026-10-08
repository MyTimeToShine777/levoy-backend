package com.levoy.app.data

import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

/** An error response. `plan` is set on a 402: the feature needs a higher plan. */
class ApiException(message: String, val code: Int, val plan: String? = null, val reason: String? = null) : Exception(message) {
    /** The session is over: the token expired, or the company was suspended by the platform owner. */
    val sessionEnded: Boolean get() = code == 401 || reason == "workspace_suspended"
    /** What to tell the person on the login screen afterwards (null = nothing special). */
    val endNotice: String? get() = if (reason == "workspace_suspended") "This workspace is suspended. Contact support." else null
}

class Api(private val session: Session) {
    private val gson = Gson()
    /** Only for bodies where an explicit null means something (clearing a lead's call status). */
    private val gsonNulls = GsonBuilder().serializeNulls().create()
    private val json = "application/json; charset=utf-8".toMediaType()
    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS).readTimeout(60, TimeUnit.SECONDS).writeTimeout(60, TimeUnit.SECONDS).build()

    private fun enc(v: String) = URLEncoder.encode(v, "UTF-8")
    fun query(params: Map<String, Any?>): String =
        params.entries.filter { it.value != null && it.value.toString().isNotEmpty() }.joinToString("&") { "${enc(it.key)}=${enc(it.value.toString())}" }

    private suspend fun raw(method: String, path: String, body: Any? = null, authToken: String? = null, nulls: Boolean = false): String = withContext(Dispatchers.IO) {
        val b = when {
            body != null -> (if (nulls) gsonNulls else gson).toJson(body).toRequestBody(json)
            method != "GET" && method != "DELETE" -> "{}".toRequestBody(json)
            else -> null
        }
        val req = Request.Builder().url(session.serverUrl + path).method(method, b).apply {
            (authToken ?: session.token)?.let { header("Authorization", "Bearer $it") }
        }.build()
        val res = try { client.newCall(req).execute() } catch (e: Exception) { throw ApiException("Cannot reach the server. Check your connection.", 0) }
        res.use {
            val text = it.body?.string().orEmpty()
            if (it.isSuccessful) return@withContext text
            val map = runCatching { gson.fromJson(text, Map::class.java) }.getOrNull()
            val detail = (map?.get("detail") as? String) ?: "Request failed (${it.code})"
            throw ApiException(detail, it.code, map?.get("required_plan_name") as? String, map?.get("code") as? String)
        }
    }

    private suspend inline fun <reified T> call(method: String, path: String, body: Any? = null): T =
        gson.fromJson(raw(method, path, body), object : TypeToken<T>() {}.type)

    // ── auth ──
    // Sign-in is by an emailed 6-digit code (no passwords): ask for it, then submit it.
    suspend fun sendOtp(email: String): OtpSent = call("POST", "/auth/send-otp", mapOf("email" to email))
    suspend fun verifyOtp(email: String, otp: String): AuthResponse = call("POST", "/auth/verify-otp", mapOf("email" to email, "otp" to otp))

    // ── leads ──
    suspend fun leads(params: Map<String, Any?>): List<LeadRow> = call("GET", "/leads?${query(params)}")
    suspend fun lead(id: Int): LeadRow = call("GET", "/leads/$id")
    suspend fun statusRules(): StatusRules = call("GET", "/leads/status-rules")
    suspend fun updateLead(id: Int, body: Map<String, Any?>) { raw("PUT", "/leads/$id", body, nulls = true) }

    // ── calls ──
    suspend fun history(params: Map<String, Any?>): HistoryResponse = call("GET", "/call-history?${query(params)}")
    suspend fun uploadCalls(events: List<Map<String, Any?>>) { raw("POST", "/calls/batch", mapOf("events" to events)) }
    suspend fun annotate(callId: Int, notes: String, tags: List<String>) { raw("PUT", "/call-history/$callId/annotate", mapOf("notes" to notes, "tags" to tags)) }
    suspend fun tags(): List<Tag> = call("GET", "/call-history/tags")

    // ── analytics ──
    suspend fun summary(params: Map<String, Any?>): Summary = call("GET", "/call-analytics/summary?${query(params)}")

    suspend fun analysis(params: Map<String, Any?>): Analysis = call("GET", "/call-analytics/analysis?${query(params)}")

    // ── contacts ──
    suspend fun contacts(params: Map<String, Any?>): ContactsResponse = call("GET", "/contacts?${query(params)}")
    suspend fun contact(phoneKey: String, params: Map<String, Any?>): ContactDetail = call("GET", "/contacts/$phoneKey?${query(params)}")
    suspend fun compare(phones: List<String>, params: Map<String, Any?>): List<CompareRow> =
        call("GET", "/contacts/compare?${query(params + mapOf("phones" to phones.joinToString(",")))}")
    suspend fun groups(): List<GroupRef> = call("GET", "/contact-groups")
    suspend fun createGroup(name: String): GroupRef = call("POST", "/contact-groups", mapOf("name" to name))
    suspend fun addToGroup(groupId: Int, phoneKey: String) { raw("POST", "/contact-groups/$groupId/members", mapOf("phones" to listOf(phoneKey))) }

    // ── plan ──
    suspend fun plan(): PlanState = call("GET", "/plan")
    suspend fun startTrial(plan: String): PlanState = call("POST", "/plan/trial", mapOf("plan" to plan))
    /** Stripe Checkout: a hosted payment page to open in the browser. It returns to the app through levoy://premium. */
    suspend fun checkout(plan: String, months: Int): Checkout = call("POST", "/plan/checkout", mapOf("plan" to plan, "months" to months, "return_url" to "levoy://premium"))

    // ── push ──
    suspend fun registerPush(token: String, deviceName: String) { raw("POST", "/push/tokens", mapOf("token" to token, "device_name" to deviceName, "platform" to "android")) }
    suspend fun unregisterPush(token: String, authToken: String) { raw("DELETE", "/push/tokens", mapOf("token" to token), authToken) }

    // ── SIMs, device, reminders ──
    suspend fun sims(): List<Sim> = call("GET", "/sims")
    suspend fun saveSim(slot: Int, body: Map<String, Any?>): Sim = call("PUT", "/sims/$slot", body)
    suspend fun deviceStatus(body: Map<String, Any?>) { raw("POST", "/device/status", body) }
    suspend fun reminders(): List<Reminder> = call("GET", "/call-reminders?done=false")
    suspend fun addReminder(phone: String, note: String, remindAtIso: String?) {
        raw("POST", "/call-reminders", mapOf("phone_number" to phone, "note" to note, "remind_at" to remindAtIso))
    }
    suspend fun finishReminder(id: Int) { raw("PUT", "/call-reminders/$id", mapOf("done" to true)) }

    // ── Quick Call (browser → this phone) ──
    suspend fun linkPhone(name: String) { raw("POST", "/quick-call/devices", mapOf("device_name" to name)) }
    suspend fun unlinkPhone(name: String) { raw("DELETE", "/quick-call/devices?device_name=${enc(name)}") }
    suspend fun quickPending(name: String, waitSeconds: Int): QuickPending = call("GET", "/quick-call/pending?device_name=${enc(name)}&wait=$waitSeconds")

    // ── missing details, workspace links ──
    suspend fun backfill(events: List<Map<String, Any?>>): BackfillResult = call("POST", "/calls/backfill", mapOf("events" to events))
    suspend fun workspace(): WorkspaceSettings = call("GET", "/workspace-settings")

    // ── export, backup, account ──
    suspend fun exportReport(params: Map<String, Any?>): ExportResult = call("POST", "/call-exports/report", params)
    suspend fun downloadExport(id: Int): ByteArray = withContext(Dispatchers.IO) {
        val req = Request.Builder().url("${session.serverUrl}/call-exports/$id/file").header("Authorization", "Bearer ${session.token}").build()
        client.newCall(req).execute().use { if (!it.isSuccessful) throw ApiException("Download failed", it.code); it.body!!.bytes() }
    }
    suspend fun backup(): String = raw("GET", "/call-exports/backup")
    suspend fun restore(backupJson: String): Map<String, Any?> = gson.fromJson(raw("POST", "/call-exports/restore", gson.fromJson(backupJson, Map::class.java)), Map::class.java) as Map<String, Any?>
    suspend fun consent(): Consent = call("GET", "/users/me/consent")
    suspend fun acceptConsent() { raw("POST", "/users/me/consent") }
    suspend fun deleteAccount(email: String) { raw("DELETE", "/users/me", mapOf("email" to email)) }
}
