package com.levoy.app.data

import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
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
    val endNotice: String? get() = when {
        reason == "workspace_suspended" -> "This workspace is suspended. Contact support."
        code == 401 -> "Your sign-in ended. Sign in again to keep your calls syncing."
        else -> null
    }
}

class Api(private val session: Session) {
    private companion object { val refreshLock = Mutex() }      // shared by every Api object (the screens and the background sync)
    private val gson = Gson()
    /** Only for bodies where an explicit null means something (clearing a lead's call status). */
    private val gsonNulls = GsonBuilder().serializeNulls().create()
    private val json = "application/json; charset=utf-8".toMediaType()
    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS).readTimeout(60, TimeUnit.SECONDS).writeTimeout(60, TimeUnit.SECONDS).build()

    private fun enc(v: String) = URLEncoder.encode(v, "UTF-8")
    fun query(params: Map<String, Any?>): String =
        params.entries.filter { it.value != null && it.value.toString().isNotEmpty() }.joinToString("&") { "${enc(it.key)}=${enc(it.value.toString())}" }

    // ── staying signed in ──
    // The sign-in token is short. When it runs out the server says 401; the long-lived refresh key then buys a new pair of tokens
    // and the request is tried once more, so the person (and the background sync) never notice.
    private suspend fun <T> retryAfterRefresh(call: suspend () -> T): T {
        val sentWith = session.token
        try { return call() } catch (e: ApiException) {
            if (e.code != 401 || session.refreshToken == null || !refreshSession(sentWith)) throw e
            return call()
        }
    }

    /** True when there is a working sign-in again. Only one refresh runs at a time; the others wait and then use its result. */
    private suspend fun refreshSession(failedToken: String?): Boolean = refreshLock.withLock {
        if (session.token != failedToken) return@withLock session.token != null        // someone else refreshed while we waited
        val key = session.refreshToken ?: return@withLock false
        try {
            val r: Refreshed = gson.fromJson(send("POST", "/auth/refresh", mapOf("refresh_token" to key)), Refreshed::class.java)
            session.token = r.access_token; session.refreshToken = r.refresh_token
            true
        } catch (e: ApiException) {
            // 401/403: the key itself was refused, so the sign-in is over. Anything else (no internet, server busy) keeps the sign-in for next time.
            if (e.code == 401 || e.code == 403) false else throw e
        }
    }

    private suspend fun raw(method: String, path: String, body: Any? = null, authToken: String? = null, nulls: Boolean = false): String =
        if (authToken != null) send(method, path, body, authToken, nulls) else retryAfterRefresh { send(method, path, body, null, nulls) }

    private suspend fun send(method: String, path: String, body: Any? = null, authToken: String? = null, nulls: Boolean = false): String = withContext(Dispatchers.IO) {
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
    suspend fun verifyOtp(email: String, otp: String): AuthResponse = call("POST", "/auth/verify-otp", mapOf("email" to email, "otp" to otp, "refresh" to true))
    /** Signing out: tell the server to cancel this sign-in's refresh key (best effort; the phone forgets it either way). */
    suspend fun endSession(refreshKey: String) { raw("POST", "/auth/logout", mapOf("refresh_token" to refreshKey), authToken = "") }

    // ── leads ──
    suspend fun leads(params: Map<String, Any?>): List<LeadRow> = call("GET", "/leads?${query(params)}")
    suspend fun lead(id: Int): LeadRow = call("GET", "/leads/$id")
    /**
     * The phone numbers (last 10 digits) of the leads assigned to this person. These are the ONLY calls the app reads from the phone and
     * uploads: the rest of the call log is never touched. Throws if the leads cannot be loaded, so a failure never means "upload everything".
     */
    suspend fun myLeadNumbers(): Set<String> {
        val out = HashSet<String>()
        val names = HashMap<String, String>()
        var offset = 0
        while (offset < 20_000) {
            val page = leads(mapOf("assigned" to "mine", "limit" to 500, "offset" to offset))
            page.forEach { l -> phoneKeyOf(l.phone)?.let { k -> out.add(k); if (l.name.isNotBlank()) names.putIfAbsent(k, l.name) } }
            if (page.size < 500) break
            offset += 500
        }
        session.leadNames = names          // so the call screen can show who is being called
        return out
    }
    suspend fun statusRules(): StatusRules = call("GET", "/leads/status-rules")
    suspend fun updateLead(id: Int, body: Map<String, Any?>) { raw("PUT", "/leads/$id", body, nulls = true) }

    // ── calls ──
    // A call to a lead who is not saved in the phone has no contact name. Use the assigned lead's name for it, so it is never shown as "Unknown".
    private fun nameOrLead(contactName: String?, number: String?): String? = contactName?.takeIf { it.isNotBlank() } ?: session.leadNameFor(number)

    suspend fun history(params: Map<String, Any?>): HistoryResponse {
        val h: HistoryResponse = call("GET", "/call-history?${query(params)}")
        return h.copy(
            rows = h.rows.map { r -> if (r.lead == null) r.copy(contact_name = nameOrLead(r.contact_name, r.phone_number)) else r },
            groups = h.groups?.map { g -> g.copy(contact_name = nameOrLead(g.contact_name, g.phone_number)) },
        )
    }
    /** `received` = stored as new; `duplicates` = the server already had them; `ignored` = not calls to this person's leads. */
    data class UploadResult(val received: Int, val duplicates: Int, val ignored: Int)
    suspend fun uploadCalls(events: List<Map<String, Any?>>): UploadResult {
        val reply = gson.fromJson(raw("POST", "/calls/batch", mapOf("events" to events)), Map::class.java)
        fun n(k: String) = (reply?.get(k) as? Double)?.toInt() ?: 0
        return UploadResult(n("received"), n("duplicates"), n("ignored"))
    }
    /** Attach a finished call recording (m4a) to a call the server already holds. */
    private fun audioType(f: java.io.File) = when (f.extension.lowercase()) {
        "mp3" -> "audio/mpeg"; "amr" -> "audio/amr"; "3gp" -> "audio/3gpp"; "ogg" -> "audio/ogg"; "wav" -> "audio/wav"; else -> "audio/mp4"
    }
    suspend fun uploadRecording(callId: Int, file: java.io.File, durationSeconds: Int) = retryAfterRefresh { withContext(Dispatchers.IO) {
        val body = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("duration", durationSeconds.toString())
            .addFormDataPart("recording", file.name, file.asRequestBody(audioType(file).toMediaType())).build()
        val req = Request.Builder().url("${session.serverUrl}/calls/$callId/recordings").header("Authorization", "Bearer ${session.token}").post(body).build()
        val res = try { client.newCall(req).execute() } catch (e: Exception) { throw ApiException("Cannot reach the server. Check your connection.", 0) }
        res.use {
            if (!it.isSuccessful) {
                val map = runCatching { gson.fromJson(it.body?.string().orEmpty(), Map::class.java) }.getOrNull()
                throw ApiException((map?.get("detail") as? String) ?: "Upload failed (${it.code})", it.code)
            }
        }
    } }
    suspend fun annotate(callId: Int, notes: String, tags: List<String>) { raw("PUT", "/call-history/$callId/annotate", mapOf("notes" to notes, "tags" to tags)) }
    suspend fun tags(): List<Tag> = call("GET", "/call-history/tags")

    // ── analytics ──
    suspend fun summary(params: Map<String, Any?>): Summary = call("GET", "/call-analytics/summary?${query(params)}")

    suspend fun analysis(params: Map<String, Any?>): Analysis = call("GET", "/call-analytics/analysis?${query(params)}")

    // ── contacts ──
    suspend fun contacts(params: Map<String, Any?>): ContactsResponse {
        val c: ContactsResponse = call("GET", "/contacts?${query(params)}")
        return c.copy(rows = c.rows.map { it.copy(contact_name = nameOrLead(it.contact_name, it.phone_number)) })
    }
    suspend fun contact(phoneKey: String, params: Map<String, Any?>): ContactDetail {
        val d: ContactDetail = call("GET", "/contacts/$phoneKey?${query(params)}")
        return d.copy(contact = d.contact.copy(contact_name = nameOrLead(d.contact.contact_name, d.contact.phone_number)))
    }
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
    suspend fun downloadExport(id: Int): ByteArray = retryAfterRefresh { withContext(Dispatchers.IO) {
        val req = Request.Builder().url("${session.serverUrl}/call-exports/$id/file").header("Authorization", "Bearer ${session.token}").build()
        client.newCall(req).execute().use { if (!it.isSuccessful) throw ApiException("Download failed", it.code); it.body!!.bytes() }
    } }
    suspend fun backup(): String = raw("GET", "/call-exports/backup")
    suspend fun restore(backupJson: String): Map<String, Any?> = gson.fromJson(raw("POST", "/call-exports/restore", gson.fromJson(backupJson, Map::class.java)), Map::class.java) as Map<String, Any?>
    suspend fun consent(): Consent = call("GET", "/users/me/consent")
    suspend fun acceptConsent() { raw("POST", "/users/me/consent") }
    suspend fun deleteAccount(email: String) { raw("DELETE", "/users/me", mapOf("email" to email)) }
}
